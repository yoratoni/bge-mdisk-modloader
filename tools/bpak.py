"""The BPAK archive format of the 20th Anniversary Edition ("Data/Paks/*.pak"), see "docs/RESEARCH.md".

Layout, every integer little-endian:
- Header (0x18 bytes): "BPAK", three unknown uint32, the entry count and the size of the table of contents.
- Data, from 0x18: one slot per non-empty entry in table order, its stored bytes (LZ4 block or raw) followed by its
  extra bytes (plain text), padded with spaces to a multiple of 16 (offsets are relative to 0x18).
- Table of contents, at the next 16-byte boundary after the data, up to the end of the file.
"""

import mmap
from dataclasses import dataclass
from pathlib import Path

from tools.constants import (
    BPAK_ALIGNMENT,
    BPAK_ENTRY_FIELDS,
    BPAK_ENTRY_ID,
    BPAK_FLAG_KEYED,
    BPAK_FLAG_NAMED,
    BPAK_HEADER,
    BPAK_MAGIC,
)


@dataclass
class PakHeader:
    """The fields of the header that aren't derived from the entries."""

    unknown_04: int
    unknown_08: int
    unknown_0c: int


@dataclass
class PakEntry:
    """An entry of the table of contents, identified either by a name or by a key."""

    name: str | None
    key: int | None
    size: int
    packed_size: int
    extra_size: int
    unknown: int
    offset: int

    @property
    def flag(self) -> int:
        """The flag stored in the table of contents, derived from the identifier."""
        return BPAK_FLAG_NAMED if self.name is not None else BPAK_FLAG_KEYED

    @property
    def is_compressed(self) -> bool:
        """True if the stored bytes are an LZ4 block."""
        return self.packed_size != 0

    @property
    def stored_size(self) -> int:
        """The size of the stored bytes, without the extra bytes."""
        return self.packed_size if self.is_compressed else self.size

    @property
    def is_empty(self) -> bool:
        """True if the entry has no data at all (its offset is 0 and it takes no slot)."""
        return self.size == 0

    @property
    def file_name(self) -> str:
        """The name used for the unpacked file, the entry name or the key as 8 lowercase hex digits."""
        return self.name if self.name is not None else f"{self.key:08x}"


def align(value: int) -> int:
    """Rounds a value up to the next multiple of `BPAK_ALIGNMENT`.

    Args:
        value: The value to align.

    Returns:
        The aligned value.
    """
    return (value + BPAK_ALIGNMENT - 1) & ~(BPAK_ALIGNMENT - 1)


class Pak:
    """A pak opened for reading, memory-mapped so even the 8 GiB one opens instantly.

    Usable as a context manager, the file is closed when leaving the block.
    """

    def __init__(self, path: Path) -> None:
        self.path = path

        # The memory map keeps its own handle on the file, which can be closed right away
        with open(path, "rb") as file:
            self._view = mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_READ)

        self.header, self.entries = self._parse()

    def __enter__(self) -> "Pak":
        return self

    def __exit__(self, *_) -> None:
        self.close()

    def close(self) -> None:
        """Closes the memory map."""
        self._view.close()

    def read_stored(self, entry: PakEntry) -> bytes:
        """Reads the stored bytes of an entry (LZ4 block or raw), without the extra bytes.

        Args:
            entry: The entry.

        Returns:
            The stored bytes.
        """
        start = BPAK_HEADER.size + entry.offset
        return self._view[start : start + entry.stored_size]

    def read_extra(self, entry: PakEntry) -> bytes:
        """Reads the extra bytes of an entry (plain text, never compressed).

        Args:
            entry: The entry.

        Returns:
            The extra bytes, empty if the entry has none.
        """
        start = BPAK_HEADER.size + entry.offset + entry.stored_size
        return self._view[start : start + entry.extra_size]

    def _parse(self) -> tuple[PakHeader, list[PakEntry]]:
        magic, unknown_04, unknown_08, unknown_0c, entry_count, table_size = BPAK_HEADER.unpack_from(self._view, 0)

        if magic != BPAK_MAGIC:
            raise ValueError(f"{self.path.name}: not a BPAK archive (magic {magic!r})")

        position = len(self._view) - table_size
        entries = []

        for _ in range(entry_count):
            entry, position = self._parse_entry(position)
            entries.append(entry)

        if position != len(self._view):
            raise ValueError(
                f"{self.path.name}: the table of contents ends at {position:#x}, not at the end of the file"
            )

        return PakHeader(unknown_04, unknown_08, unknown_0c), entries

    def _parse_entry(self, position: int) -> tuple[PakEntry, int]:
        """Parses one entry of the table of contents.

        Args:
            position: The position of the entry in the file.

        Returns:
            The entry and the position of the next one.
        """
        flag = self._view[position]
        (identifier,) = BPAK_ENTRY_ID.unpack_from(self._view, position + 1)
        position += 1 + BPAK_ENTRY_ID.size

        if flag == BPAK_FLAG_NAMED:
            name = self._view[position : position + identifier].decode("latin-1")
            key = None
            position += identifier
        elif flag == BPAK_FLAG_KEYED:
            name = None
            key = identifier
        else:
            raise ValueError(f"{self.path.name}: unknown entry flag {flag} at {position:#x}")

        fields = BPAK_ENTRY_FIELDS.unpack_from(self._view, position)

        return PakEntry(name, key, *fields), position + BPAK_ENTRY_FIELDS.size


def serialize_table(entries: list[PakEntry]) -> bytes:
    """Serializes the table of contents.

    Args:
        entries: The entries, in table order.

    Returns:
        The table of contents bytes.
    """
    table = bytearray()

    for entry in entries:
        table.append(entry.flag)

        if entry.name is not None:
            name = entry.name.encode("latin-1")
            table += BPAK_ENTRY_ID.pack(len(name)) + name
        else:
            table += BPAK_ENTRY_ID.pack(entry.key)

        table += BPAK_ENTRY_FIELDS.pack(entry.size, entry.packed_size, entry.extra_size, entry.unknown, entry.offset)

    return bytes(table)
