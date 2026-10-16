"""Layer 2: decompresses the entries of layer 1.

Output, one folder per pak in "workspace/unpacked/2-lz4/":
- "toc.json": the same table of contents as layer 1, pointing at the decompressed files.
- "entries/": one file per entry, named after the entry name or key, plus the ".extra" files copied as is.
"""

import argparse
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import lz4.block

from tools.constants import ENTRIES_DIR_NAME, EXTRA_SUFFIX, TOC_FILE_NAME, WORKER_THREADS
from tools.paths import BPAK_LAYER_DIR, LZ4_LAYER_DIR
from tools.utils import format_size, read_toc, select_layer_paks, write_toc


def unpack_pak(input_dir: Path, output_dir: Path) -> None:
    """Decompresses one pak folder of layer 1, the table of contents is written last, so its presence means
    the pak is complete.

    Args:
        input_dir: The pak folder of layer 1.
        output_dir: The pak folder of this layer, replaced if it exists.
    """
    header, entries, files = read_toc(input_dir / TOC_FILE_NAME)

    if output_dir.exists():
        shutil.rmtree(output_dir)

    input_entries_dir = input_dir / ENTRIES_DIR_NAME
    output_entries_dir = output_dir / ENTRIES_DIR_NAME
    output_entries_dir.mkdir(parents=True)

    def write_entry(index: int) -> None:
        entry = entries[index]
        data = (input_entries_dir / files[index]).read_bytes()

        if entry.is_compressed:
            data = lz4.block.decompress(data, uncompressed_size=entry.size)

            if len(data) != entry.size:
                raise ValueError(f"{files[index]}: decompressed to {len(data)} bytes instead of {entry.size}")

        (output_entries_dir / entry.file_name).write_bytes(data)

        if entry.extra_size:
            extra_name = entry.file_name + EXTRA_SUFFIX
            shutil.copyfile(input_entries_dir / extra_name, output_entries_dir / extra_name)

    # Consuming the results surfaces the exceptions raised in the threads
    with ThreadPoolExecutor(WORKER_THREADS) as executor:
        list(executor.map(write_entry, range(len(entries))))

    write_toc(output_dir / TOC_FILE_NAME, header, entries, [entry.file_name for entry in entries])

    compressed_count = sum(1 for entry in entries if entry.is_compressed)
    total_size = sum(entry.size for entry in entries)
    print(f"  {len(entries)} entries ({compressed_count} decompressed), {format_size(total_size)}", flush=True)


def main() -> None:
    """Decompresses every selected pak of layer 1 that isn't decompressed yet."""
    parser = argparse.ArgumentParser(description="Layer 2: decompresses the entries of layer 1")
    parser.add_argument("--pak", default="*", help='Glob pattern on the pak names, e.g. "Text-*" (default: every pak)')
    parser.add_argument("--force", action="store_true", help="Decompress again the paks that are already done")
    args = parser.parse_args()

    for input_dir in select_layer_paks(parser, BPAK_LAYER_DIR, args.pak, "tools.unpack.unpack_1_bpak"):
        output_dir = LZ4_LAYER_DIR / input_dir.name

        if (output_dir / TOC_FILE_NAME).exists() and not args.force:
            print(f"{input_dir.name}: already decompressed (--force to decompress it again)")
            continue

        print(f"{input_dir.name}: decompressing", flush=True)
        start_time = time.perf_counter()
        unpack_pak(input_dir, output_dir)
        print(f"  Done in {time.perf_counter() - start_time:.1f} s", flush=True)


if __name__ == "__main__":
    main()
