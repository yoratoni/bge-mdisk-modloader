"""Rebuilds paks from layer 1 into "workspace/repacked/" and compares them with the game's.

The layout (offsets, alignment, padding, table position) is computed from scratch, only the table order and the
entry fields come from "toc.json". A byte-identical rebuild proves layer 1 holds everything the pak holds and that
the layout rules are fully understood. Identical rebuilds are deleted unless "--keep" is passed.
"""

import argparse
import dataclasses
import time
from pathlib import Path

from tools.bpak import PakEntry, PakHeader, align, serialize_table
from tools.constants import (
    BPAK_HEADER,
    BPAK_MAGIC,
    BPAK_PADDING_BYTE,
    ENTRIES_DIR_NAME,
    EXTRA_SUFFIX,
    IO_BUFFER_SIZE,
    TOC_FILE_NAME,
)
from tools.paths import BPAK_LAYER_DIR, PAKS_DIR, REPACKED_DIR
from tools.utils import read_toc, select_layer_paks


def pack_header(header: PakHeader, entry_count: int, table_size: int) -> bytes:
    """Serializes the header.

    Args:
        header: The header fields that aren't derived from the entries.
        entry_count: The number of entries.
        table_size: The size of the table of contents.

    Returns:
        The header bytes.
    """
    unknown_fields = (header.unknown_04, header.unknown_08, header.unknown_0c)
    return BPAK_HEADER.pack(BPAK_MAGIC, *unknown_fields, entry_count, table_size)


def repack_pak(input_dir: Path, output_path: Path) -> None:
    """Rebuilds one pak from its layer 1 folder.

    Args:
        input_dir: The pak folder of layer 1.
        output_path: The pak to write.
    """
    header, entries, files = read_toc(input_dir / TOC_FILE_NAME)
    entries_dir = input_dir / ENTRIES_DIR_NAME
    placed_entries: list[PakEntry] = []

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "wb", buffering=IO_BUFFER_SIZE) as output:
        # The table size is patched once the table is built
        output.write(pack_header(header, len(entries), 0))
        offset = 0

        for entry, file in zip(entries, files):
            # Empty entries take no slot, their offset is always 0
            if entry.is_empty:
                placed_entries.append(dataclasses.replace(entry, offset=0))
                continue

            slot = (entries_dir / file).read_bytes()

            if entry.extra_size:
                slot += (entries_dir / (entry.file_name + EXTRA_SUFFIX)).read_bytes()

            output.write(slot + BPAK_PADDING_BYTE * (align(len(slot)) - len(slot)))
            placed_entries.append(dataclasses.replace(entry, offset=offset))
            offset += align(len(slot))

        table = serialize_table(placed_entries)
        output.write(table)

        output.seek(0)
        output.write(pack_header(header, len(entries), len(table)))


def find_first_difference(first_path: Path, second_path: Path) -> int | None:
    """Compares two files chunk by chunk.

    Args:
        first_path: The first file.
        second_path: The second file.

    Returns:
        The offset of the first differing byte (or the size of the shorter file), None if the files are identical.
    """
    with open(first_path, "rb") as first, open(second_path, "rb") as second:
        position = 0

        while True:
            first_chunk = first.read(IO_BUFFER_SIZE)
            second_chunk = second.read(IO_BUFFER_SIZE)

            if first_chunk != second_chunk:
                common_length = min(len(first_chunk), len(second_chunk))
                index = next((i for i in range(common_length) if first_chunk[i] != second_chunk[i]), common_length)
                return position + index

            if not first_chunk:
                return None

            position += len(first_chunk)


def main() -> None:
    """Rebuilds every selected pak and reports whether it's identical to the game's."""
    parser = argparse.ArgumentParser(description="Rebuilds the paks from layer 1 and compares them with the game's")
    parser.add_argument("--pak", default="*", help='Glob pattern on the pak names, e.g. "Text-*" (default: every pak)')
    parser.add_argument("--keep", action="store_true", help="Keep the rebuilt paks even when they're identical")
    args = parser.parse_args()

    input_dirs = select_layer_paks(parser, BPAK_LAYER_DIR, args.pak, "tools.unpack.unpack_1_bpak")
    identical_count = 0

    for input_dir in input_dirs:
        output_path = REPACKED_DIR / f"{input_dir.name}.pak"

        start_time = time.perf_counter()
        repack_pak(input_dir, output_path)
        difference = find_first_difference(PAKS_DIR / output_path.name, output_path)
        elapsed = time.perf_counter() - start_time

        if difference is None:
            identical_count += 1
            print(f"{output_path.name}: identical ({elapsed:.1f} s)", flush=True)

            if not args.keep:
                output_path.unlink()
        else:
            print(f"{output_path.name}: DIFFERS at {difference:#x} ({elapsed:.1f} s), kept for inspection", flush=True)

    print(f"{identical_count}/{len(input_dirs)} paks rebuilt identically")


if __name__ == "__main__":
    main()
