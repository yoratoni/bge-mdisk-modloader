"""The converted textures of layer 4, written by "tools.unpack.unpack_4_convert", read back by
"tools.repack.repack_1_convert".

The files of a texture, named after its key:
- "<key>.dds" for the albedo of a cooked texture, "<key>.<map name>.dds" for its other maps.
- "<key>.tga" for a TGA texture.
- "<key>.json", the metadata: every field of the texture the DDS or TGA files don't hold, as JSON values.

The metadata fields:
- "description": a short description of the texture, for humans only.
- "header": Jade's texture header, its width and height follow the images when they're brought back.
- "layout" (cooked textures): the cooked layout, its map sizes, alpha flag and mipmap count follow the DDS files.
- "shaderParameters" (cooked textures), "shaderName" and "shaderNameField" (custom and type 6 sets): the shader
  fields, editing "shaderName" rewrites the field.
- "padding" (a single texture): the bytes a map holds after its mipmap chain, by map name, as hex.
"""

from typing import Any

from tools.constants import COOKED_MAP_NAMES, DDS_SUFFIX, METADATA_SUFFIX, TGA_SUFFIX
from tools.formats.texture import (
    CookedLayout,
    Texture,
    TextureHeader,
    decode_shader_name,
    encode_shader_name,
)


def map_file_name(key: str, index: int) -> str:
    """Returns the name of the DDS file of a map.

    Args:
        key: The key of the texture, as its file name in layer 2.
        index: The index of the map.

    Returns:
        The file name.
    """
    map_suffix = "" if index == 0 else f".{COOKED_MAP_NAMES[index]}"
    return f"{key}{map_suffix}{DDS_SUFFIX}"


def tga_file_name(key: str) -> str:
    """Returns the name of the TGA file of a TGA texture.

    Args:
        key: The key of the texture, as its file name in layer 2.

    Returns:
        The file name.
    """
    return f"{key}{TGA_SUFFIX}"


def metadata_file_name(key: str) -> str:
    """Returns the name of the metadata file of a texture.

    Args:
        key: The key of the texture, as its file name in layer 2.

    Returns:
        The file name.
    """
    return f"{key}{METADATA_SUFFIX}"


def header_to_metadata(header: TextureHeader) -> dict[str, int]:
    """Describes Jade's texture header.

    Args:
        header: The header.

    Returns:
        The fields, as JSON values.
    """
    return {
        "flags": header.flags,
        "fileType": header.file_type,
        "colorFormat": header.color_format,
        "width": header.width,
        "height": header.height,
        "color": header.color,
        "fontKey": header.font_key,
    }


def header_from_metadata(header_metadata: dict[str, Any]) -> TextureHeader:
    """Reads Jade's texture header back.

    Args:
        header_metadata: The fields written by `header_to_metadata`.

    Returns:
        The header.
    """
    return TextureHeader(
        flags=header_metadata["flags"],
        file_type=header_metadata["fileType"],
        color_format=header_metadata["colorFormat"],
        width=header_metadata["width"],
        height=header_metadata["height"],
        color=header_metadata["color"],
        font_key=header_metadata["fontKey"],
    )


def layout_to_metadata(layout: CookedLayout) -> dict[str, Any]:
    """Describes the layout of a cooked texture.

    Args:
        layout: The layout.

    Returns:
        The fields, as JSON values.
    """
    return {
        "setType": layout.set_type,
        "mapCount": layout.map_count,
        "compressedFormat": layout.compressed_format,
        "sizeWithAlpha": layout.size_with_alpha,
        "sizeWithoutAlpha": layout.size_without_alpha,
        "hasAlpha": layout.has_alpha,
        "mipmapCount": layout.mipmap_count,
    }


def layout_from_metadata(layout_metadata: dict[str, Any]) -> CookedLayout:
    """Reads the layout of a cooked texture back.

    Args:
        layout_metadata: The fields written by `layout_to_metadata`.

    Returns:
        The layout.
    """
    return CookedLayout(
        set_type=layout_metadata["setType"],
        map_count=layout_metadata["mapCount"],
        compressed_format=layout_metadata["compressedFormat"],
        size_with_alpha=layout_metadata["sizeWithAlpha"],
        size_without_alpha=layout_metadata["sizeWithoutAlpha"],
        has_alpha=layout_metadata["hasAlpha"],
        mipmap_count=layout_metadata["mipmapCount"],
    )


def cooked_metadata(texture: Texture, description: str, padding: dict[str, str]) -> dict[str, Any]:
    """Describes the fields of a cooked texture the DDS files don't hold.

    Args:
        texture: The texture.
        description: A short description of the texture.
        padding: The bytes the maps hold after their mipmap chain, as hex by map name.

    Returns:
        The metadata.
    """
    metadata: dict[str, Any] = {
        "description": description,
        "header": header_to_metadata(texture.header),
        "layout": layout_to_metadata(texture.layout),
        "shaderParameters": texture.shader_parameters,
    }

    if texture.shader_name_field is not None:
        metadata["shaderName"] = texture.shader_name
        metadata["shaderNameField"] = texture.shader_name_field.hex()

    if padding:
        metadata["padding"] = padding

    return metadata


def tga_metadata(header: TextureHeader) -> dict[str, Any]:
    """Describes the fields of a TGA texture the TGA file doesn't hold.

    Args:
        header: The texture header.

    Returns:
        The metadata.
    """
    return {"description": "tga", "header": header_to_metadata(header)}


def shader_name_field_from_metadata(metadata: dict[str, Any]) -> bytes | None:
    """Reads the custom shader name field back, rewritten when "shaderName" was edited.

    Args:
        metadata: The metadata of a cooked texture.

    Returns:
        The field, None when the set has none.
    """
    shader_name = metadata.get("shaderName")

    if shader_name is None:
        return None

    shader_name_field = bytes.fromhex(metadata.get("shaderNameField", ""))

    # The stored field keeps the cooker's bytes after the null, as long as the name it holds is still the one given
    if shader_name_field and decode_shader_name(shader_name_field) == shader_name:
        return shader_name_field

    return encode_shader_name(shader_name)


def padding_from_metadata(metadata: dict[str, Any]) -> dict[str, bytes]:
    """Reads the bytes the maps hold after their mipmap chain back.

    Args:
        metadata: The metadata of a cooked texture.

    Returns:
        The bytes by map name, for the maps holding more than their chain.
    """
    return {map_name: bytes.fromhex(padding) for map_name, padding in metadata.get("padding", {}).items()}
