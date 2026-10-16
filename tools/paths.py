"""Every location the tools use: the game folder, the workspace and everything inside it.

The locations that depend on the computer come from "mdisk.toml" at the repository root, ignored by git (start from
"mdisk.example.toml"), every setting in it is optional.
"""

import tomllib
from pathlib import Path
from typing import Any

# region Settings

# The repository root
REPO_DIR = Path(__file__).resolve().parent.parent

# The local settings, ignored by git, and their committed example
SETTINGS_PATH = REPO_DIR / "mdisk.toml"
SETTINGS_EXAMPLE_PATH = REPO_DIR / "mdisk.example.toml"


def _read_settings() -> dict[str, Any]:
    """Reads the local settings.

    Returns:
        The settings, empty when there's no settings file.
    """
    if not SETTINGS_PATH.is_file():
        return {}

    with open(SETTINGS_PATH, "rb") as settings_file:
        return tomllib.load(settings_file)


def _read_path_setting(settings: dict[str, Any], name: str) -> Path | None:
    """Reads a path from the local settings.

    Args:
        settings: The local settings.
        name: The name of the setting.

    Returns:
        The path, None when the setting isn't set.
    """
    value = settings.get(name)

    if value is None:
        return None

    if not isinstance(value, str):
        raise ValueError(f"{SETTINGS_PATH.name}: {name} must be a string, got {value!r}")

    return Path(value).expanduser()


_SETTINGS = _read_settings()

# endregion

# region Game

# The game folder (containing "bge.exe") from the local settings, None when not set ("--game" overrides it)
GAME_DIR = _read_path_setting(_SETTINGS, "game_dir")

# The files and folders copied from the game folder ("Data/Movies" is left out, the Bink movies are loose files
# with nothing to unpack)
GAME_ENTRIES = ("Config", "Data/BigDir.jdproj", "Data/Paks")

# The folder holding the paks, relative to the game folder
PAKS_RELATIVE_DIR = Path("Data") / "Paks"

# endregion

# region Workspace

# Holds the copy of the game files and every unpacked layer (about 45 GiB), "workspace/" in the repository (ignored
# by git) unless the local settings put it elsewhere
WORKSPACE_DIR = _read_path_setting(_SETTINGS, "workspace_dir") or REPO_DIR / "workspace"

# The copy of the game files the tools work on, mirroring the game folder layout (the game install is never touched)
GAME_COPY_DIR = WORKSPACE_DIR / "game"

# The copy of the pak archives
PAKS_DIR = GAME_COPY_DIR / PAKS_RELATIVE_DIR

# The unpacked layers, each one is made from the previous one
UNPACKED_DIR = WORKSPACE_DIR / "unpacked"

# Layer 1: the entries of every pak as stored (LZ4 blocks or raw) and their table of contents
BPAK_LAYER_DIR = UNPACKED_DIR / "1-bpak"

# Layer 2: the entries of layer 1 decompressed
LZ4_LAYER_DIR = UNPACKED_DIR / "2-lz4"

# Layer 3: the entries of layer 2 sorted by type
IDENTIFIED_LAYER_DIR = UNPACKED_DIR / "3-identified"

# The paks rebuilt from layer 1, to check it holds everything or to install them in the game
REPACKED_DIR = WORKSPACE_DIR / "repacked"

# The game's original files replaced by "tools.install_paks", mirroring the game folder layout
BACKUPS_DIR = WORKSPACE_DIR / "backups"

# The load traces collected from the game folder, one file per game session
TRACES_DIR = WORKSPACE_DIR / "traces"

# endregion
