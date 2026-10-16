"""Layer 1: unpacks every pak into its entries as stored (LZ4 blocks or raw) and its table of contents.

Output, one folder per pak in "workspace/unpacked/1-bpak/":
- "toc.json": the header fields and every entry, in table order.
- "entries/": one file per entry, named after the entry name or key (".lz4" appended when compressed),
  plus one ".extra" file per entry with extra bytes.
"""

import argparse
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from tools.bpak import Pak, PakEntry
from tools.constants import ENTRIES_DIR_NAME, EXTRA_SUFFIX, LZ4_SUFFIX, TOC_FILE_NAME, WORKER_THREADS
from tools.paths import BPAK_LAYER_DIR, PAKS_DIR
from tools.utils import format_size, write_toc


def stored_file_name(entry: PakEntry) -> str:
    """Returns the file name of an entry in this layer.

    Args:
        entry: The entry.

    Returns:
        The entry file name, with ".lz4" appended when the entry is compressed.
    """
    return entry.file_name + (LZ4_SUFFIX if entry.is_compressed else "")


def unpack_pak(pak_path: Path, output_dir: Path) -> None:
    """Unpacks one pak, the table of contents is written last, so its presence means the pak is complete.

    Args:
        pak_path: The pak to unpack.
        output_dir: The pak folder of this layer, replaced if it exists.
    """
    if output_dir.exists():
        shutil.rmtree(output_dir)

    entries_dir = output_dir / ENTRIES_DIR_NAME
    entries_dir.mkdir(parents=True)

    with Pak(pak_path) as pak:
        files = [stored_file_name(entry) for entry in pak.entries]

        def write_entry(index: int) -> None:
            entry = pak.entries[index]
            (entries_dir / files[index]).write_bytes(pak.read_stored(entry))

            if entry.extra_size:
                (entries_dir / (entry.file_name + EXTRA_SUFFIX)).write_bytes(pak.read_extra(entry))

        # Consuming the results surfaces the exceptions raised in the threads
        with ThreadPoolExecutor(WORKER_THREADS) as executor:
            list(executor.map(write_entry, range(len(pak.entries))))

        write_toc(output_dir / TOC_FILE_NAME, pak.header, pak.entries, files)

        stored_size = sum(entry.stored_size + entry.extra_size for entry in pak.entries)
        print(f"  {len(pak.entries)} entries, {format_size(stored_size)}", flush=True)


def main() -> None:
    """Unpacks the paks into their stored entries."""
    parser = argparse.ArgumentParser(description="Layer 1: unpacks the paks into their stored entries")
    parser.add_argument("--pak", default="*", help='Glob pattern on the pak names, e.g. "Text-*" (default: every pak)')
    parser.add_argument("--force", action="store_true", help="Unpack again the paks that are already unpacked")
    args = parser.parse_args()

    pak_paths = sorted(PAKS_DIR.glob(f"{args.pak}.pak"))

    if not pak_paths:
        parser.error(f"no pak matches {args.pak!r} in {PAKS_DIR} (run tools.copy_game first)")

    for pak_path in pak_paths:
        output_dir = BPAK_LAYER_DIR / pak_path.stem

        if (output_dir / TOC_FILE_NAME).exists() and not args.force:
            print(f"{pak_path.name}: already unpacked (--force to unpack it again)")
            continue

        print(f"{pak_path.name}: unpacking", flush=True)
        start_time = time.perf_counter()
        unpack_pak(pak_path, output_dir)
        print(f"  Done in {time.perf_counter() - start_time:.1f} s", flush=True)


if __name__ == "__main__":
    main()
