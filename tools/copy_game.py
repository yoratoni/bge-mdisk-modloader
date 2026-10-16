"""Copies the game files the tools work on into "workspace/game/", mirroring the game folder layout.

Only the files that changed (size or modification time) are copied,
so it can be re-run after a game update.
"""

import argparse
import shutil
from pathlib import Path

from common import DEFAULT_GAME_DIR, GAME_COPY_DIR, format_size

# The files and folders copied, relative to the game folder ("Data/Movies"
# is left out, the Bink movies are loose files with nothing to unpack)
GAME_ENTRIES = ["Config", "Data/BigDir.jdproj", "Data/Paks"]


def needs_copy(source: Path, destination: Path) -> bool:
    """Checks whether a file is missing from the copy or differs from the game's.

    Args:
        source: The file in the game folder.
        destination: The file in the copy.

    Returns:
        True if the file has to be copied.
    """
    if not destination.exists():
        return True

    source_stat = source.stat()
    destination_stat = destination.stat()

    return source_stat.st_size != destination_stat.st_size or int(source_stat.st_mtime) != int(
        destination_stat.st_mtime
    )


def main() -> None:
    """Copies the game files into "workspace/game/"."""
    parser = argparse.ArgumentParser(description="Copies the game files into workspace/game/")
    parser.add_argument("--game", type=Path, default=DEFAULT_GAME_DIR, help="The game folder (containing bge.exe)")
    args = parser.parse_args()

    if not (args.game / "bge.exe").is_file():
        parser.error(f"bge.exe not found in {args.game}")

    copied_count = 0
    skipped_count = 0

    for entry in GAME_ENTRIES:
        source = args.game / entry

        if source.is_file():
            files = [source]
        else:
            files = sorted(path for path in source.rglob("*") if path.is_file())

        for file in files:
            relative_path = file.relative_to(args.game)
            destination = GAME_COPY_DIR / relative_path

            if not needs_copy(file, destination):
                skipped_count += 1
                continue

            destination.parent.mkdir(parents=True, exist_ok=True)

            # Keeps the modification time, which is what "needs_copy" compares on the next run
            shutil.copy2(file, destination)
            copied_count += 1

            print(f"Copied {relative_path.as_posix()} ({format_size(file.stat().st_size)})", flush=True)

    print(f"Done: {copied_count} copied, {skipped_count} already up to date")


if __name__ == "__main__":
    main()
