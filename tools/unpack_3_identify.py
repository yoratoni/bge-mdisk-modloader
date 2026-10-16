"""Layer 3: identifies the entries of layer 2 and sorts them into one folder per type.

Only rules that can't be wrong are applied, everything else lands in "unknown/". The remaster only tags a few Jade
files with their type (".gao", ".wow"), the engine knows the type of every other key from the reference it follows,
so identifying the rest requires parsing the Jade formats.

Output, one folder per pak in "workspace/unpacked/3-identified/":
- "identified.json": the type of every entry, the rule that identified it and its file in this layer.
- "<type>/": the entry files with their type as extension (".extra" files follow their entry), hard linked from
  layer 2, so they take no disk space, but editing one also edits it in layer 2.
"""

import argparse
import json
import os
import re
import shutil
import struct
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from bpak import PakEntry
from common import ENTRIES_DIR_NAME, EXTRA_SUFFIX, IDENTIFIED_LAYER_DIR, LZ4_LAYER_DIR, TOC_FILE_NAME, read_toc

# The name of the index written in every pak folder of this layer
INDEX_FILE_NAME = "identified.json"

# The bytes read from the start of every entry to identify it
HEAD_SIZE = 16

# Linking many files is bound by the file system rather than the CPU, threads overlap the operations
WORKER_THREADS = 8

# A Jade file tagged with its type, the 4-byte extension (e.g. ".gao") at offset 0
JADE_TAG_PATTERN = re.compile(rb"\.[a-z0-9]{3}")

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

# The table of texture parameters ("Resources.pak"), 64-byte records starting with the texture key
TEXTURE_TABLE_NAME = "texParamTable"
TEXTURE_RECORD = struct.Struct("<I60x")

# The types of the entries that can't be identified and of the entries without data
UNKNOWN_TYPE = "unknown"
EMPTY_TYPE = "empty"


def read_texture_keys(entries_dir: Path) -> set[int]:
    """Reads the texture keys listed in the table of texture parameters, when the pak holds one.

    Args:
        entries_dir: The entries folder of a pak in layer 2.

    Returns:
        The texture keys, empty if the pak has no texture table.
    """
    table_path = entries_dir / TEXTURE_TABLE_NAME

    if not table_path.exists():
        return set()

    return {key for (key,) in TEXTURE_RECORD.iter_unpack(table_path.read_bytes())}


def identify_content(head: bytes) -> tuple[str, str] | None:
    """Identifies an entry from its first bytes.

    Args:
        head: The first bytes of the entry.

    Returns:
        The type of the entry and the rule that identified it, None if the content isn't recognized.
    """
    if JADE_TAG_PATTERN.fullmatch(head[:4]):
        return head[1:4].decode("ascii"), "jade tag"

    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "wav", "riff header"

    if head.startswith(PNG_SIGNATURE):
        return "png", "png signature"

    return None


def identify(entry: PakEntry, head: bytes, texture_keys: set[int]) -> tuple[str, str]:
    """Identifies an entry, from its name, then its content, then the tables listing keys of a given type.

    Args:
        entry: The entry.
        head: The first bytes of the entry.
        texture_keys: The keys listed in the table of texture parameters.

    Returns:
        The type of the entry (used as folder and extension) and the rule that identified it.
    """
    if entry.is_empty:
        return EMPTY_TYPE, "empty"

    if entry.name is not None:
        extension = Path(entry.name).suffix.lstrip(".")
        return (extension, "name") if extension else (entry.name, "name")

    content_type = identify_content(head)

    if content_type is not None:
        return content_type

    if entry.key in texture_keys:
        return "tex", TEXTURE_TABLE_NAME

    return UNKNOWN_TYPE, "none"


def link_file(source: Path, destination: Path) -> None:
    """Hard links a file, copying it when linking isn't possible (e.g. on another volume).

    Args:
        source: The file in layer 2.
        destination: The file in this layer.
    """
    try:
        os.link(source, destination)
    except OSError:
        shutil.copyfile(source, destination)


def identified_file_name(entry: PakEntry, entry_type: str) -> str:
    """Returns the file name of an entry in this layer.

    Args:
        entry: The entry.
        entry_type: The type of the entry.

    Returns:
        The entry file name, with the type appended as extension to keyed entries that were identified.
    """
    if entry.name is not None or entry_type in (UNKNOWN_TYPE, EMPTY_TYPE):
        return entry.file_name

    return f"{entry.file_name}.{entry_type}"


def identify_pak(input_dir: Path, output_dir: Path) -> Counter[str]:
    """Identifies one pak folder of layer 2, the index is written last, so its presence means the pak is complete.

    Args:
        input_dir: The pak folder of layer 2.
        output_dir: The pak folder of this layer, replaced if it exists.

    Returns:
        The number of entries of every type.
    """
    _, entries, files = read_toc(input_dir / TOC_FILE_NAME)
    entries_dir = input_dir / ENTRIES_DIR_NAME
    texture_keys = read_texture_keys(entries_dir)

    if output_dir.exists():
        shutil.rmtree(output_dir)

    def identify_entry(index: int) -> tuple[str, str]:
        entry, file = entries[index], files[index]

        with open(entries_dir / file, "rb") as entry_file:
            entry_type, rule = identify(entry, entry_file.read(HEAD_SIZE), texture_keys)

        type_dir = output_dir / entry_type
        type_dir.mkdir(parents=True, exist_ok=True)

        output_name = identified_file_name(entry, entry_type)
        link_file(entries_dir / file, type_dir / output_name)

        if entry.extra_size:
            link_file(entries_dir / (file + EXTRA_SUFFIX), type_dir / (output_name + EXTRA_SUFFIX))

        return rule, f"{entry_type}/{output_name}"

    # Consuming the results surfaces the exceptions raised in the threads
    with ThreadPoolExecutor(WORKER_THREADS) as executor:
        results = list(executor.map(identify_entry, range(len(entries))))

    index = {
        file: {"type": output_file.split("/")[0], "rule": rule, "file": output_file}
        for file, (rule, output_file) in zip(files, results)
    }

    (output_dir / INDEX_FILE_NAME).write_text(json.dumps(index, indent=1), encoding="utf-8")
    return Counter(item["type"] for item in index.values())


def main() -> None:
    """Identifies every selected pak of layer 2 that isn't identified yet."""
    parser = argparse.ArgumentParser(description="Layer 3: sorts the entries of layer 2 by type")
    parser.add_argument("--pak", default="*", help='Glob pattern on the pak names, e.g. "Text-*" (default: every pak)')
    parser.add_argument("--force", action="store_true", help="Identify again the paks that are already done")
    args = parser.parse_args()

    input_dirs = sorted(path for path in LZ4_LAYER_DIR.glob(args.pak) if (path / TOC_FILE_NAME).exists())

    if not input_dirs:
        parser.error(f"no decompressed pak matches {args.pak!r} in {LZ4_LAYER_DIR} (run unpack_2_lz4.py first)")

    for input_dir in input_dirs:
        output_dir = IDENTIFIED_LAYER_DIR / input_dir.name

        if (output_dir / INDEX_FILE_NAME).exists() and not args.force:
            print(f"{input_dir.name}: already identified (--force to identify it again)")
            continue

        print(f"{input_dir.name}: identifying", flush=True)
        start_time = time.perf_counter()
        type_counts = identify_pak(input_dir, output_dir)

        summary = ", ".join(f"{entry_type} {count}" for entry_type, count in type_counts.most_common())
        print(f"  {summary}", flush=True)
        print(f"  Done in {time.perf_counter() - start_time:.1f} s", flush=True)


if __name__ == "__main__":
    main()
