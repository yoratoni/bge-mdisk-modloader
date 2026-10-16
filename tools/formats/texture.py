"""The textures of the remaster, Virtuos's cooked content followed by Jade's texture header (see "docs/RESEARCH.md").

Layout of an entry, every integer little-endian:
- The cooked content (version 14): set type, map count, compressed format (RGBA8, DXT or ASTC), the size of a map
  with and without alpha, the alpha flag and the mipmap count, then the maps (the albedo, then for texture sets the
  normal, spec/gloss/occlusion and height/emissive maps), then the shader parameters of the set.
- Jade's texture header (32 bytes, at the end in unbinarized data): mark, flags, type (13 = cooked), color format,
  width, height, color, font descriptor key and three check codes.

A few textures aren't cooked (type 1): a plain uncompressed TGA file followed by the texture header.

The pixel data of both is stored bottom-up.
"""

from dataclasses import dataclass

from tools.constants import (
    COOKED_FORMAT_DXT,
    COOKED_FORMAT_NAMES,
    COOKED_FORMAT_RGBA8,
    COOKED_MAP_NAMES,
    COOKED_SET_TYPE_6,
    COOKED_SET_TYPE_CUSTOM,
    COOKED_SET_TYPE_NAMES,
    COOKED_SHADER_NAME_SIZE,
    COOKED_SHADER_PARAMETER,
    COOKED_TEXTURE_HEADER,
    COOKED_TEXTURE_VERSION,
    TEXTURE_FILE_TYPE_COOKED,
    TEXTURE_FILE_TYPE_TGA,
    TEXTURE_HEADER,
    TEXTURE_HEADER_CODES,
    TEXTURE_HEADER_MARK,
)
from tools.formats.dds import PixelFormat


class TextureError(ValueError):
    """An entry that isn't a cooked texture, or whose layout isn't understood."""


@dataclass
class TextureHeader:
    """Jade's texture header, without its mark and check codes."""

    flags: int
    file_type: int
    color_format: int
    width: int
    height: int
    color: int
    font_key: int


@dataclass
class CookedLayout:
    """The fields of the cooked content describing its maps."""

    set_type: int
    map_count: int
    compressed_format: int
    size_with_alpha: int
    size_without_alpha: int
    has_alpha: bool
    mipmap_count: int

    @property
    def stored_map_count(self) -> int:
        """The number of maps stored, a set with a map count of 0 only has its albedo."""
        return max(1, min(self.map_count, len(COOKED_MAP_NAMES)))

    def map_has_alpha(self, index: int) -> bool:
        """Checks whether a map has an alpha channel, only the albedo has one (except in custom sets).

        Args:
            index: The index of the map.

        Returns:
            True if the map has an alpha channel.
        """
        return self.has_alpha and (index == 0 or self.set_type == COOKED_SET_TYPE_CUSTOM)

    def map_size(self, index: int) -> int:
        """Returns the size of a map.

        Args:
            index: The index of the map.

        Returns:
            The size in bytes.
        """
        return self.size_with_alpha if self.map_has_alpha(index) else self.size_without_alpha

    def map_pixel_format(self, index: int) -> PixelFormat:
        """Returns the pixel format of a map, as in a DDS file.

        Args:
            index: The index of the map.

        Returns:
            The pixel format.

        Raises:
            TextureError: If the compressed format can't be held in a DDS file here (ASTC).
        """
        if self.compressed_format == COOKED_FORMAT_DXT:
            return PixelFormat.DXT5 if self.map_has_alpha(index) else PixelFormat.DXT1

        if self.compressed_format == COOKED_FORMAT_RGBA8:
            return PixelFormat.RGBA8

        format_name = COOKED_FORMAT_NAMES.get(self.compressed_format, str(self.compressed_format))
        raise TextureError(f"unsupported compressed format ({format_name})")

    @property
    def shader_parameter_count(self) -> int:
        """The number of shader parameters stored after the maps, one for every known set type but the invalid one,
        two for type 6."""
        if self.set_type not in COOKED_SET_TYPE_NAMES or self.set_type == 0:
            return 0

        return 2 if self.set_type == COOKED_SET_TYPE_6 else 1

    @property
    def has_shader_name(self) -> bool:
        """Whether a custom shader name follows the shader parameters (custom and type 6 sets)."""
        return self.set_type in (COOKED_SET_TYPE_CUSTOM, COOKED_SET_TYPE_6)


@dataclass
class Texture:
    """A cooked texture."""

    header: TextureHeader
    layout: CookedLayout
    maps: list[bytes]
    shader_parameters: list[float]

    # The custom shader name field as stored, the cooker leaves its own memory after the terminating null
    shader_name_field: bytes | None

    @property
    def set_type_name(self) -> str:
        """The name of the set type."""
        return COOKED_SET_TYPE_NAMES.get(self.layout.set_type, f"unknown-{self.layout.set_type}")

    @property
    def shader_name(self) -> str | None:
        """The custom shader name, None when the set has none."""
        if self.shader_name_field is None:
            return None

        return decode_shader_name(self.shader_name_field)


def decode_shader_name(shader_name_field: bytes) -> str:
    """Decodes a custom shader name field.

    Args:
        shader_name_field: The field as stored.

    Returns:
        The name, up to the terminating null.
    """
    return shader_name_field.split(b"\0", 1)[0].decode("latin-1")


def encode_shader_name(shader_name: str) -> bytes:
    """Encodes a custom shader name into its field.

    Args:
        shader_name: The name.

    Returns:
        The field, the name padded with nulls.

    Raises:
        TextureError: If the name doesn't fit in the field with its terminating null.
    """
    encoded_name = shader_name.encode("latin-1")

    if len(encoded_name) >= COOKED_SHADER_NAME_SIZE:
        raise TextureError(f"shader name too long ({shader_name!r}, {COOKED_SHADER_NAME_SIZE - 1} characters at most)")

    return encoded_name.ljust(COOKED_SHADER_NAME_SIZE, b"\0")


def parse_header(data: bytes) -> TextureHeader:
    """Parses Jade's texture header, at the end of an entry.

    Args:
        data: The entry.

    Returns:
        The header.

    Raises:
        TextureError: If the entry doesn't end with a texture header.
    """
    if len(data) < TEXTURE_HEADER.size:
        raise TextureError("too short for a texture header")

    mark, flags, file_type, color_format, width, height, color, font_key, *codes = TEXTURE_HEADER.unpack_from(
        data, len(data) - TEXTURE_HEADER.size
    )

    if mark != TEXTURE_HEADER_MARK or tuple(codes) != TEXTURE_HEADER_CODES:
        raise TextureError("no texture header at the end")

    return TextureHeader(flags, file_type, color_format, width, height, color, font_key)


def parse_shader_fields(data: bytes, position: int, layout: CookedLayout) -> tuple[list[float], bytes | None, int]:
    """Parses the shader parameters stored after the maps of a texture set.

    Args:
        data: The entry.
        position: The position right after the maps.
        layout: The layout of the texture, its set type decides the fields stored.

    Returns:
        The shader parameters, the custom shader name field (None when the set has none) and the position after them.
    """
    parameters = []

    for _ in range(layout.shader_parameter_count):
        (parameter,) = COOKED_SHADER_PARAMETER.unpack_from(data, position)
        parameters.append(parameter)
        position += COOKED_SHADER_PARAMETER.size

    shader_name_field = None

    if layout.has_shader_name:
        shader_name_field = data[position : position + COOKED_SHADER_NAME_SIZE]
        position += COOKED_SHADER_NAME_SIZE

    return parameters, shader_name_field, position


def parse_texture(data: bytes) -> Texture:
    """Parses a cooked texture.

    Args:
        data: The entry.

    Returns:
        The texture.

    Raises:
        TextureError: If the entry isn't a cooked texture, or if its fields don't add up to its size.
    """
    header = parse_header(data)

    if header.file_type != TEXTURE_FILE_TYPE_COOKED:
        raise TextureError(f"texture type {header.file_type}, not cooked")

    version, *layout_fields = COOKED_TEXTURE_HEADER.unpack_from(data, 0)

    if version != COOKED_TEXTURE_VERSION:
        raise TextureError(f"cooked content version {version}")

    layout = CookedLayout(*layout_fields)
    position = COOKED_TEXTURE_HEADER.size
    maps = []

    for index in range(layout.stored_map_count):
        size = layout.map_size(index)
        maps.append(data[position : position + size])
        position += size

    parameters, shader_name_field, position = parse_shader_fields(data, position, layout)

    header_position = len(data) - TEXTURE_HEADER.size

    if position != header_position:
        raise TextureError(f"the fields end at {position:#x}, the texture header starts at {header_position:#x}")

    return Texture(header, layout, maps, parameters, shader_name_field)


def parse_tga_texture(data: bytes) -> tuple[TextureHeader, bytes]:
    """Parses a texture that isn't cooked, a TGA file followed by the texture header.

    Args:
        data: The entry.

    Returns:
        The header and the TGA file.

    Raises:
        TextureError: If the entry isn't a TGA texture.
    """
    header = parse_header(data)

    if header.file_type != TEXTURE_FILE_TYPE_TGA:
        raise TextureError(f"texture type {header.file_type}, not TGA")

    return header, data[: len(data) - TEXTURE_HEADER.size]


def build_header(header: TextureHeader) -> bytes:
    """Builds Jade's texture header.

    Args:
        header: The header.

    Returns:
        The header bytes, with its mark and check codes.
    """
    return TEXTURE_HEADER.pack(
        TEXTURE_HEADER_MARK,
        header.flags,
        header.file_type,
        header.color_format,
        header.width,
        header.height,
        header.color,
        header.font_key,
        *TEXTURE_HEADER_CODES,
    )


def build_texture(texture: Texture) -> bytes:
    """Builds a cooked texture entry, the reverse of `parse_texture`.

    Args:
        texture: The texture.

    Returns:
        The entry.

    Raises:
        TextureError: If the maps or the shader fields don't match what the layout calls for.
    """
    layout = texture.layout

    if len(texture.maps) != layout.stored_map_count:
        raise TextureError(f"{len(texture.maps)} maps, the layout stores {layout.stored_map_count}")

    for index, map_data in enumerate(texture.maps):
        if len(map_data) != layout.map_size(index):
            raise TextureError(
                f"{COOKED_MAP_NAMES[index]} holds {len(map_data)} bytes, the layout gives it {layout.map_size(index)}"
            )

    if len(texture.shader_parameters) != layout.shader_parameter_count:
        raise TextureError(
            f"{len(texture.shader_parameters)} shader parameters, the set type stores "
            f"{layout.shader_parameter_count}"
        )

    if (texture.shader_name_field is not None) != layout.has_shader_name:
        raise TextureError("a custom shader name on a set type without one, or the reverse")

    parts = [
        COOKED_TEXTURE_HEADER.pack(
            COOKED_TEXTURE_VERSION,
            layout.set_type,
            layout.map_count,
            layout.compressed_format,
            layout.size_with_alpha,
            layout.size_without_alpha,
            layout.has_alpha,
            layout.mipmap_count,
        ),
        *texture.maps,
        *(COOKED_SHADER_PARAMETER.pack(parameter) for parameter in texture.shader_parameters),
    ]

    if texture.shader_name_field is not None:
        parts.append(texture.shader_name_field)

    parts.append(build_header(texture.header))

    return b"".join(parts)
