"""Every constant of the tools: paths, layer files, performance settings, the BPAK format and the identification rules.

The BPAK format is documented in "docs/RESEARCH.md".
"""

import re
import struct
from pathlib import Path
from typing import Final

# region Game

# The default game folder (Steam), overridable with "--game"
DEFAULT_GAME_DIR = Path(r"F:\SteamLibrary\steamapps\common\Beyond Good and Evil - 20th Anniversary Edition")

# The game executable, used to check that "--game" points at the game folder
GAME_EXECUTABLE_NAME = "bge.exe"

# The files and folders copied from the game folder ("Data/Movies" is left out, the Bink movies are loose files
# with nothing to unpack)
GAME_ENTRIES = ("Config", "Data/BigDir.jdproj", "Data/Paks")

# The folder holding the paks, relative to the game folder
PAKS_RELATIVE_DIR = Path("Data") / "Paks"

# endregion

# region Workspace

# The repository root, every other path is derived from it
REPO_DIR = Path(__file__).resolve().parent.parent

# Ignored by git, holds the copy of the game files and every unpacked layer
WORKSPACE_DIR = REPO_DIR / "workspace"

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

# endregion

# region Layer files

# The table of contents written in every pak folder of layers 1 and 2
TOC_FILE_NAME = "toc.json"

# The index written in every pak folder of layer 3
INDEX_FILE_NAME = "identified.json"

# The folder holding the entry files in every pak folder of layers 1 and 2
ENTRIES_DIR_NAME = "entries"

# Appended to the file name of a compressed entry in layer 1
LZ4_SUFFIX = ".lz4"

# Appended to the file name of an entry to name the file holding its extra bytes
EXTRA_SUFFIX = ".extra"

# endregion

# region Performance

# Writing, linking and decompressing many files is bound by the file system (and LZ4 releases the GIL),
# threads overlap the operations
WORKER_THREADS = 8

# The read and write buffers of the pak files, the paks go up to 8 GiB
IO_BUFFER_SIZE = 16 * 1024 * 1024

# The LZ4 mode used to recompress edited entries, the game decompresses any valid LZ4 block
LZ4_COMPRESSION_MODE: Final = "high_compression"

# endregion

# region BPAK format

BPAK_MAGIC = b"BPAK"

# Magic, three unknown fields (kept as is), entry count, table of contents size
BPAK_HEADER = struct.Struct("<4sIIIII")

# Every data slot (and the table of contents) starts on a 16-byte boundary, padded with spaces
BPAK_ALIGNMENT = 16
BPAK_PADDING_BYTE = b" "

# Entry flags, a named entry stores a name, a keyed entry a 32-bit Jade key
BPAK_FLAG_NAMED = 0
BPAK_FLAG_KEYED = 1

# Name length or key
BPAK_ENTRY_ID = struct.Struct("<I")

# Size, packed size (0 = stored raw), extra size, unknown (constant per pak, kept as is), offset
BPAK_ENTRY_FIELDS = struct.Struct("<IIIIQ")

# endregion

# region Identification

# The bytes read from the start of every entry to identify it
IDENTIFY_HEAD_SIZE = 16

# A Jade file tagged with its type, the 4-byte extension (e.g. ".gao") at offset 0
JADE_TAG_PATTERN = re.compile(rb"\.[a-z0-9]{3}")

# A RIFF file starts with "RIFF", its form type ("WAVE" for a sound) at offset 8
RIFF_SIGNATURE = b"RIFF"
RIFF_WAVE_FORM = b"WAVE"

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

# The table of texture parameters ("Resources.pak"), 64-byte records starting with the texture key
TEXTURE_TABLE_NAME = "texParamTable"
TEXTURE_RECORD = struct.Struct("<I60x")

# The types of the entries that can't be identified and of the entries without data
UNKNOWN_TYPE = "unknown"
EMPTY_TYPE = "empty"

# endregion
