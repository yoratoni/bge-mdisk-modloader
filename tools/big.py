"""The BIG file of the original edition ("sally_clean.bf", version 0x22 on PC), see "docs/RESEARCH.md".

Layout, every integer little-endian:
- Header: "BIG\\0", the version, the file and folder counts, the capacity at 0x20 and the position of the file table
  at 0x34 (0x44 in the PC builds), where the header ends.
- File table: one slot per file up to the capacity, the position of the file and its key.
- File records then folder records, as many as the capacity: the name, folder and size of every file, the name and
  parent of every folder.
- Data (from 0x1E0000 in the PC builds): every file is its size then its data, zero padded to a 2048-byte boundary
  (the size counts the padding). The files of the compressed keys are chains of LZO blocks, a block stored raw when
  both its sizes are equal, ended by an empty block.
"""

import mmap
from dataclasses import dataclass
from pathlib import Path

from lzallright import LZOCompressor

from tools.constants import (
    BIG_BLOCK_HEADER,
    BIG_COMPRESSED_KEY_NIBBLE,
    BIG_FILE_RECORD,
    BIG_FOLDER_RECORD,
    BIG_HEADER,
    BIG_MAGIC,
    BIG_RAW_KEY_PREFIX_8,
    BIG_RAW_KEY_PREFIX_12,
    BIG_SIZE_FIELD,
    BIG_SLOT,
    BIG_VERSION,
)


@dataclass
class BigEntry:
    """A file of the BIG file."""

    index: int
    key: int
    offset: int
    size: int
    name: str
    folder: int

    @property
    def is_compressed(self) -> bool:
        """True if the file is a chain of LZO blocks, which the engine tells from the key alone."""
        return (
            self.key >> 28 == BIG_COMPRESSED_KEY_NIBBLE
            and self.key >> 24 != BIG_RAW_KEY_PREFIX_8
            and self.key >> 20 != BIG_RAW_KEY_PREFIX_12
        )

    @property
    def file_name(self) -> str:
        """The name used for the unpacked file and in the mods, the key as 8 lowercase hex digits."""
        return f"{self.key:08x}"


def decode_name(raw_name: bytes) -> str:
    """Decodes a name of a file or folder record.

    Args:
        raw_name: The 64-byte field, zero terminated.

    Returns:
        The name.
    """
    return raw_name.split(b"\0", 1)[0].decode("latin-1")


class Big:
    """A BIG file opened for reading, memory-mapped.

    Usable as a context manager, the file is closed when leaving the block.
    """

    def __init__(self, path: Path) -> None:
        self.path = path

        # The memory map keeps its own handle on the file, which can be closed right away
        with open(path, "rb") as file:
            self._view = mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_READ)

        self.entries, self._folder_paths = self._parse()

    def __enter__(self) -> "Big":
        return self

    def __exit__(self, *_) -> None:
        self.close()

    def close(self) -> None:
        """Closes the memory map."""
        self._view.close()

    def folder_path(self, entry: BigEntry) -> str | None:
        """Returns the folder of a file in the editor's tree (e.g. "ROOT/EngineDatas/06 Levels").

        Args:
            entry: The file.

        Returns:
            The folder, None when the BIG file's folders are unusable (the GOG build keeps a fraction of them).
        """
        return self._folder_paths[entry.folder] if self._folder_paths is not None else None

    def read_stored(self, entry: BigEntry) -> bytes:
        """Reads the stored bytes of a file, after its size field, padding included.

        Args:
            entry: The file.

        Returns:
            The stored bytes.
        """
        start = entry.offset + BIG_SIZE_FIELD.size
        return self._view[start : start + entry.size]

    def read_file(self, entry: BigEntry) -> bytes:
        """Reads the content of a file, the LZO blocks of a compressed key decompressed.

        Args:
            entry: The file.

        Returns:
            The content, the padding left out for a compressed key (the other files keep it, nothing tells it apart).
        """
        stored = self.read_stored(entry)

        if not entry.is_compressed:
            return stored

        blocks = []
        position = 0

        while position + BIG_BLOCK_HEADER.size <= len(stored):
            unpacked_size, packed_size = BIG_BLOCK_HEADER.unpack_from(stored, position)
            position += BIG_BLOCK_HEADER.size

            if unpacked_size == 0:
                break

            block = stored[position : position + packed_size]
            position += packed_size

            if packed_size != unpacked_size:
                block = LZOCompressor.decompress(block, output_size_hint=unpacked_size)

            if len(block) != unpacked_size:
                raise ValueError(
                    f"{entry.file_name}: a block decompressed to {len(block)} bytes instead of {unpacked_size}"
                )

            blocks.append(block)

        return b"".join(blocks)

    def _parse(self) -> tuple[list[BigEntry], list[str] | None]:
        magic, version, file_count, folder_count, capacity, table_count, table_offset = BIG_HEADER.unpack_from(
            self._view, 0
        )

        if magic != BIG_MAGIC:
            raise ValueError(f"{self.path.name}: not a BIG file (magic {magic!r})")

        if version != BIG_VERSION or table_count != 1:
            raise ValueError(f"{self.path.name}: unsupported BIG file (version {version:#x}, {table_count} tables)")

        records_offset = table_offset + capacity * BIG_SLOT.size
        folders_offset = records_offset + capacity * BIG_FILE_RECORD.size
        entries = [self._parse_entry(index, table_offset, records_offset) for index in range(file_count)]
        folders = [
            BIG_FOLDER_RECORD.unpack_from(self._view, folders_offset + index * BIG_FOLDER_RECORD.size)
            for index in range(folder_count)
        ]

        return entries, self._build_folder_paths(entries, folders)

    def _parse_entry(self, index: int, table_offset: int, records_offset: int) -> BigEntry:
        """Parses one file, from its slot of the file table and its file record.

        Args:
            index: The index of the file.
            table_offset: The position of the file table.
            records_offset: The position of the file records.

        Returns:
            The file.
        """
        offset, key = BIG_SLOT.unpack_from(self._view, table_offset + index * BIG_SLOT.size)
        size, _, _, folder, _, raw_name = BIG_FILE_RECORD.unpack_from(
            self._view, records_offset + index * BIG_FILE_RECORD.size
        )

        return BigEntry(index, key, offset, size, decode_name(raw_name), folder)

    @staticmethod
    def _build_folder_paths(
        entries: list[BigEntry], folders: list[tuple[int, int, int, int, int, bytes]]
    ) -> list[str] | None:
        """Builds the path of every folder from its parents.

        Args:
            entries: The files.
            folders: The folder records.

        Returns:
            The path of every folder, None when a file points past the folders or a folder doesn't lead to the root.
        """
        if any(not 0 <= entry.folder < len(folders) for entry in entries):
            return None

        paths: list[str] = []

        for index in range(len(folders)):
            names = []
            visited = set()
            current = index

            while current >= 0:
                if current >= len(folders) or current in visited:
                    return None

                visited.add(current)
                names.append(decode_name(folders[current][5]))
                current = folders[current][4]

            paths.append("/".join(reversed(names)))

        return paths
