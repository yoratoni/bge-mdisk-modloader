"""Unpacks the BIG file of the original edition ("sally_clean.bf"), its compressed files decompressed.

Output, in "workspace/unpacked/big/<name>/":
- "files/": one file per file of the BIG file, named after its key, as a mod's "bf/" folder holds it.
- "index.json": the key, name, folder and sizes of every file, written last, so its presence means the folder is
  complete.
"""

import argparse
import fnmatch
import json
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from tools.big import Big, BigEntry
from tools.constants import BIG_FILES_DIR_NAME, BIG_INDEX_FILE_NAME, WORKER_THREADS
from tools.paths import BIG_UNPACKED_DIR
from tools.utils import format_size


def matches(big: Big, entry: BigEntry, pattern: str) -> bool:
    """Checks whether a file matches the filter, on its key, its name or its full path, without case.

    Args:
        big: The BIG file.
        entry: The file.
        pattern: A glob pattern (e.g. "fd00*", "*.txg", "*/Localisations/France/*").

    Returns:
        True if the file matches.
    """
    folder = big.folder_path(entry)
    candidates = [entry.file_name, entry.name, f"{folder}/{entry.name}" if folder else entry.name]

    return any(fnmatch.fnmatch(candidate.lower(), pattern.lower()) for candidate in candidates)


def unpack_big(big: Big, output_dir: Path, pattern: str) -> None:
    """Unpacks the files of a BIG file matching a filter.

    Args:
        big: The BIG file.
        output_dir: The output folder, replaced if it exists.
        pattern: A glob pattern on the keys, names and paths.
    """
    entries = [entry for entry in big.entries if matches(big, entry, pattern)]

    if output_dir.exists():
        shutil.rmtree(output_dir)

    files_dir = output_dir / BIG_FILES_DIR_NAME
    files_dir.mkdir(parents=True)

    def write_file(entry: BigEntry) -> dict[str, object]:
        content = big.read_file(entry)
        (files_dir / entry.file_name).write_bytes(content)

        return {
            "key": entry.file_name,
            "name": entry.name,
            "folder": big.folder_path(entry),
            "compressed": entry.is_compressed,
            "storedSize": entry.size,
            "size": len(content),
        }

    # Consuming the results surfaces the exceptions raised in the threads
    with ThreadPoolExecutor(WORKER_THREADS) as executor:
        index = list(executor.map(write_file, entries))

    (output_dir / BIG_INDEX_FILE_NAME).write_text(json.dumps(index, indent=4), encoding="utf-8", newline="\n")

    compressed_count = sum(1 for entry in entries if entry.is_compressed)
    total_size = sum(int(str(file["size"])) for file in index)
    print(f"  {len(entries)} files ({compressed_count} decompressed), {format_size(total_size)}", flush=True)


def main() -> None:
    """Unpacks the files of a BIG file."""
    parser = argparse.ArgumentParser(description="Unpacks the BIG file of the original edition")
    parser.add_argument("big", type=Path, help="The BIG file (sally_clean.bf, at the root of the game folder)")
    parser.add_argument(
        "--name",
        required=True,
        help=f'The output folder name, e.g. "steam" or "gog", in {BIG_UNPACKED_DIR}',
    )
    parser.add_argument(
        "--filter",
        default="*",
        help='Glob pattern on the keys, names and paths, e.g. "fd00*" or "*.txg" (default: every file)',
    )
    args = parser.parse_args()

    if not args.big.is_file():
        parser.error(f"{args.big} isn't a file")

    output_dir = BIG_UNPACKED_DIR / args.name
    print(f"{args.big}: unpacking into {output_dir}", flush=True)
    start_time = time.perf_counter()

    with Big(args.big) as big:
        unpack_big(big, output_dir, args.filter)

    print(f"  Done in {time.perf_counter() - start_time:.1f} s", flush=True)


if __name__ == "__main__":
    main()
