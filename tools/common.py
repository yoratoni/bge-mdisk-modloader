"""Paths and helpers shared by every tool."""

import json
from pathlib import Path
from typing import Any

from bpak import PakEntry, PakHeader

# The repository root, every other path is derived from it
REPO_DIR = Path(__file__).resolve().parent.parent

# Ignored by git, holds the copy of the game files and every unpacked layer
WORKSPACE_DIR = REPO_DIR / "workspace"

# The copy of the game files the tools work on, mirroring the game folder layout (the game install is never touched)
GAME_COPY_DIR = WORKSPACE_DIR / "game"

# The copy of the pak archives
PAKS_DIR = GAME_COPY_DIR / "Data" / "Paks"

# The unpacked layers, each one is made from the previous one
UNPACKED_DIR = WORKSPACE_DIR / "unpacked"

# Layer 1: the entries of every pak as stored (LZ4 blocks or raw) and their table of contents
BPAK_LAYER_DIR = UNPACKED_DIR / "1-bpak"

# Layer 2: the entries of layer 1 decompressed
LZ4_LAYER_DIR = UNPACKED_DIR / "2-lz4"

# Layer 3: the entries of layer 2 sorted by type
IDENTIFIED_LAYER_DIR = UNPACKED_DIR / "3-identified"

# The paks rebuilt from layer 1, to check it holds everything
REPACKED_DIR = WORKSPACE_DIR / "repacked"

# The name of the table of contents written in every pak folder of a layer
TOC_FILE_NAME = "toc.json"

# The folder holding the entry files in every pak folder of a layer
ENTRIES_DIR_NAME = "entries"

# The suffix of the files holding the extra bytes of an entry
EXTRA_SUFFIX = ".extra"

# The default game folder (Steam), overridable with "--game"
DEFAULT_GAME_DIR = Path(r"F:\SteamLibrary\steamapps\common\Beyond Good and Evil - 20th Anniversary Edition")


def format_size(size: int) -> str:
    """Formats a byte count for humans (e.g. "8.14 GiB").

    Args:
        size: The byte count.

    Returns:
        The formatted size.
    """
    value = float(size)

    for unit in ("B", "KiB", "MiB", "GiB"):
        if value < 1024 or unit == "GiB":
            return f"{value:.0f} {unit}" if unit == "B" else f"{value:.2f} {unit}"

        value /= 1024

    return f"{size} B"


def write_toc(path: Path, header: PakHeader, entries: list[PakEntry], files: list[str]) -> None:
    """Writes the table of contents of a layer, every field needed to rebuild the pak plus the entry file names.

    Args:
        path: The JSON file to write.
        header: The pak header.
        entries: The entries, in table order.
        files: The file name of every entry inside the layer's entries folder.
    """
    toc: dict[str, Any] = {
        "header": {
            "unknown04": header.unknown_04,
            "unknown08": header.unknown_08,
            "unknown0C": header.unknown_0c,
        },
        "entries": [
            {
                "file": file,
                "flag": entry.flag,
                "name": entry.name,
                "key": None if entry.key is None else f"{entry.key:08x}",
                "size": entry.size,
                "packedSize": entry.packed_size,
                "extraSize": entry.extra_size,
                "unknown": entry.unknown,
                "offset": entry.offset,
            }
            for entry, file in zip(entries, files)
        ],
    }

    path.write_text(json.dumps(toc, indent=1), encoding="utf-8")


def read_toc(path: Path) -> tuple[PakHeader, list[PakEntry], list[str]]:
    """Reads a table of contents written by `write_toc`.

    Args:
        path: The JSON file to read.

    Returns:
        The pak header, the entries in table order and the file name of every entry.
    """
    toc = json.loads(path.read_text(encoding="utf-8"))
    header = PakHeader(toc["header"]["unknown04"], toc["header"]["unknown08"], toc["header"]["unknown0C"])

    entries = [
        PakEntry(
            name=item["name"],
            key=None if item["key"] is None else int(item["key"], 16),
            size=item["size"],
            packed_size=item["packedSize"],
            extra_size=item["extraSize"],
            unknown=item["unknown"],
            offset=item["offset"],
        )
        for item in toc["entries"]
    ]

    return header, entries, [item["file"] for item in toc["entries"]]
