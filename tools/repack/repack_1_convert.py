"""Brings the textures edited in layer 4 back into layer 2, so the next steps can rebuild the pak.

A texture counts as edited when one of its files in layer 4 (DDS, TGA or JSON) was modified after the layer was
written, and the entry rebuilt from them differs from layer 2. The edited files can change:
- The DDS files: their size, mipmap count and format (DXT1 or DXT5, the format of the albedo sets the alpha flag),
  every map keeping the size of the albedo. The texture header follows, along with its copy in "texParamTable".
- The TGA files: their size, they stay uncompressed with a bottom-left origin like the originals.
- The JSON files: the shader parameters and name, for instance (see "tools/formats/converted_texture.py").

The entries are written in place in layer 2, layer 3 hard links them so it sees the edits too. "--check" rebuilds
every texture without writing anything and reports the ones that differ from layer 2, which proves layer 4 holds
everything an entry holds.

Run "tools.unpack.unpack_1_bpak --force" (then the next layers) on a pak to go back to the game's version.
"""

import argparse
import dataclasses
import json
import struct
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, NamedTuple

from tools.constants import (
    CONVERTED_INDEX_FILE_NAME,
    COOKED_FORMAT_DXT,
    COOKED_MAP_NAMES,
    ENTRIES_DIR_NAME,
    TEXTURE_FILE_TYPE_TGA,
    TEXTURE_HEADER,
    TEXTURE_RECORD,
    TEXTURE_RECORD_HEADER_OFFSET,
    TEXTURE_RECORD_HEADER_SIZE,
    TEXTURE_TABLE_NAME,
    TEXTURE_TYPE,
    WORKER_THREADS,
)
from tools.formats.converted_texture import (
    header_from_metadata,
    layout_from_metadata,
    map_file_name,
    metadata_file_name,
    padding_from_metadata,
    shader_name_field_from_metadata,
    tga_file_name,
)
from tools.formats.dds import DdsImage, PixelFormat, flip_vertically, mipmap_chain_size, parse_dds
from tools.formats.texture import (
    CookedLayout,
    Texture,
    TextureError,
    TextureHeader,
    build_header,
    build_texture,
    parse_header,
)
from tools.formats.tga import read_tga_size
from tools.paths import CONVERTED_LAYER_DIR, LZ4_LAYER_DIR
from tools.utils import format_size, select_layer_paks

# What a texture whose files can't be brought back raises: a file missing or unreadable (OSError), an image or entry
# this step can't build (the format modules raise ValueError subclasses, like the JSON parser), or a JSON file missing
# a field or holding a value of the wrong type or range (KeyError, TypeError, struct.error)
REBUILD_ERRORS = (OSError, ValueError, KeyError, TypeError, struct.error)


class RebuiltTexture(NamedTuple):
    """The result of rebuilding a texture from layer 4."""

    key: str

    # Why the texture couldn't be rebuilt, None if it was
    error: str | None = None

    # The rebuilt entry when it differs from layer 2, None when it's identical (or couldn't be rebuilt)
    entry: bytes | None = None


def read_maps(texture_dir: Path, key: str, layout: CookedLayout) -> list[DdsImage]:
    """Reads the DDS file of every map of a cooked texture.

    Args:
        texture_dir: The texture folder of the pak in layer 4.
        key: The key of the texture.
        layout: The original layout of the texture, which decides the maps stored.

    Returns:
        The image of every map.

    Raises:
        TextureError: If a map doesn't have the size or the mipmap count of the albedo.
    """
    images = [
        parse_dds((texture_dir / map_file_name(key, index)).read_bytes())
        for index in range(layout.stored_map_count)
    ]
    albedo = images[0]

    for index, image in enumerate(images[1:], 1):
        if (image.width, image.height, image.mipmap_count) != (albedo.width, albedo.height, albedo.mipmap_count):
            raise TextureError(
                f"{COOKED_MAP_NAMES[index]} is {image.width}x{image.height} with {image.mipmap_count} levels, the "
                f"albedo {albedo.width}x{albedo.height} with {albedo.mipmap_count}"
            )

    return images


def rebuild_layout(header: TextureHeader, layout: CookedLayout, images: list[DdsImage]) -> tuple[CookedLayout, bool]:
    """Fits the layout of a cooked texture to its images.

    Args:
        header: The original header of the texture.
        layout: The original layout of the texture.
        images: The image of every map.

    Returns:
        The layout, and whether it's the original one (the images keep the size, mipmap count and alpha of the
        original texture, its map sizes are kept as is, with the bytes some maps hold after their mipmap chain).

    Raises:
        TextureError: If a map doesn't have the format the alpha flag calls for.
    """
    albedo = images[0]
    has_alpha = layout.has_alpha

    if layout.compressed_format == COOKED_FORMAT_DXT:
        has_alpha = albedo.pixel_format == PixelFormat.DXT5

    fitted_layout = dataclasses.replace(layout, has_alpha=has_alpha, mipmap_count=albedo.mipmap_count)

    for index, image in enumerate(images):
        expected_format = fitted_layout.map_pixel_format(index)

        if image.pixel_format != expected_format:
            raise TextureError(
                f"{COOKED_MAP_NAMES[index]} is {image.pixel_format.value}, {expected_format.value} expected (the "
                f"albedo is {albedo.pixel_format.value})"
            )

    if fitted_layout == layout and (albedo.width, albedo.height) == (header.width, header.height):
        return layout, True

    alpha_format = PixelFormat.DXT5 if layout.compressed_format == COOKED_FORMAT_DXT else PixelFormat.RGBA8
    no_alpha_format = PixelFormat.DXT1 if layout.compressed_format == COOKED_FORMAT_DXT else PixelFormat.RGBA8
    chain_dimensions = (albedo.width, albedo.height, albedo.mipmap_count)

    fitted_layout = dataclasses.replace(
        fitted_layout,
        size_with_alpha=mipmap_chain_size(alpha_format, *chain_dimensions),
        size_without_alpha=mipmap_chain_size(no_alpha_format, *chain_dimensions),
    )

    return fitted_layout, False


def rebuild_cooked_texture(texture_dir: Path, key: str, metadata: dict[str, Any]) -> bytes:
    """Rebuilds a cooked texture entry from its DDS files and its metadata.

    Args:
        texture_dir: The texture folder of the pak in layer 4.
        key: The key of the texture.
        metadata: The metadata of the texture.

    Returns:
        The entry.
    """
    header = header_from_metadata(metadata["header"])
    layout = layout_from_metadata(metadata["layout"])
    images = read_maps(texture_dir, key, layout)
    layout, is_original_layout = rebuild_layout(header, layout, images)
    padding = padding_from_metadata(metadata) if is_original_layout else {}

    maps = [
        flip_vertically(image.pixel_format, image.width, image.height, image.mipmap_count, image.data)
        + padding.get(COOKED_MAP_NAMES[index], b"")
        for index, image in enumerate(images)
    ]

    texture = Texture(
        header=dataclasses.replace(header, width=images[0].width, height=images[0].height),
        layout=layout,
        maps=maps,
        shader_parameters=list(metadata["shaderParameters"]),
        shader_name_field=shader_name_field_from_metadata(metadata),
    )

    return build_texture(texture)


def rebuild_tga_texture(texture_dir: Path, key: str, metadata: dict[str, Any]) -> bytes:
    """Rebuilds a TGA texture entry from its TGA file and its metadata.

    Args:
        texture_dir: The texture folder of the pak in layer 4.
        key: The key of the texture.
        metadata: The metadata of the texture.

    Returns:
        The entry.
    """
    header = header_from_metadata(metadata["header"])
    tga_file = (texture_dir / tga_file_name(key)).read_bytes()
    width, height = read_tga_size(tga_file)

    return tga_file + build_header(dataclasses.replace(header, width=width, height=height))


def rebuild_texture(texture_dir: Path, entries_dir: Path, key: str) -> RebuiltTexture:
    """Rebuilds a texture entry from layer 4 and compares it with layer 2.

    Args:
        texture_dir: The texture folder of the pak in layer 4.
        entries_dir: The entries folder of the pak in layer 2.
        key: The key of the texture.

    Returns:
        The result, holding the rebuilt entry when it differs from layer 2.
    """
    try:
        metadata = json.loads((texture_dir / metadata_file_name(key)).read_text(encoding="utf-8"))

        if metadata["header"]["fileType"] == TEXTURE_FILE_TYPE_TGA:
            entry = rebuild_tga_texture(texture_dir, key, metadata)
        else:
            entry = rebuild_cooked_texture(texture_dir, key, metadata)
    except REBUILD_ERRORS as error:
        return RebuiltTexture(key, error=f"{type(error).__name__}: {error}")

    if entry == (entries_dir / key).read_bytes():
        return RebuiltTexture(key)

    return RebuiltTexture(key, entry=entry)


def is_edited(converted_dir: Path, files: list[str], written_time: float) -> bool:
    """Checks whether a texture was edited in layer 4.

    Args:
        converted_dir: The pak folder of layer 4.
        files: The files of the texture, relative to the pak folder.
        written_time: The modification time of the layer 4 index, written after every file.

    Returns:
        True if one of the files was modified after layer 4 was written.
    """
    return any((converted_dir / file).stat().st_mtime > written_time for file in files)


def read_texture_table(entries_dir: Path) -> tuple[bytearray, dict[int, int]]:
    """Reads the table of texture parameters of a pak.

    Args:
        entries_dir: The entries folder of the pak in layer 2.

    Returns:
        The table, and the offset of the record of every texture key (both empty if the pak has no table).
    """
    table_path = entries_dir / TEXTURE_TABLE_NAME

    if not table_path.exists():
        return bytearray(), {}

    table = bytearray(table_path.read_bytes())
    records = TEXTURE_RECORD.iter_unpack(table)
    record_offsets = {key: index * TEXTURE_RECORD.size for index, (key,) in enumerate(records)}

    return table, record_offsets


def update_texture_record(table: bytearray, record_offsets: dict[int, int], key: str, entry: bytes) -> bool:
    """Copies the start of a texture header into its record of the table of texture parameters.

    Args:
        table: The table, updated in place.
        record_offsets: The offset of the record of every texture key.
        key: The key of the texture.
        entry: The texture entry.

    Returns:
        True if the record changed.
    """
    record_offset = record_offsets.get(int(key, 16))

    if record_offset is None:
        return False

    header_copy = entry[len(entry) - TEXTURE_HEADER.size :][:TEXTURE_RECORD_HEADER_SIZE]
    start = record_offset + TEXTURE_RECORD_HEADER_OFFSET

    if table[start : start + TEXTURE_RECORD_HEADER_SIZE] == header_copy:
        return False

    table[start : start + TEXTURE_RECORD_HEADER_SIZE] = header_copy
    return True


def describe_change(key: str, original_entry: bytes, entry: bytes) -> str:
    """Describes the change of a texture entry.

    Args:
        key: The key of the texture.
        original_entry: The entry in layer 2.
        entry: The rebuilt entry.

    Returns:
        The description, with the dimensions and sizes before and after.
    """
    original_header, header = parse_header(original_entry), parse_header(entry)
    return (
        f"{key}: {original_header.width}x{original_header.height} -> {header.width}x{header.height}, "
        f"{format_size(len(original_entry))} -> {format_size(len(entry))}"
    )


def repack_pak(converted_dir: Path, check: bool) -> tuple[list[RebuiltTexture], int]:
    """Rebuilds the edited textures of one pak (every texture with "check") and compares them with layer 2.

    Args:
        converted_dir: The pak folder of layer 4.
        check: Rebuild every texture, whether edited or not.

    Returns:
        The rebuilt textures, and the number of textures rebuilt.
    """
    entries_dir = LZ4_LAYER_DIR / converted_dir.name / ENTRIES_DIR_NAME
    index_path = converted_dir / CONVERTED_INDEX_FILE_NAME
    converted = json.loads(index_path.read_text(encoding="utf-8"))
    written_time = index_path.stat().st_mtime

    keys = [
        key
        for key, result in converted.items()
        if "files" in result and (check or is_edited(converted_dir, result["files"], written_time))
    ]

    texture_dir = converted_dir / TEXTURE_TYPE

    with ThreadPoolExecutor(WORKER_THREADS) as executor:
        rebuilt_textures = list(executor.map(lambda key: rebuild_texture(texture_dir, entries_dir, key), keys))

    return rebuilt_textures, len(keys)


def write_textures(pak_name: str, rebuilt_textures: list[RebuiltTexture]) -> list[str]:
    """Writes the rebuilt textures that differ from layer 2 into it, and updates their records of the table of texture
    parameters.

    Args:
        pak_name: The pak name, without extension.
        rebuilt_textures: The rebuilt textures.

    Returns:
        A description of every change.
    """
    entries_dir = LZ4_LAYER_DIR / pak_name / ENTRIES_DIR_NAME
    table, record_offsets = read_texture_table(entries_dir)
    changed_records = 0
    changes: list[str] = []

    for rebuilt_texture in rebuilt_textures:
        if rebuilt_texture.entry is None:
            continue

        # Written in place, the hard link of layer 3 keeps pointing at the same file
        entry_path = entries_dir / rebuilt_texture.key
        changes.append(describe_change(rebuilt_texture.key, entry_path.read_bytes(), rebuilt_texture.entry))
        entry_path.write_bytes(rebuilt_texture.entry)

        if update_texture_record(table, record_offsets, rebuilt_texture.key, rebuilt_texture.entry):
            changed_records += 1

    if changed_records:
        (entries_dir / TEXTURE_TABLE_NAME).write_bytes(table)
        changes.append(f"{TEXTURE_TABLE_NAME}: {changed_records} records updated")

    return changes


def main() -> None:
    """Brings the edited textures of every selected pak back into layer 2, or checks every texture."""
    parser = argparse.ArgumentParser(description="Brings the textures edited in layer 4 back into layer 2")
    parser.add_argument("--pak", default="*", help='Glob pattern on the pak names, e.g. "Text-*" (default: every pak)')
    parser.add_argument(
        "--check",
        action="store_true",
        help="Rebuild every texture without writing anything, and report the ones that differ from layer 2",
    )
    args = parser.parse_args()

    converted_dirs = select_layer_paks(
        parser,
        CONVERTED_LAYER_DIR,
        args.pak,
        "tools.unpack.unpack_4_convert",
        marker_file_name=CONVERTED_INDEX_FILE_NAME,
    )

    for converted_dir in converted_dirs:
        rebuilt_textures, rebuilt_count = repack_pak(converted_dir, args.check)
        errors = [texture for texture in rebuilt_textures if texture.error is not None]

        if args.check:
            differing = [texture.key for texture in rebuilt_textures if texture.entry is not None]
            identical_count = rebuilt_count - len(differing) - len(errors)
            print(f"{converted_dir.name}: {identical_count}/{rebuilt_count} textures rebuilt identically")

            for key in differing:
                print(f"  {key}: differs from layer 2")
        else:
            changes = write_textures(converted_dir.name, rebuilt_textures)

            if changes:
                print(f"{converted_dir.name}: {len(changes)} changes brought back into layer 2")

            for change in changes:
                print(f"  {change}")

        for texture in errors:
            print(f"  {texture.key}: not brought back, {texture.error}")


if __name__ == "__main__":
    main()
