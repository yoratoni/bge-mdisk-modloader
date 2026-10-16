"""Every constant of the tools that isn't a location (see "tools/paths.py" for those): layer files, performance
settings, the BPAK format, the identification rules and the load trace.

The BPAK format and the load trace are documented in "docs/RESEARCH.md".
"""

import re
import struct
from typing import Final

from tools.load_trace import LoaderCallback

# region Game

# The game executable, used to check that "--game" points at the game folder
GAME_EXECUTABLE_NAME = "bge.exe"

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

# The extensions of Jade files (Ray1Map's "Jade_FileType" and Jaded's loaders), the reference lists store one after
# every key they reference ([uint32 key][".gao"])
JADE_EXTENSIONS = (
    "act",
    "cin",
    "cob",
    "fce",
    "gao",
    "gri",
    "grm",
    "gro",
    "lrl",
    "map",
    "msk",
    "ofc",
    "oin",
    "omd",
    "ova",
    "pal",
    "smd",
    "snk",
    "trl",
    "ttt",
    "txg",
    "txi",
    "txl",
    "txs",
    "txt",
    "waa",
    "wac",
    "wad",
    "wam",
    "wav",
    "wol",
    "wow",
)

# A reference to another entry, a Jade extension preceded by the key of the entry it points at (4 bytes)
JADE_REFERENCE_PATTERN = re.compile(rb"\.(" + b"|".join(extension.encode() for extension in JADE_EXTENSIONS) + rb")")
JADE_REFERENCE_KEY_SIZE = 4

# The entries scanned for references, the reference lists are small (the biggest seen is 7 KiB), the big entries
# (meshes, textures) hold none
REFERENCE_SCAN_MAX_SIZE = 256 * 1024

# The types of the entries that can't be identified and of the entries without data
UNKNOWN_TYPE = "unknown"
EMPTY_TYPE = "empty"

# The structural rules recognize an entry from its content and the types of the keys it holds, they're applied until
# they stop typing new entries (a rule's result can be another rule's input), at most this many passes
STRUCTURAL_RULE_MAX_PASSES = 8

# The types the structural rules rely on or produce
AI_MODEL_TYPE = "omd"
AI_INSTANCE_TYPE = "oin"
COLLISION_GAME_MATERIALS_TYPE = "collision-game-materials"
COLLISION_OBJECT_TYPE = "cob"
COLLISION_MAP_TYPE = "map"

# An AI instance is 8 bytes, the key of its AI model then the key of its AI variables
AI_INSTANCE_SIZE = 8

# A collision map with a single collision object is 8 bytes, "01 FF 00 00" then the key of the collision object
COLLISION_MAP_SIZE = 8
COLLISION_MAP_HEADER = 0xFF01

# endregion

# region Load trace

# The trace the ASI writes next to the game executable ("[Debug] TraceLoads"), truncated at every game start
LOAD_TRACE_FILE_NAME = "MDiskModLoader.loads.tsv"

# A collected trace is named after the time its game session wrote it last (e.g. "2026-10-16-143712.loads.tsv")
TRACE_TIME_FORMAT = "%Y-%m-%d-%H%M%S"
TRACE_SUFFIX = ".loads.tsv"

# The loader callbacks identified so far, by RVA in "bge.exe" (Aug 2 2024 build), from the order of their requests
# matched with Jade's "LOA_MakeFileRef" calls and the offsets of their children's keys (see "docs/RESEARCH.md")
LOADER_CALLBACKS: Final[dict[int, LoaderCallback]] = {
    # World
    0x9B6150: LoaderCallback("WOR_ul_World_LoadCallback", "world", "wow"),
    0x9B5FA0: LoaderCallback("WOR_ul_GameObjectGroupCallback", "world object list", "gol"),
    0x9E9E60: LoaderCallback("GRID_ul_CallbackWorldGrid", "grid", "gri"),
    0x9E9CC0: LoaderCallback("GRID_ul_CallbackCompressedGrid", "compressed grid", None),
    0x9E4C40: LoaderCallback("WAY_ul_AllNetWorksCallback", "network list", None),
    0x9E4AF0: LoaderCallback("WAY_ul_NetWorkCallback", "network", None),
    # Game objects
    0x9EA250: LoaderCallback("OBJ_ul_GameObjectCallback", "game object", "gao"),
    0xA39860: LoaderCallback("GEO_ul_Load_ObjectCallback", "graphic object or material", None),
    0x9ED490: LoaderCallback("GRP_ul_LoadGrpCallback", "group", "grp"),
    0x9ED200: LoaderCallback("OBJ_ul_World_LoadGolCallback", "object list", "gol"),
    0x9E47B0: LoaderCallback("WAY_ul_AllLinkListsCallback", "link lists", None),
    # Sound, the banks list their sounds ([key][".snk"], [key][".smd"]) but the PC plays Wwise, they're never loaded
    0xAFDDA0: LoaderCallback("SND_ul_CallbackUnknownBank", "sound bank", None),
    # AI
    0xB40340: LoaderCallback("AI_ul_CallbackLoadInstance", "AI instance", "oin"),
    0xB3E8E0: LoaderCallback("AI_ul_CallbackLoadModel", "AI model", "omd"),
    0xB3EB90: LoaderCallback("AI_ul_CallbackLoadVars", "AI variables", "ova"),
    0xB3F520: LoaderCallback("AI_ul_CallbackLoadFunction", "AI function", "ofc"),
    # Animation
    0x9BD970: LoaderCallback("ACT_ul_ActionKitCallback", "action kit", None),
    0x9BDBC0: LoaderCallback("ACT_ul_ActionCallback", "action", "act"),
    0xB442C0: LoaderCallback("EVE_ul_CallbackLoadListTracks", "event tracks", "trl"),
    0x9BEEF0: LoaderCallback("ANI_ul_ShapeCallback", "shape", None),
    # Collision
    0x9E7A50: LoaderCallback("COL_ul_CallBackLoadInstance", "collision instance", "cin"),
    0x9E7F30: LoaderCallback("COL_ul_CallBackLoadColSet", "collision set", None),
    0x9E82D0: LoaderCallback("COL_ul_CallBackLoadColMap", "collision map", "map"),
    0x9E8540: LoaderCallback("COL_ul_CallBackLoadCob", "collision object", "cob"),
    0x9E8E50: LoaderCallback("COL_ul_CallBackLoadGameMaterial", "collision game materials", None),
    # Text (no Jade name, BG&E's text system differs from Jaded's), a group holds 13 entries of 16 bytes,
    # one per language, with the keys of its ids and strings
    0x9BFAC0: LoaderCallback(None, "text group list", None),
    0x9BFC80: LoaderCallback(None, "text group", "txg"),
    0x9C0070: LoaderCallback(None, "text ids", "txi"),
    0x9BFFD0: LoaderCallback(None, "text strings", "txs"),
}

# The bytes shown from the start of the files a callback loads, to compare their headers
CALLBACK_HEAD_SIZE = 4

# The number of values shown per histogram in the callback report
CALLBACK_REPORT_TOP_COUNT = 4

# endregion
