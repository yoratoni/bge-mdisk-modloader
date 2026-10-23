"""Every constant of the tools that isn't a location (see "tools/paths.py" for those): layer files, performance
settings, the BPAK format, the identification rules, the load trace, the textures and the DDS format.

The formats of the game are documented in "docs/RESEARCH.md".
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

# The index written in every pak folder of layer 4
CONVERTED_INDEX_FILE_NAME = "converted.json"

# The suffix of the files holding what the converted files of an entry don't (layer 4)
METADATA_SUFFIX = ".json"

# The folder holding the entry files in every pak folder of layers 1 and 2
ENTRIES_DIR_NAME = "entries"

# Appended to the file name of a compressed entry in layer 1
LZ4_SUFFIX = ".lz4"

# Appended to the file name of an entry to name the file holding its extra bytes
EXTRA_SUFFIX = ".extra"

# The entries the repack steps brought back into layer 1 since the pak was unpacked,
# by file name, in its pak folder of layer 1
EDITED_FILE_NAME = "edited.json"

# endregion

# region Patching

# Appended to the backup path of a pak to name the record of its original
# size and header, written by "tools.patch_paks" before it touches the pak
PATCH_RECORD_SUFFIX = ".patch.json"

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

# region BIG format

# The BIG file of the original edition, at the root of the game folder
BIG_FILE_NAME = "sally_clean.bf"

BIG_MAGIC = b"BIG\0"

# The version of the BIG file of the PC releases (Steam, GOG, discs), the only one read
BIG_VERSION = 0x22

# Magic, version, file count, folder count, capacity (slots of the file table, at 0x20), table count (at 0x24),
# position of the file table (at 0x34, in the descriptor of the first table that ends the header)
BIG_HEADER = struct.Struct("<4sIII16xII12xI")

# A slot of the file table: the position of the file, its key
BIG_SLOT = struct.Struct("<II")

# A file record, after the file table: size (as its size field), previous and next file of its folder, folder,
# timestamp, name
BIG_FILE_RECORD = struct.Struct("<IiiiI64s")

# A folder record, after the file records: first file, first subfolder, previous and next folder, parent, name
BIG_FOLDER_RECORD = struct.Struct("<iiiii64s")

# The size field starting every file, which counts the zero padding ending it on a sector boundary
BIG_SIZE_FIELD = struct.Struct("<I")

# The header of an LZO block of a compressed file: unpacked size, packed size (equal when stored raw), an empty block
# ending the chain
BIG_BLOCK_HEADER = struct.Struct("<II")

# The files of the keys whose top 4 bits are 0xF are LZO compressed, except under the raw prefixes (top 8 and 12 bits)
BIG_COMPRESSED_KEY_NIBBLE = 0xF
BIG_RAW_KEY_PREFIX_8 = 0xF4
BIG_RAW_KEY_PREFIX_12 = 0xFF4

# The index written in the output folder of "tools.unpack.unpack_big", last
BIG_INDEX_FILE_NAME = "index.json"

# The folder holding the unpacked files in the output folder of "tools.unpack.unpack_big", named after their key
BIG_FILES_DIR_NAME = "files"

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

# A font descriptor (Jaded's "STR_b_LoadFontDescriptor") starts with "FONTDESC", the glyphs of a font atlas texture
FONT_DESCRIPTOR_SIGNATURE = b"FONTDESC"
FONT_DESCRIPTOR_TYPE = "fod"

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

# region Textures

# The type of the entries holding textures (layer 3)
TEXTURE_TYPE = "tex"

# The Jade texture header (Jaded's "TEX_tdst_File_Desc"), at the end of the entry in unbinarized data: mark (-1),
# flags, type, color format, width, height, color, font descriptor key and three check codes
TEXTURE_HEADER = struct.Struct("<iHBBHHIIIII")
TEXTURE_HEADER_MARK = -1
TEXTURE_HEADER_CODES = (0xCAD01234, 0x00FF00FF, 0xC0DEC0DE)

# The texture types found in the remaster (Ray1Map's "TexFileType"): nearly every texture is cooked, a few are still
# plain TGA files (an uncompressed TGA followed by the texture header)
TEXTURE_FILE_TYPE_TGA = 1
TEXTURE_FILE_TYPE_COOKED = 13

# The table of texture parameters holds a copy of the start of every texture header (mark to font descriptor key),
# at this offset of the texture's record
TEXTURE_RECORD_HEADER_OFFSET = 8
TEXTURE_RECORD_HEADER_SIZE = 20

# The cooked content of a texture (Virtuos's "Nori" texture set, see Ray1Map's "TEX_Content_Cooked"): version (14),
# set type, map count, compressed format, size with alpha, size without alpha, alpha flag, mipmap count
COOKED_TEXTURE_HEADER = struct.Struct("<HIIIII?I")
COOKED_TEXTURE_VERSION = 14

# The compressed formats of the cooked textures
COOKED_FORMAT_RGBA8 = 1
COOKED_FORMAT_DXT = 2
COOKED_FORMAT_ASTC = 3
COOKED_FORMAT_NAMES: Final[dict[int, str]] = {
    COOKED_FORMAT_RGBA8: "rgba8",
    COOKED_FORMAT_DXT: "dxt",
    COOKED_FORMAT_ASTC: "astc",
}

# The set types of the cooked textures (Ray1Map's "NoriTextureSetType"), the ones storing shader parameters
COOKED_SET_TYPE_NAMES: Final[dict[int, str]] = {
    0: "invalid",
    1: "simple",
    2: "standard",
    3: "parallax",
    4: "emissive",
    5: "custom",
    6: "type6",
}
COOKED_SET_TYPE_CUSTOM = 5
COOKED_SET_TYPE_6 = 6

# The maps of a texture set, in their stored order (a set with a map count of 0 only has its albedo), told apart by
# their look since Ray1Map swaps the last two: the third map packs specular, gloss and occlusion (flat blue when
# unused), the fourth is the height map of parallax sets or the emissive map of emissive sets
COOKED_MAP_NAMES = ("albedo", "normal", "spec-gloss-occlusion", "height-emissive")

# The shader parameters stored after the maps, and the custom shader name of the custom and type 6 sets
COOKED_SHADER_PARAMETER = struct.Struct("<f")
COOKED_SHADER_NAME_SIZE = 0x40

# The bytes of a 4x4 block in DXT1 (no alpha) and DXT5 (alpha), and of a pixel in RGBA8
DXT_BLOCK_PIXELS = 4
DXT1_BLOCK_SIZE = 8
DXT5_BLOCK_SIZE = 16
RGBA8_PIXEL_SIZE = 4

# The color block ending every DXT block: two colors, then the 2-bit color indices, one byte per pixel row
DXT_COLOR_BLOCK_SIZE = 8
DXT_COLOR_INDICES_OFFSET = 4

# The alpha block starting a DXT5 block: two alphas, then the 3-bit alpha indices as a 48-bit integer, 12 bits per
# pixel row
DXT5_ALPHA_INDICES_OFFSET = 2
DXT5_ALPHA_INDICES_SIZE = 6
DXT5_ALPHA_ROW_BITS = 12

# endregion

# region DDS

# The DDS file header: magic, size (124), flags, height, width, pitch or linear size, depth, mipmap count, 11 reserved
# fields, then the pixel format (size (32), flags, FourCC, bit count, red, green, blue and alpha masks), then the
# capabilities and a reserved field
DDS_HEADER = struct.Struct("<4s7I44x2I4s5I5I")
DDS_MAGIC = b"DDS "
DDS_HEADER_SIZE = 124
DDS_PIXEL_FORMAT_SIZE = 32

# Header flags: capabilities, height, width, pixel format, mipmap count, and the pitch (uncompressed) or the linear
# size (compressed) of the first level
DDS_FLAGS = 0x1 | 0x2 | 0x4 | 0x1000 | 0x20000
DDS_FLAG_PITCH = 0x8
DDS_FLAG_LINEAR_SIZE = 0x80000

# Pixel format flags and the FourCC of the compressed formats
DDS_PIXEL_FORMAT_FOURCC = 0x4
DDS_PIXEL_FORMAT_RGBA = 0x40 | 0x1
DDS_FOURCC_DXT1 = b"DXT1"
DDS_FOURCC_DXT5 = b"DXT5"

# The RGBA8 masks, red in the first byte
DDS_RGBA8_MASKS = (0x000000FF, 0x0000FF00, 0x00FF0000, 0xFF000000)

# Capabilities: a texture, with mipmaps (complex) when there are several levels
DDS_CAPS_TEXTURE = 0x1000
DDS_CAPS_MIPMAPS = 0x8 | 0x400000

DDS_SUFFIX = ".dds"

# Read in the DDS files of other tools: the DX10 extension header (DXGI format, resource dimension, misc flags, array
# size, misc flags 2) following the header when the FourCC is "DX10", and the DXGI formats read here (as the pixel
# format names of "tools.formats.dds")
DDS_FOURCC_DX10 = b"DX10"
DDS_DX10_HEADER = struct.Struct("<5I")
DDS_DXGI_FORMATS: Final[dict[int, str]] = {
    28: "rgba8",  # R8G8B8A8_UNORM
    29: "rgba8",  # R8G8B8A8_UNORM_SRGB
    71: "dxt1",  # BC1_UNORM
    72: "dxt1",  # BC1_UNORM_SRGB
    77: "dxt5",  # BC3_UNORM
    78: "dxt5",  # BC3_UNORM_SRGB
}
DDS_PIXEL_FORMAT_RGB = 0x40
DDS_CAPS2_CUBEMAP = 0x200
DDS_DX10_MISC_TEXTURE_CUBE = 0x4

# endregion

# region TGA

# The TGA file header: ID length, color map type, image type, color map start, length and depth, origin, width,
# height, bits per pixel and descriptor (bit 5 set for a top-left origin)
TGA_HEADER = struct.Struct("<BBBHHBHHHHBB")
TGA_IMAGE_TYPE_TRUE_COLOR = 2
TGA_BIT_DEPTHS = (24, 32)
TGA_TOP_LEFT_ORIGIN = 0x20

TGA_SUFFIX = ".tga"

# endregion
