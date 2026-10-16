"""Layer 3: identifies the entries of layer 2 and sorts them into one folder per type.

Only rules that can't be wrong are applied, everything else lands in "unknown/". The remaster only tags a few Jade
files with their type (".gao", ".wow"), the engine knows the type of every other key from the reference it follows.
The rules, the first that applies wins:
1. The entry itself: its name, its first bytes (Jade tag, RIFF, PNG), the table of texture parameters.
2. The references to it: Jade's reference lists store the extension of every key they reference
   ([uint32 key][".gao"]), the extension most entries give it.
3. The load traces collected in "workspace/traces/": the type of the loader callback the game loaded it with.
Collecting new traces types more entries, identify the paks again ("--force") after that.

Output, one folder per pak in "workspace/unpacked/3-identified/":
- "identified.json": the type of every entry, the rule that identified it and its file in this layer.
- "<type>/": the entry files with their type as extension (".extra" files follow their entry), hard linked from
  layer 2, so they take no disk space, but editing one also edits it in layer 2.
"""

import argparse
import json
import os
import shutil
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from tools.bpak import PakEntry
from tools.constants import (
    EMPTY_TYPE,
    ENTRIES_DIR_NAME,
    EXTRA_SUFFIX,
    IDENTIFY_HEAD_SIZE,
    INDEX_FILE_NAME,
    JADE_REFERENCE_KEY_SIZE,
    JADE_REFERENCE_PATTERN,
    JADE_TAG_PATTERN,
    LOADER_CALLBACKS,
    PNG_SIGNATURE,
    REFERENCE_SCAN_MAX_SIZE,
    RIFF_SIGNATURE,
    RIFF_WAVE_FORM,
    TEXTURE_RECORD,
    TEXTURE_TABLE_NAME,
    TOC_FILE_NAME,
    TRACE_SUFFIX,
    UNKNOWN_TYPE,
    WORKER_THREADS,
)
from tools.load_trace import read_collected_traces
from tools.paths import IDENTIFIED_LAYER_DIR, LZ4_LAYER_DIR, TRACES_DIR
from tools.utils import read_toc, select_layer_paks


@dataclass
class KnownTypes:
    """The types known for the keys of a pak, from other entries and from the load traces."""

    # The keys listed in the table of texture parameters
    texture_keys: set[int]

    # The extension the reference lists of the pak give every key they reference
    referenced_types: dict[int, str]

    # The type of the loader callback every key was loaded with in the collected traces
    traced_types: dict[int, str]


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


def read_referenced_types(entries_dir: Path, entries: list[PakEntry], files: list[str]) -> dict[int, str]:
    """Reads the extensions the reference lists of a pak give the keys they reference.

    Every Jade extension found in a small entry is a reference when the 4 bytes before it are the key of an entry
    of the pak, a key referenced with several extensions keeps the most common one.

    Args:
        entries_dir: The entries folder of the pak in layer 2.
        entries: The entries of the pak.
        files: The file name of every entry in layer 2.

    Returns:
        The extension of every referenced key.
    """
    pak_keys = {entry.key for entry in entries if entry.key is not None}

    def find_references(index: int) -> list[tuple[int, str]]:
        entry = entries[index]

        if entry.is_empty or entry.size > REFERENCE_SCAN_MAX_SIZE:
            return []

        content = (entries_dir / files[index]).read_bytes()
        references = []

        for match in JADE_REFERENCE_PATTERN.finditer(content, JADE_REFERENCE_KEY_SIZE):
            key = int.from_bytes(content[match.start() - JADE_REFERENCE_KEY_SIZE : match.start()], "little")

            if key in pak_keys:
                references.append((key, match.group(1).decode("ascii")))

        return references

    extension_counts: defaultdict[int, Counter[str]] = defaultdict(Counter)

    with ThreadPoolExecutor(WORKER_THREADS) as executor:
        for references in executor.map(find_references, range(len(entries))):
            for key, extension in references:
                extension_counts[key][extension] += 1

    return {key: counts.most_common(1)[0][0] for key, counts in extension_counts.items()}


def read_traced_types() -> dict[int, str]:
    """Reads the type of every key the collected load traces saw loaded, from its loader callback.

    Returns:
        The type of every key loaded with an identified callback (the first callback when there are several).
    """
    traced_types: dict[int, str] = {}

    for row in read_collected_traces(sorted(TRACES_DIR.glob(f"*{TRACE_SUFFIX}"))):
        loader_callback = LOADER_CALLBACKS.get(row.callback)

        if loader_callback is not None:
            traced_types.setdefault(row.key, loader_callback.type_name)

    return traced_types


def identify_content(head: bytes) -> tuple[str, str] | None:
    """Identifies an entry from its first bytes.

    Args:
        head: The first bytes of the entry.

    Returns:
        The type of the entry and the rule that identified it, None if the content isn't recognized.
    """
    if JADE_TAG_PATTERN.fullmatch(head[:4]):
        return head[1:4].decode("ascii"), "jade tag"

    if head[:4] == RIFF_SIGNATURE and head[8:12] == RIFF_WAVE_FORM:
        return "wav", "riff header"

    if head.startswith(PNG_SIGNATURE):
        return "png", "png signature"

    return None


def identify_key(key: int, known_types: KnownTypes) -> tuple[str, str] | None:
    """Identifies an entry from what other entries and the load traces know about its key.

    Args:
        key: The key of the entry.
        known_types: The types known for the keys of the pak.

    Returns:
        The type of the entry and the rule that identified it, None if its key isn't known.
    """
    if key in known_types.texture_keys:
        return "tex", TEXTURE_TABLE_NAME

    if key in known_types.referenced_types:
        return known_types.referenced_types[key], "reference"

    if key in known_types.traced_types:
        return known_types.traced_types[key], "load trace"

    return None


def identify(entry: PakEntry, head: bytes, known_types: KnownTypes) -> tuple[str, str]:
    """Identifies an entry, from its name, then its content, then what is known about its key.

    Args:
        entry: The entry.
        head: The first bytes of the entry.
        known_types: The types known for the keys of the pak.

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

    key_type = identify_key(entry.key, known_types) if entry.key is not None else None
    return key_type if key_type is not None else (UNKNOWN_TYPE, "none")


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


def identify_pak(input_dir: Path, output_dir: Path, traced_types: dict[int, str]) -> Counter[str]:
    """Identifies one pak folder of layer 2, the index is written last, so its presence means the pak is complete.

    Args:
        input_dir: The pak folder of layer 2.
        output_dir: The pak folder of this layer, replaced if it exists.
        traced_types: The type of every key loaded with an identified callback in the collected traces.

    Returns:
        The number of entries of every type.
    """
    _, entries, files = read_toc(input_dir / TOC_FILE_NAME)
    entries_dir = input_dir / ENTRIES_DIR_NAME

    known_types = KnownTypes(
        texture_keys=read_texture_keys(entries_dir),
        referenced_types=read_referenced_types(entries_dir, entries, files),
        traced_types=traced_types,
    )

    if output_dir.exists():
        shutil.rmtree(output_dir)

    def identify_entry(index: int) -> tuple[str, str]:
        entry, file = entries[index], files[index]

        with open(entries_dir / file, "rb") as entry_file:
            entry_type, rule = identify(entry, entry_file.read(IDENTIFY_HEAD_SIZE), known_types)

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

    traced_types = read_traced_types()
    print(f"{len(traced_types)} keys typed by the collected load traces", flush=True)

    for input_dir in select_layer_paks(parser, LZ4_LAYER_DIR, args.pak, "tools.unpack.unpack_2_lz4"):
        output_dir = IDENTIFIED_LAYER_DIR / input_dir.name

        if (output_dir / INDEX_FILE_NAME).exists() and not args.force:
            print(f"{input_dir.name}: already identified (--force to identify it again)")
            continue

        print(f"{input_dir.name}: identifying", flush=True)
        start_time = time.perf_counter()
        type_counts = identify_pak(input_dir, output_dir, traced_types)

        summary = ", ".join(f"{entry_type} {count}" for entry_type, count in type_counts.most_common())
        print(f"  {summary}", flush=True)
        print(f"  Done in {time.perf_counter() - start_time:.1f} s", flush=True)


if __name__ == "__main__":
    main()
