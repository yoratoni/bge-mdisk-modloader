"""Layer 3: identifies the entries of layer 2 and sorts them into one folder per type.

Only rules that can't be wrong are applied, everything else lands in "unknown/". The remaster only tags a few Jade
files with their type (".gao", ".wow"), the engine knows the type of every other key from the reference it follows.
The rules, the first that applies wins:
1. The entry itself: its name, its first bytes (Jade tag, RIFF, PNG, font descriptor), the table of texture
   parameters.
2. The references to it: Jade's reference lists store the extension of every key they reference
   ([uint32 key][".gao"]), the extension most entries give it.
3. The load traces collected in "workspace/traces/": the type of the loader callback the game loaded it with.
4. The structural rules, for the entries still unknown: their content and the types of the keys they hold (e.g. an
   AI instance is the key of an AI model then a key), applied until they stop typing new entries.
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
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple

from tools.bpak import PakEntry
from tools.constants import (
    AI_INSTANCE_SIZE,
    AI_INSTANCE_TYPE,
    AI_MODEL_TYPE,
    COLLISION_GAME_MATERIALS_TYPE,
    COLLISION_MAP_HEADER,
    COLLISION_MAP_SIZE,
    COLLISION_MAP_TYPE,
    COLLISION_OBJECT_TYPE,
    EMPTY_TYPE,
    ENTRIES_DIR_NAME,
    EXTRA_SUFFIX,
    FONT_DESCRIPTOR_SIGNATURE,
    FONT_DESCRIPTOR_TYPE,
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
    STRUCTURAL_RULE_MAX_PASSES,
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

    if head.startswith(FONT_DESCRIPTOR_SIGNATURE):
        return FONT_DESCRIPTOR_TYPE, "font descriptor signature"

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


def read_uint32(data: bytes, offset: int) -> int | None:
    """Reads a little-endian 32-bit value.

    Args:
        data: The bytes.
        offset: The offset of the value.

    Returns:
        The value, None if the bytes are too short.
    """
    return int.from_bytes(data[offset : offset + 4], "little") if len(data) >= offset + 4 else None


def is_collision_object(_entry: PakEntry, head: bytes, types_by_key: dict[int, str]) -> bool:
    """A collision object starts with the key of the collision game materials."""
    return types_by_key.get(read_uint32(head, 0) or 0) == COLLISION_GAME_MATERIALS_TYPE


def is_collision_map(entry: PakEntry, head: bytes, types_by_key: dict[int, str]) -> bool:
    """A collision map with a single collision object, its header then the key of the collision object."""
    return (
        entry.size == COLLISION_MAP_SIZE
        and read_uint32(head, 0) == COLLISION_MAP_HEADER
        and types_by_key.get(read_uint32(head, 4) or 0) == COLLISION_OBJECT_TYPE
    )


def is_ai_instance(entry: PakEntry, head: bytes, types_by_key: dict[int, str]) -> bool:
    """An AI instance, the key of its AI model then the key of its AI variables."""
    return (
        entry.size == AI_INSTANCE_SIZE
        and types_by_key.get(read_uint32(head, 0) or 0) == AI_MODEL_TYPE
        and (read_uint32(head, 4) or 0) in types_by_key
    )


class StructuralRule(NamedTuple):
    """A rule recognizing an entry from its content and the types of the keys it holds."""

    name: str
    entry_type: str
    matches: Callable[[PakEntry, bytes, dict[int, str]], bool]


# In dependency order, a collision map is only recognized once its collision object is typed
STRUCTURAL_RULES = (
    StructuralRule("collision object", COLLISION_OBJECT_TYPE, is_collision_object),
    StructuralRule("collision map", COLLISION_MAP_TYPE, is_collision_map),
    StructuralRule("AI instance", AI_INSTANCE_TYPE, is_ai_instance),
)


def apply_structural_rules(entries: list[PakEntry], heads: list[bytes], results: list[tuple[str, str]]) -> list[str]:
    """Applies the structural rules to the entries still unknown, until they stop typing new ones.

    Every rule is also checked against the entries the other rules typed: a rule matching entries typed differently
    would be wrong somewhere, the report says how many entries it matches by type.

    Args:
        entries: The entries of the pak.
        heads: The first bytes of every entry.
        results: The type and rule of every entry, completed in place.

    Returns:
        A report line per rule.
    """
    types_by_key = {entry.key: result[0] for entry, result in zip(entries, results) if entry.key is not None}
    typed_before = list(results)

    for _ in range(STRUCTURAL_RULE_MAX_PASSES):
        typed_count = 0

        for index, entry in enumerate(entries):
            if results[index][0] != UNKNOWN_TYPE or entry.key is None:
                continue

            for rule in STRUCTURAL_RULES:
                if rule.matches(entry, heads[index], types_by_key):
                    results[index] = (rule.entry_type, f"structure: {rule.name}")
                    types_by_key[entry.key] = rule.entry_type
                    typed_count += 1
                    break

        if typed_count == 0:
            break

    reports = []

    for rule in STRUCTURAL_RULES:
        typed = sum(1 for _, result_rule in results if result_rule == f"structure: {rule.name}")
        agreement: Counter[str] = Counter(
            entry_type
            for entry, head, (entry_type, _) in zip(entries, heads, typed_before)
            if entry_type != UNKNOWN_TYPE and rule.matches(entry, head, types_by_key)
        )
        checked = ", ".join(f"{entry_type} {count}" for entry_type, count in agreement.most_common()) or "none"
        reports.append(f"structure: {rule.name} typed {typed}, also matches entries typed by other rules: {checked}")

    return reports


def read_heads(entries_dir: Path, files: list[str]) -> list[bytes]:
    """Reads the first bytes of every entry.

    Args:
        entries_dir: The entries folder of the pak in layer 2.
        files: The file name of every entry in layer 2.

    Returns:
        The first `IDENTIFY_HEAD_SIZE` bytes of every entry.
    """

    def read_head(file: str) -> bytes:
        with open(entries_dir / file, "rb") as entry_file:
            return entry_file.read(IDENTIFY_HEAD_SIZE)

    with ThreadPoolExecutor(WORKER_THREADS) as executor:
        return list(executor.map(read_head, files))


def link_entries(
    entries_dir: Path, output_dir: Path, entries: list[PakEntry], files: list[str], types: list[str]
) -> list[str]:
    """Hard links every entry of a pak into the folder of its type.

    Args:
        entries_dir: The entries folder of the pak in layer 2.
        output_dir: The pak folder of this layer.
        entries: The entries of the pak.
        files: The file name of every entry in layer 2.
        types: The type of every entry.

    Returns:
        The file of every entry in this layer, relative to the pak folder.
    """

    def link_entry(index: int) -> str:
        entry, file, entry_type = entries[index], files[index], types[index]

        type_dir = output_dir / entry_type
        type_dir.mkdir(parents=True, exist_ok=True)

        output_name = identified_file_name(entry, entry_type)
        link_file(entries_dir / file, type_dir / output_name)

        if entry.extra_size:
            link_file(entries_dir / (file + EXTRA_SUFFIX), type_dir / (output_name + EXTRA_SUFFIX))

        return f"{entry_type}/{output_name}"

    # Consuming the results surfaces the exceptions raised in the threads
    with ThreadPoolExecutor(WORKER_THREADS) as executor:
        return list(executor.map(link_entry, range(len(entries))))


def identify_pak(input_dir: Path, output_dir: Path, traced_types: dict[int, str]) -> tuple[Counter[str], list[str]]:
    """Identifies one pak folder of layer 2, the index is written last, so its presence means the pak is complete.

    Every entry is identified before any is linked, the structural rules depend on the types of other entries.

    Args:
        input_dir: The pak folder of layer 2.
        output_dir: The pak folder of this layer, replaced if it exists.
        traced_types: The type of every key loaded with an identified callback in the collected traces.

    Returns:
        The number of entries of every type, and a report line per structural rule.
    """
    _, entries, files = read_toc(input_dir / TOC_FILE_NAME)
    entries_dir = input_dir / ENTRIES_DIR_NAME

    known_types = KnownTypes(
        texture_keys=read_texture_keys(entries_dir),
        referenced_types=read_referenced_types(entries_dir, entries, files),
        traced_types=traced_types,
    )

    heads = read_heads(entries_dir, files)
    results = [identify(entry, head, known_types) for entry, head in zip(entries, heads)]
    rule_reports = apply_structural_rules(entries, heads, results)

    if output_dir.exists():
        shutil.rmtree(output_dir)

    output_files = link_entries(entries_dir, output_dir, entries, files, [entry_type for entry_type, _ in results])

    index = {
        file: {"type": entry_type, "rule": rule, "file": output_file}
        for file, (entry_type, rule), output_file in zip(files, results, output_files)
    }

    (output_dir / INDEX_FILE_NAME).write_text(json.dumps(index, indent=1), encoding="utf-8")
    return Counter(item["type"] for item in index.values()), rule_reports


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
        type_counts, rule_reports = identify_pak(input_dir, output_dir, traced_types)

        summary = ", ".join(f"{entry_type} {count}" for entry_type, count in type_counts.most_common())
        print(f"  {summary}", flush=True)

        for rule_report in rule_reports:
            print(f"  {rule_report}", flush=True)
        print(f"  Done in {time.perf_counter() - start_time:.1f} s", flush=True)


if __name__ == "__main__":
    main()
