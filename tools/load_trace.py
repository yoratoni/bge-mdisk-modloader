"""The load trace written by the ASI ("[Debug] TraceLoads"), see "docs/RESEARCH.md".

A tab-separated file with a header row, then one row per distinct (key, callback, parent) the game resolved, in the
order it resolved them (its reference queue is first in, first out, so a file's children come after it):
- "key": the key of the file, 8 hex digits.
- "callback": the RVA of the loader callback the game called it with, which identifies the type of the file.
- "flags": the reference flags, 2 hex digits (0x01 = must exist, ...).
- "parent": the key of the file whose loader requested it, empty when the request came from top-level code.
"""

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple


class LoaderCallback(NamedTuple):
    """A loader callback of the game, named from the load traces and the Jade source."""

    # Its name in the Jade source, None when it has no counterpart there
    function: str | None

    # What it loads
    description: str

    # The extension of the files it loads in Jade, None when it isn't known
    extension: str | None

    @property
    def type_name(self) -> str:
        """The type of the files it loads, its Jade extension or its description when the extension isn't known."""
        return self.extension or self.description.replace(" ", "-")


@dataclass(frozen=True)
class LoadTraceRow:
    """A row of the load trace, one reference the game resolved."""

    key: int
    callback: int
    flags: int
    parent: int | None


def read_collected_traces(trace_paths: list[Path]) -> list[LoadTraceRow]:
    """Reads and merges traces, every distinct row once, in the order it first appears.

    Args:
        trace_paths: The trace files.

    Returns:
        The merged rows.
    """
    merged_rows: dict[LoadTraceRow, None] = {}

    for trace_path in trace_paths:
        merged_rows.update(dict.fromkeys(read_load_trace(trace_path)))

    return list(merged_rows)


def read_load_trace(path: Path) -> list[LoadTraceRow]:
    """Reads a load trace.

    Args:
        path: The trace file.

    Returns:
        The rows, in the order the game resolved them.
    """
    with open(path, encoding="ascii", newline="") as trace_file:
        return [
            LoadTraceRow(
                key=int(row["key"], 16),
                callback=int(row["callback"], 16),
                flags=int(row["flags"], 16),
                parent=int(row["parent"], 16) if row["parent"] else None,
            )
            for row in csv.DictReader(trace_file, delimiter="\t")
        ]
