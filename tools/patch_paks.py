"""Patches the game's paks in place with the entries edited in layer 1, in seconds where a full rebuild of
"Resources.pak" takes minutes.

Every byte of the original pak stays where it is, the patch is appended after it:
    [header][original data][original table of contents][edited entries][new table of contents]
The table of contents is read from the end of the file (the header holds its size), the new one points the edited
entries at their new slot and every other entry at its original one. In the original bytes, only the table size of
the header changes.

An entry counts as edited when the repack steps brought it back into layer 1 ("edited.json" in its pak folder), or
when its sizes in layer 1 differ from the original pak's. Every patch starts again from the original (the previous
patch is cut off first), so a pak doesn't grow patch after patch, and a pak with no edited entry left goes back to
its original.

Before a pak is touched, its original size and header are recorded in "workspace/backups/" ("<pak>.patch.json"),
"--restore" cuts the pak back to them. Steam's "Verify integrity of game files" restores it too. A pak installed by
"tools.install_paks" (a full rebuild) has to be restored first, the two tools never stack.
"""

import argparse
import dataclasses
import json
import time
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from tools.bpak import Pak, PakEntry, PakHeader, align, serialize_header, serialize_table
from tools.constants import (
    BPAK_HEADER,
    BPAK_PADDING_BYTE,
    ENTRIES_DIR_NAME,
    EXTRA_SUFFIX,
    PATCH_RECORD_SUFFIX,
    TOC_FILE_NAME,
)
from tools.paths import BACKUPS_DIR, BPAK_LAYER_DIR, PAKS_DIR, PAKS_RELATIVE_DIR
from tools.utils import (
    add_game_argument,
    check_game_dir,
    format_size,
    patch_record_path,
    read_edited_entries,
    read_toc,
    select_layer_paks,
)


class PatchError(Exception):
    """A pak that can't be patched or restored safely."""


@dataclass
class PatchRecord:
    """The original state of a pak, enough to check that its original bytes are still there and to restore it."""

    original_size: int
    original_header: bytes
    original_table_crc32: int

    @property
    def original_table_size(self) -> int:
        """The size of the original table of contents, at the end of the original bytes."""
        return BPAK_HEADER.unpack(self.original_header)[-1]


@dataclass
class Patch:
    """What a patch is made of."""

    header: PakHeader

    # The entries of the original pak and of layer 1, in table order
    original_entries: list[PakEntry]
    layer_1_entries: list[PakEntry]

    # The layer 1 file of every entry, in its entries folder
    files: list[str]
    entries_dir: Path

    # The indices of the edited entries
    edited_indices: list[int]


def read_range(path: Path, start: int, size: int) -> bytes:
    """Reads a range of a file.

    Args:
        path: The file.
        start: The position of the range.
        size: The size of the range.

    Returns:
        The bytes of the range.
    """
    with open(path, "rb") as file:
        file.seek(start)
        return file.read(size)


def read_original_state(original_path: Path) -> PatchRecord:
    """Describes the original state of a pak from its copy in "workspace/game/".

    Args:
        original_path: The copy of the original pak.

    Returns:
        The record of its original state.
    """
    original_size = original_path.stat().st_size
    original_header = read_range(original_path, 0, BPAK_HEADER.size)
    table_size = BPAK_HEADER.unpack(original_header)[-1]
    table_crc32 = zlib.crc32(read_range(original_path, original_size - table_size, table_size))

    return PatchRecord(original_size, original_header, table_crc32)


def read_patch_record(record_path: Path) -> PatchRecord | None:
    """Reads the record of a patched pak.

    Args:
        record_path: The record.

    Returns:
        The record, None if the pak isn't patched.
    """
    if not record_path.exists():
        return None

    record = json.loads(record_path.read_text(encoding="utf-8"))
    return PatchRecord(record["originalSize"], bytes.fromhex(record["originalHeader"]), record["originalTableCrc32"])


def write_patch_record(record_path: Path, record: PatchRecord) -> None:
    """Writes the record of a patched pak.

    Args:
        record_path: The record.
        record: The original state of the pak.
    """
    record_path.parent.mkdir(parents=True, exist_ok=True)
    record_path.write_text(
        json.dumps(
            {
                "originalSize": record.original_size,
                "originalHeader": record.original_header.hex(),
                "originalTableCrc32": record.original_table_crc32,
            },
            indent=1,
        ),
        encoding="utf-8",
    )


def has_original_bytes(game_path: Path, record: PatchRecord) -> bool:
    """Checks that a pak still holds its original bytes, its original table of contents where it was.

    Args:
        game_path: The pak in the game folder.
        record: The original state of the pak.

    Returns:
        True if the original table of contents is intact, the data before it is assumed to be too.
    """
    if game_path.stat().st_size < record.original_size:
        return False

    table_start = record.original_size - record.original_table_size
    table = read_range(game_path, table_start, record.original_table_size)

    return zlib.crc32(table) == record.original_table_crc32


def check_game_pak(game_path: Path, record: PatchRecord | None, original_record: PatchRecord) -> None:
    """Checks that a pak of the game folder is its original, or its original with a patch of this tool.

    Args:
        game_path: The pak in the game folder.
        record: The record of the pak, None if it was never patched.
        original_record: The original state of the pak, from its copy in "workspace/game/".

    Raises:
        PatchError: If the pak is something else (a full rebuild installed by "tools.install_paks", a game update).
    """
    if record is not None and record != original_record:
        raise PatchError(
            "its patch record doesn't match the copy in workspace/game/ (a game update?), restore it with "
            "--restore or Steam's verification"
        )

    is_unpatched_original = (
        game_path.stat().st_size == original_record.original_size
        and read_range(game_path, 0, BPAK_HEADER.size) == original_record.original_header
    )

    if not has_original_bytes(game_path, original_record) or (record is None and not is_unpatched_original):
        raise PatchError(
            "it isn't the game's original (installed by tools.install_paks? restore it with tools.install_paks "
            "--restore first)"
        )


def find_edited_entries(
    layer_1_dir: Path, layer_1_entries: list[PakEntry], original_entries: list[PakEntry]
) -> list[int]:
    """Finds the entries of layer 1 that differ from the original pak.

    Args:
        layer_1_dir: The pak folder of layer 1.
        layer_1_entries: The entries of layer 1, in table order.
        original_entries: The entries of the original pak, in table order.

    Returns:
        The indices of the edited entries.

    Raises:
        PatchError: If layer 1 doesn't hold the entries of the original pak.
    """
    if [entry.file_name for entry in layer_1_entries] != [entry.file_name for entry in original_entries]:
        raise PatchError("layer 1 doesn't hold the entries of the original pak, unpack it again")

    recorded_entries = read_edited_entries(layer_1_dir)

    return [
        index
        for index, (entry, original_entry) in enumerate(zip(layer_1_entries, original_entries))
        if entry.file_name in recorded_entries
        or (entry.size, entry.packed_size, entry.extra_size)
        != (original_entry.size, original_entry.packed_size, original_entry.extra_size)
    ]


def read_slot(patch: Patch, index: int) -> bytes:
    """Reads the slot of an entry from layer 1, its stored bytes followed by its extra bytes.

    Args:
        patch: The patch.
        index: The index of the entry.

    Returns:
        The slot, without its padding.
    """
    entry = patch.layer_1_entries[index]
    slot = (patch.entries_dir / patch.files[index]).read_bytes()

    if entry.extra_size:
        slot += (patch.entries_dir / (entry.file_name + EXTRA_SUFFIX)).read_bytes()

    return slot


def write_patch(file: BinaryIO, record: PatchRecord, patch: Patch) -> int:
    """Cuts a pak back to its original bytes, then appends the edited entries and the new table of contents.

    Args:
        file: The pak, opened for reading and writing.
        record: The original state of the pak.
        patch: The patch.

    Returns:
        The size of the appended bytes.
    """
    file.truncate(record.original_size)
    file.seek(record.original_size)

    # The offsets are relative to the end of the header, every slot starts on a 16-byte boundary
    data_end = record.original_size - BPAK_HEADER.size
    offset = align(data_end)
    file.write(BPAK_PADDING_BYTE * (offset - data_end))

    table_entries = list(patch.original_entries)

    for index in patch.edited_indices:
        entry = patch.layer_1_entries[index]

        if entry.is_empty:
            table_entries[index] = dataclasses.replace(entry, offset=0)
            continue

        slot = read_slot(patch, index)
        file.write(slot + BPAK_PADDING_BYTE * (align(len(slot)) - len(slot)))
        table_entries[index] = dataclasses.replace(entry, offset=offset)
        offset += align(len(slot))

    table = serialize_table(table_entries)
    file.write(table)

    file.seek(0)
    file.write(serialize_header(patch.header, len(table_entries), len(table)))

    return BPAK_HEADER.size + offset + len(table) - record.original_size


def verify_patch(game_path: Path, patch: Patch) -> None:
    """Reads a patched pak back, the way the game does (its table of contents from the end of the file).

    Args:
        game_path: The patched pak.
        patch: The patch.

    Raises:
        PatchError: If an edited entry doesn't read back as layer 1 holds it, or if another entry moved.
    """
    edited_indices = set(patch.edited_indices)

    with Pak(game_path) as pak:
        if len(pak.entries) != len(patch.original_entries):
            raise PatchError(f"it reads back with {len(pak.entries)} entries, {len(patch.original_entries)} expected")

        for index, (entry, original_entry) in enumerate(zip(pak.entries, patch.original_entries)):
            if index not in edited_indices:
                if entry != original_entry:
                    raise PatchError(f"{entry.file_name} moved, it should keep its original slot")

                continue

            if not entry.is_empty and pak.read_stored(entry) + pak.read_extra(entry) != read_slot(patch, index):
                raise PatchError(f"{entry.file_name} doesn't read back as layer 1 holds it")


def restore_original(game_path: Path, record_path: Path, record: PatchRecord) -> None:
    """Cuts a patched pak back to its original bytes and header, and deletes its record.

    Args:
        game_path: The patched pak.
        record_path: The record of the pak.
        record: The original state of the pak.

    Raises:
        PatchError: If the pak doesn't hold its original bytes anymore.
    """
    if not has_original_bytes(game_path, record):
        raise PatchError("its original bytes aren't there anymore, restore it with Steam's verification")

    with open(game_path, "r+b") as file:
        file.truncate(record.original_size)
        file.seek(0)
        file.write(record.original_header)

    record_path.unlink()


def read_patch(pak_name: str, original_path: Path) -> Patch:
    """Reads what the patch of a pak is made of, from its original and from layer 1.

    Args:
        pak_name: The pak name, without extension.
        original_path: The copy of the original pak in "workspace/game/".

    Returns:
        The patch, with no edited entry when layer 1 holds the original.

    Raises:
        PatchError: If layer 1 doesn't hold the entries of the original pak.
    """
    with Pak(original_path) as original_pak:
        header, original_entries = original_pak.header, original_pak.entries

    layer_1_dir = BPAK_LAYER_DIR / pak_name
    _, layer_1_entries, files = read_toc(layer_1_dir / TOC_FILE_NAME)
    edited_indices = find_edited_entries(layer_1_dir, layer_1_entries, original_entries)

    return Patch(header, original_entries, layer_1_entries, files, layer_1_dir / ENTRIES_DIR_NAME, edited_indices)


def describe_patch(patch: Patch, patch_size: int) -> str:
    """Describes a patch.

    Args:
        patch: The patch.
        patch_size: The size of the appended bytes.

    Returns:
        The description, with the first edited entries.
    """
    edited_count = len(patch.edited_indices)
    edited_names = ", ".join(patch.layer_1_entries[index].file_name for index in patch.edited_indices[:5])
    more = f" and {edited_count - 5} more" if edited_count > 5 else ""

    return f"{edited_count} edited entries patched ({edited_names}{more}), {format_size(patch_size)} appended"


def patch_pak(pak_name: str, game_dir: Path) -> str | None:
    """Patches one pak of the game folder with the entries edited in layer 1.

    Args:
        pak_name: The pak name, without extension.
        game_dir: The game folder.

    Returns:
        A description of the change, None if nothing is edited and the pak isn't patched.

    Raises:
        PatchError: If the pak can't be patched safely.
    """
    relative_path = PAKS_RELATIVE_DIR / f"{pak_name}.pak"
    game_path = game_dir / relative_path
    record_path = patch_record_path(relative_path)
    record = read_patch_record(record_path)
    original_record = read_original_state(PAKS_DIR / relative_path.name)

    check_game_pak(game_path, record, original_record)
    patch = read_patch(pak_name, PAKS_DIR / relative_path.name)

    if not patch.edited_indices:
        if record is None:
            return None

        restore_original(game_path, record_path, record)
        return "nothing edited anymore, original restored"

    # Recorded before the pak is touched, so an interrupted patch can still be restored
    write_patch_record(record_path, original_record)

    with open(game_path, "r+b") as file:
        patch_size = write_patch(file, original_record, patch)

    verify_patch(game_path, patch)

    return describe_patch(patch, patch_size)


def restore_pak(pak_name: str, game_dir: Path) -> str:
    """Cuts one patched pak of the game folder back to its original.

    Args:
        pak_name: The pak name, without extension.
        game_dir: The game folder.

    Returns:
        A description of the change.

    Raises:
        PatchError: If the pak isn't patched, or doesn't hold its original bytes anymore.
    """
    relative_path = PAKS_RELATIVE_DIR / f"{pak_name}.pak"
    record_path = patch_record_path(relative_path)
    record = read_patch_record(record_path)

    if record is None:
        raise PatchError("it isn't patched")

    restore_original(game_dir / relative_path, record_path, record)
    return "original restored"


def main() -> None:
    """Patches every selected pak of the game folder, or restores the patched ones."""
    parser = argparse.ArgumentParser(description="Patches the game's paks in place with the entries edited in layer 1")
    parser.add_argument("--pak", default="*", help='Glob pattern on the pak names, e.g. "Text-*" (default: every pak)')
    parser.add_argument("--restore", action="store_true", help="Cut the patched paks back to their originals")
    add_game_argument(parser)
    args = parser.parse_args()
    game_dir = check_game_dir(parser, args.game)

    if args.restore:
        record_paths = sorted((BACKUPS_DIR / PAKS_RELATIVE_DIR).glob(f"{args.pak}.pak{PATCH_RECORD_SUFFIX}"))
        pak_names = [record_path.name.removesuffix(f".pak{PATCH_RECORD_SUFFIX}") for record_path in record_paths]

        if not pak_names:
            parser.error(f"no patched pak matches {args.pak!r}, nothing to restore")
    else:
        layer_1_dirs = select_layer_paks(parser, BPAK_LAYER_DIR, args.pak, "tools.unpack.unpack_1_bpak")
        pak_names = [layer_1_dir.name for layer_1_dir in layer_1_dirs]

    for pak_name in pak_names:
        start_time = time.perf_counter()

        try:
            change = restore_pak(pak_name, game_dir) if args.restore else patch_pak(pak_name, game_dir)
        except PatchError as error:
            print(f"{pak_name}.pak: left as is, {error}", flush=True)
            continue

        if change is not None:
            print(f"{pak_name}.pak: {change} ({time.perf_counter() - start_time:.1f} s)", flush=True)


if __name__ == "__main__":
    main()
