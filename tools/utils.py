"""Helpers shared by every tool."""

import argparse
import json
from pathlib import Path
from typing import Any

from tools.bpak import PakEntry, PakHeader
from tools.constants import GAME_EXECUTABLE_NAME, INDEX_FILE_NAME, TOC_FILE_NAME
from tools.paths import GAME_DIR, IDENTIFIED_LAYER_DIR, SETTINGS_EXAMPLE_PATH, SETTINGS_PATH


def add_game_argument(parser: argparse.ArgumentParser) -> None:
    """Adds the "--game" argument, the game folder (the one of the local settings when not given).

    Args:
        parser: The argument parser of the tool.
    """
    parser.add_argument(
        "--game",
        type=Path,
        default=GAME_DIR,
        help=f"The game folder (containing {GAME_EXECUTABLE_NAME}), default: game_dir in {SETTINGS_PATH.name}",
    )


def check_game_dir(parser: argparse.ArgumentParser, game_dir: Path | None) -> Path:
    """Exits with a usage error when there's no game folder or when it isn't the game folder.

    Args:
        parser: The argument parser of the tool.
        game_dir: The folder given with "--game", None when neither it nor the local settings give one.

    Returns:
        The game folder.
    """
    if game_dir is None:
        parser.error(
            f"no game folder, set game_dir in {SETTINGS_PATH.name} (start from {SETTINGS_EXAMPLE_PATH.name}) "
            "or pass --game"
        )

    if not (game_dir / GAME_EXECUTABLE_NAME).is_file():
        parser.error(f"{GAME_EXECUTABLE_NAME} not found in {game_dir}")

    return game_dir


def select_layer_paks(
    parser: argparse.ArgumentParser,
    layer_dir: Path,
    pattern: str,
    producer: str,
    marker_file_name: str = TOC_FILE_NAME,
) -> list[Path]:
    """Lists the complete pak folders of a layer matching a pattern, exits with a usage error when there are none.

    Args:
        parser: The argument parser of the tool.
        layer_dir: The layer folder.
        pattern: A glob pattern on the pak names (e.g. "Text-*").
        producer: The module that produces the layer, suggested in the usage error.
        marker_file_name: The file written last in a pak folder of the layer, its presence means the folder is
            complete (the table of contents in layers 1 and 2).

    Returns:
        The matching pak folders, sorted by name.
    """
    pak_dirs = sorted(path for path in layer_dir.glob(pattern) if (path / marker_file_name).exists())

    if not pak_dirs:
        parser.error(f"no pak matches {pattern!r} in {layer_dir} (run {producer} first)")

    return pak_dirs


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


def read_identified_types() -> dict[str, tuple[str, str]]:
    """Reads the type layer 3 identified for the entries of every pak.

    An entry name or key present in several paks (e.g. the same text key in two languages) keeps the first pak in
    name order.

    Returns:
        The pak name and the type of every entry, by its file name in layer 2 (the entry name, or the key as 8
        lowercase hex digits).
    """
    identified_types: dict[str, tuple[str, str]] = {}

    for index_path in sorted(IDENTIFIED_LAYER_DIR.glob(f"*/{INDEX_FILE_NAME}")):
        index = json.loads(index_path.read_text(encoding="utf-8"))

        for file_name, item in index.items():
            identified_types.setdefault(file_name, (index_path.parent.name, item["type"]))

    return identified_types
