"""Brings the entries edited in layer 2 back into layer 1, recompressed, so the next step can rebuild the pak.

An entry counts as edited when its file (or its ".extra" file) in layer 2 was modified after the layer was written
and its content differs from layer 1. Edited entries are recompressed when they were compressed (LZ4 high
compression, the game decompresses any valid LZ4 block), every other entry is left untouched in layer 1, so it stays
byte-identical in the rebuilt pak. Both tables of contents are updated with the new sizes.

Run "tools.unpack.unpack_1_bpak --force" (then the next layers) on a pak to go back to the game's version.
"""

import argparse
from collections.abc import Callable
from pathlib import Path

import lz4.block

from tools.bpak import PakEntry
from tools.constants import ENTRIES_DIR_NAME, EXTRA_SUFFIX, LZ4_COMPRESSION_MODE, TOC_FILE_NAME
from tools.paths import BPAK_LAYER_DIR, LZ4_LAYER_DIR
from tools.utils import format_size, read_toc, select_layer_paks, write_toc


def read_layer_1_content(entry: PakEntry, path: Path) -> bytes:
    """Reads the content of an entry from layer 1, decompressed.

    Args:
        entry: The entry, as described by the layer 1 table of contents.
        path: The entry file in layer 1.

    Returns:
        The decompressed content.
    """
    data = path.read_bytes()
    return lz4.block.decompress(data, uncompressed_size=entry.size) if entry.is_compressed else data


def is_edited(layer_2_file: Path, layer_2_written_time: float, read_original_content: Callable[[], bytes]) -> bool:
    """Checks whether a layer 2 file was edited.

    Args:
        layer_2_file: The file in layer 2.
        layer_2_written_time: The modification time of the layer 2 table of contents, written after every file.
        read_original_content: Reads the original content of the file from layer 1, only called for the files
            modified after layer 2 was written (reading every entry of "Resources.pak" would take minutes).

    Returns:
        True if the file was modified after layer 2 was written and differs from the original content.
    """
    if layer_2_file.stat().st_mtime <= layer_2_written_time:
        return False

    return layer_2_file.read_bytes() != read_original_content()


def repack_entry(entry: PakEntry, layer_1_file: Path, layer_2_file: Path, layer_2_written_time: float) -> str | None:
    """Writes the content of an entry into layer 1 when it was edited in layer 2, recompressed if the entry was
    compressed.

    Args:
        entry: The entry, as described by the layer 1 table of contents, its sizes are updated.
        layer_1_file: The entry file in layer 1, overwritten.
        layer_2_file: The entry file in layer 2.
        layer_2_written_time: The modification time of the layer 2 table of contents.

    Returns:
        A description of the change, None if the entry wasn't edited.
    """
    if not is_edited(layer_2_file, layer_2_written_time, lambda: read_layer_1_content(entry, layer_1_file)):
        return None

    original_size = entry.size
    content = layer_2_file.read_bytes()

    if entry.is_compressed:
        stored_content = lz4.block.compress(content, mode=LZ4_COMPRESSION_MODE, store_size=False)
        entry.packed_size = len(stored_content)
    else:
        stored_content = content

    layer_1_file.write_bytes(stored_content)
    entry.size = len(content)

    return f"{entry.file_name}: {format_size(original_size)} -> {format_size(entry.size)}"


def repack_extra(
    entry: PakEntry,
    layer_1_entries_dir: Path,
    layer_2_entries_dir: Path,
    layer_2_written_time: float,
) -> str | None:
    """Copies the extra bytes of an entry into layer 1 when they were edited in layer 2.

    Args:
        entry: The entry, its extra size is updated.
        layer_1_entries_dir: The entries folder of the pak in layer 1.
        layer_2_entries_dir: The entries folder of the pak in layer 2.
        layer_2_written_time: The modification time of the layer 2 table of contents.

    Returns:
        A description of the change, None if the extra bytes weren't edited.
    """
    extra_file_name = entry.file_name + EXTRA_SUFFIX
    layer_1_extra_file = layer_1_entries_dir / extra_file_name
    layer_2_extra_file = layer_2_entries_dir / extra_file_name

    if not is_edited(layer_2_extra_file, layer_2_written_time, layer_1_extra_file.read_bytes):
        return None

    content = layer_2_extra_file.read_bytes()
    layer_1_extra_file.write_bytes(content)
    entry.extra_size = len(content)

    return f"{extra_file_name}: {format_size(entry.extra_size)}"


def repack_pak(pak_name: str) -> list[str]:
    """Brings the edited entries of one pak back into layer 1.

    Args:
        pak_name: The pak name, without extension.

    Returns:
        A description of every change, empty if nothing was edited.
    """
    layer_1_dir = BPAK_LAYER_DIR / pak_name
    layer_2_dir = LZ4_LAYER_DIR / pak_name
    layer_1_entries_dir = layer_1_dir / ENTRIES_DIR_NAME
    layer_2_entries_dir = layer_2_dir / ENTRIES_DIR_NAME

    header, entries, layer_1_file_names = read_toc(layer_1_dir / TOC_FILE_NAME)
    layer_2_written_time = (layer_2_dir / TOC_FILE_NAME).stat().st_mtime
    changes: list[str] = []

    for entry, layer_1_file_name in zip(entries, layer_1_file_names):
        entry_change = repack_entry(
            entry,
            layer_1_entries_dir / layer_1_file_name,
            layer_2_entries_dir / entry.file_name,
            layer_2_written_time,
        )

        if entry_change is not None:
            changes.append(entry_change)

        if entry.extra_size:
            extra_change = repack_extra(entry, layer_1_entries_dir, layer_2_entries_dir, layer_2_written_time)

            if extra_change is not None:
                changes.append(extra_change)

    if changes:
        write_toc(layer_1_dir / TOC_FILE_NAME, header, entries, layer_1_file_names)
        write_toc(layer_2_dir / TOC_FILE_NAME, header, entries, [entry.file_name for entry in entries])

    return changes


def main() -> None:
    """Brings the edited entries of every selected pak back into layer 1."""
    parser = argparse.ArgumentParser(description="Recompresses the entries edited in layer 2 into layer 1")
    parser.add_argument("--pak", default="*", help='Glob pattern on the pak names, e.g. "Text-*" (default: every pak)')
    args = parser.parse_args()

    for layer_2_dir in select_layer_paks(parser, LZ4_LAYER_DIR, args.pak, "tools.unpack.unpack_2_lz4"):
        changes = repack_pak(layer_2_dir.name)

        if changes:
            print(f"{layer_2_dir.name}: {len(changes)} changes brought back into layer 1")

            for change in changes:
                print(f"  {change}")


if __name__ == "__main__":
    main()
