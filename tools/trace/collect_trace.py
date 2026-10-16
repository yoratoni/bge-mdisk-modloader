"""Copies the load trace from the game folder into "workspace/traces/", named after the time it was last written.

The ASI truncates its trace at every game start, collect it after every session worth keeping. A trace that was
already collected (same content) isn't copied again.
"""

import argparse
import shutil
from datetime import datetime

from tools.constants import LOAD_TRACE_FILE_NAME, TRACE_SUFFIX, TRACE_TIME_FORMAT
from tools.paths import TRACES_DIR
from tools.utils import add_game_argument, check_game_dir, format_size


def main() -> None:
    """Collects the load trace of the last game session."""
    parser = argparse.ArgumentParser(description="Copies the load trace from the game folder into workspace/traces/")
    add_game_argument(parser)
    args = parser.parse_args()
    game_dir = check_game_dir(parser, args.game)

    trace_path = game_dir / LOAD_TRACE_FILE_NAME

    if not trace_path.is_file():
        parser.error(
            f"no {LOAD_TRACE_FILE_NAME} in {game_dir} (set TraceLoads = 1 in the ASI configuration, then play)"
        )

    content = trace_path.read_bytes()

    for collected_path in sorted(TRACES_DIR.glob(f"*{TRACE_SUFFIX}")):
        if collected_path.read_bytes() == content:
            print(f"Already collected as {collected_path.name}")
            return

    written_time = datetime.fromtimestamp(trace_path.stat().st_mtime)
    destination = TRACES_DIR / f"{written_time.strftime(TRACE_TIME_FORMAT)}{TRACE_SUFFIX}"

    TRACES_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(trace_path, destination)

    # The first line is the header
    row_count = content.count(b"\n") - 1
    print(f"Collected {destination.name} ({row_count} rows, {format_size(len(content))})")


if __name__ == "__main__":
    main()
