"""Reports what every loader callback of the load traces loads, to name the callbacks (and so the file types).

For every callback: how many keys it loaded, their types as far as layer 3 knows them, their sizes and first bytes,
the callbacks of the files that requested them, the order in which its own files request their children (the order
of the "LOA_MakeFileRef" calls in its loader, which can be matched with the Jade source) and where the keys of those
children sit inside its files (the fields of its format holding references).

Every trace collected in "workspace/traces/" is merged unless "--trace" picks one.
"""

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from tools.constants import (
    CALLBACK_HEAD_SIZE,
    CALLBACK_REPORT_TOP_COUNT,
    ENTRIES_DIR_NAME,
    LOADER_CALLBACKS,
    TRACE_SUFFIX,
)
from tools.load_trace import LoadTraceRow, read_collected_traces
from tools.paths import LZ4_LAYER_DIR, TRACES_DIR
from tools.utils import format_size, read_identified_types


@dataclass
class FileStats:
    """The layer 3 types, first bytes and sizes of the files a callback loaded."""

    types: Counter[str] = field(default_factory=Counter[str])
    heads: Counter[str] = field(default_factory=Counter[str])
    sizes: list[int] = field(default_factory=list[int])


@dataclass
class CallbackReport:
    """What a loader callback loaded across the traces."""

    callback: int
    keys: list[int] = field(default_factory=list[int])
    files: FileStats = field(default_factory=FileStats)
    requesters: Counter[int | None] = field(default_factory=Counter[int | None])
    child_sequences: Counter[str] = field(default_factory=Counter[str])
    child_key_offsets: Counter[str] = field(default_factory=Counter[str])


@dataclass
class TraceGraph:
    """The callbacks of the traces and the references between their files."""

    # The report of every callback
    reports: dict[int, CallbackReport]

    # The callback every key was loaded with (the first one when several were used, the loader that built it)
    callback_of_key: dict[int, int]

    # The children of every file, their key and callback, in the order they were requested
    children: dict[int, list[tuple[int, int]]]


def callback_label(callback: int | None) -> str:
    """Returns the label of a callback in the report.

    Args:
        callback: The RVA of the callback, None for the requests made by top-level code.

    Returns:
        The RVA, followed by the name of the callback when it's identified.
    """
    if callback is None:
        return "top-level"

    loader_callback = LOADER_CALLBACKS.get(callback)

    if loader_callback is None:
        return f"{callback:x}"

    extension = f" (.{loader_callback.extension})" if loader_callback.extension else ""
    return f"{callback:x} {loader_callback.description}{extension}"


def compress_runs(callbacks: list[int]) -> str:
    """Describes a sequence of callbacks, consecutive repeats collapsed (e.g. "a39860 x2, b40340").

    Args:
        callbacks: The callbacks, in order.

    Returns:
        The description.
    """
    runs: list[list[int]] = []

    for callback in callbacks:
        if runs and runs[-1][0] == callback:
            runs[-1][1] += 1
        else:
            runs.append([callback, 1])

    return ", ".join(f"{callback:x} x{count}" if count > 1 else f"{callback:x}" for callback, count in runs)


def build_graph(rows: list[LoadTraceRow]) -> TraceGraph:
    """Groups the rows of the traces by callback and links every file to its children.

    Args:
        rows: The rows of the traces.

    Returns:
        The graph of the traces.
    """
    graph = TraceGraph(reports={}, callback_of_key={}, children=defaultdict(list))

    for row in rows:
        graph.callback_of_key.setdefault(row.key, row.callback)
        report = graph.reports.setdefault(row.callback, CallbackReport(row.callback))

        if row.key not in report.keys:
            report.keys.append(row.key)

        report.requesters[None if row.parent is None else graph.callback_of_key.get(row.parent)] += 1

        if row.parent is not None:
            graph.children[row.parent].append((row.key, row.callback))

    for parent_key, children in graph.children.items():
        parent_report = graph.reports[graph.callback_of_key[parent_key]]
        parent_report.child_sequences[compress_runs([callback for _, callback in children])] += 1

    return graph


def find_entry_path(key: int, identified_types: dict[str, tuple[str, str]]) -> Path | None:
    """Finds the file of a key in layer 2.

    Args:
        key: The key.
        identified_types: The pak and type of every entry, from layer 3.

    Returns:
        The file, None if no pak holds the key (or if it isn't unpacked).
    """
    file_name = f"{key:08x}"

    if file_name not in identified_types:
        return None

    entry_path = LZ4_LAYER_DIR / identified_types[file_name][0] / ENTRIES_DIR_NAME / file_name
    return entry_path if entry_path.is_file() else None


def add_file_details(graph: TraceGraph, identified_types: dict[str, tuple[str, str]]) -> None:
    """Adds the layer 3 types, sizes and first bytes of the files every callback loaded.

    Args:
        graph: The graph of the traces, its reports are completed in place.
        identified_types: The pak and type of every entry, from layer 3.
    """
    for report in graph.reports.values():
        for key in report.keys:
            pak_name, entry_type = identified_types.get(f"{key:08x}", ("?", "?"))
            report.files.types[f"{pak_name}/{entry_type}"] += 1

            entry_path = find_entry_path(key, identified_types)

            if entry_path is not None:
                report.files.sizes.append(entry_path.stat().st_size)

                with open(entry_path, "rb") as entry_file:
                    report.files.heads[entry_file.read(CALLBACK_HEAD_SIZE).hex()] += 1


def add_child_key_offsets(graph: TraceGraph, identified_types: dict[str, tuple[str, str]]) -> None:
    """Adds where the keys of its children sit inside the files of every callback.

    The key of a child is looked for as a little-endian 32-bit value in the parent's file, its first occurrence is
    counted, for every child callback ("not found" when the key isn't stored as is).

    Args:
        graph: The graph of the traces, its reports are completed in place.
        identified_types: The pak and type of every entry, from layer 3.
    """
    for parent_key, children in graph.children.items():
        parent_path = find_entry_path(parent_key, identified_types)

        if parent_path is None:
            continue

        parent_content = parent_path.read_bytes()
        parent_report = graph.reports[graph.callback_of_key[parent_key]]

        for child_key, child_callback in children:
            offset = parent_content.find(child_key.to_bytes(4, "little"))
            position = f"@{offset:#x}" if offset >= 0 else "not found"
            parent_report.child_key_offsets[f"{child_callback:x} {position}"] += 1


def format_counter(counter: Counter[str], top_count: int) -> str:
    """Formats the most common values of a counter.

    Args:
        counter: The counter.
        top_count: The number of values shown.

    Returns:
        The values with their counts, "..." appended when some were left out.
    """
    shown = ", ".join(f"{value} ({count})" for value, count in counter.most_common(top_count))
    return shown + (", ..." if len(counter) > top_count else "")


def print_report(report: CallbackReport, top_count: int) -> None:
    """Prints the report of a callback.

    Args:
        report: The report.
        top_count: The number of values shown per histogram.
    """
    sizes = report.files.sizes
    size_range = f"{format_size(min(sizes))} to {format_size(max(sizes))}" if sizes else "?"
    requesters = Counter({callback_label(callback): count for callback, count in report.requesters.items()})

    print(f"{callback_label(report.callback)}: {len(report.keys)} keys, {size_range}")
    print(f"  types:         {format_counter(report.files.types, top_count)}")
    print(f"  first bytes:   {format_counter(report.files.heads, top_count)}")
    print(f"  requested by:  {format_counter(requesters, top_count)}")

    for sequence, count in report.child_sequences.most_common(top_count):
        print(f"  children x{count}: {sequence}")

    if report.child_key_offsets:
        print(f"  child keys at: {format_counter(report.child_key_offsets, top_count)}")


def main() -> None:
    """Prints the report of every callback (or of one) of the load traces."""
    parser = argparse.ArgumentParser(description="Reports what every loader callback of the load traces loads")
    parser.add_argument("--trace", type=Path, help="A single trace to analyze (default: every collected trace)")
    parser.add_argument("--callback", help="Only report this callback (its RVA in hex, e.g. 9ea250)")
    parser.add_argument("--top", type=int, default=CALLBACK_REPORT_TOP_COUNT, help="Values shown per histogram")
    args = parser.parse_args()

    trace_paths = [args.trace] if args.trace else sorted(TRACES_DIR.glob(f"*{TRACE_SUFFIX}"))

    if not trace_paths:
        parser.error(f"no trace in {TRACES_DIR} (run tools.trace.collect_trace first)")

    rows = read_collected_traces(trace_paths)
    graph = build_graph(rows)
    identified_types = read_identified_types()
    add_file_details(graph, identified_types)
    add_child_key_offsets(graph, identified_types)

    print(f"{len(trace_paths)} traces, {len(rows)} rows, {len(graph.reports)} callbacks\n")

    for report in sorted(graph.reports.values(), key=lambda report: -len(report.keys)):
        if args.callback is None or report.callback == int(args.callback, 16):
            print_report(report, args.top)


if __name__ == "__main__":
    main()
