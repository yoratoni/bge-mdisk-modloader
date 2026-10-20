# Research notes: BG&E 20th Anniversary Edition, modding
Reverse engineering notes on `bge.exe` and its data: the archive formats, the engine's file layer, the injection
points and the open questions.

All addresses are **RVAs** (offsets from the image base) for the build below, in Cheat Engine an RVA `0xAE6BD3` is
written `"bge.exe"+AE6BD3`, in static tools it's `0x140AE6BD3` (default image base `0x140000000`). The display
findings (aspect ratio, cameras, FOV) live in the widescreen fix's own `docs/RESEARCH.md`.

## Table of contents
1. [The build](#the-build)
2. [Protection and injection](#protection-and-injection)
3. [Data layout](#data-layout)
4. [Modding results](#modding-results)
5. [Engine file layer](#engine-file-layer)
6. [Prior art](#prior-art)
7. [Open questions](#open-questions)
8. [Method and tooling](#method-and-tooling)

## The build
| Property   | Value                                                                                          |
|------------|------------------------------------------------------------------------------------------------|
| Executable | `bge.exe`, 377,683,992 bytes, x64                                                              |
| Build date | PE timestamp `1722621509` (2024-08-02), build string `"Aug  2 2024"`                           |
| Build path | `F:\Jenkins_Workspace\BGE_BUILD\MS25_Support_Patch2\...`                                       |
| Engine     | Jade (original BG&E engine, ported to C++), `Src\Libraries\Sdk\Sources\BIGfiles` still present |
| Renderer   | D3D12, through Ubisoft's "Fusion 12.6.0" (GearCore 8.1.0)                                      |
| Libraries  | Wwise 2021.1, Bink 2, Ubisoft Services SDK, FreeType                                           |

The mod loader logs the PE timestamp of the running `bge.exe` at startup, so every log identifies the build.

## Protection and injection
The exe is protected by Denuvo Anti-Tamper, but the game code is plain and unencrypted in `.didata` (RVA `0x1000`,
~21 MB), Denuvo's virtual machine lives in a separate ~330 MB writable and executable section (`.tls$`). Every code
site found so far for the file layer is plain `.didata` code. The widescreen fix runs 7 mid hooks and a byte patch in
`.didata` with no issue, the exe on disk must never be modified.

There's no anti-cheat and the game is offline single-player, so modding carries no ban risk.

The exe imports `dinput8.dll`, `winmm.dll` and `xinput1_4.dll`, so Ultimate ASI Loader works as `dinput8.dll` or
`winmm.dll` in the game folder. Several ASIs coexist fine (the widescreen fix and the mod loader).

## Data layout
### Game folder
| Path                 | Content                                                                                     |
|----------------------|---------------------------------------------------------------------------------------------|
| `Config/*.spe`       | `AG_TS.spe`, `CINE.spe`, `ReComputeNormals.spe`, `jade.spe`, loose files read by the engine |
| `Data/BigDir.jdproj` | Jade project file, see [BigDir](#bigdir)                                                    |
| `Data/Movies/*.bk2`  | 72 Bink 2 movies, loose                                                                     |
| `Data/Paks/*.pak`    | 23 BPAK archives, every other asset                                                         |

### Pak archives
| Pak                    | Count | Size          | Content                                                                                                    |
|------------------------|-------|---------------|------------------------------------------------------------------------------------------------------------|
| `Resources.pak`        | 1     | 8.7 GB        | Everything else: PNG images, Jade assets (`.cgro`, ...)                                                    |
| `Audio-common.pak`     | 1     | 601 MB        | Wwise sound banks (`BKHD`), language independent                                                           |
| `Audio-<language>.pak` | 6     | 391 to 399 MB | Localized Wwise banks (`de`, `en_US`, `es_ES`, `fr`, `it`, `nl`)                                           |
| `Shaders.pak`          | 1     | 116 MB        | DXBC shaders                                                                                               |
| `Text-<language>.pak`  | 13    | 377 to 719 KB | Localized text (`de`, `en_US`, `es_ES`, `fr`, `it`, `jp`, `ko`, `nl`, `pl`, `pt_BR`, `ru`, `zh_S`, `zh_T`) |
| `Engine.pak`           | 1     | 11 KB         | `SKU.ini`, `BGE.ini`, `BGE_Build.ini`, `BGE_InputMapping.ini`, `BGE_ShaderParameters.ini`                  |

`Engine.pak` was written 12 minutes after the other files on install and holds the SKU (`region=WW`,
`version=Steam`), it's likely store specific.

### BPAK format
The paks rebuild byte-identically from their unpacked entries (`tools.repack.repack_3_bpak`), with the layout computed
from scratch, so the rules below cover the whole format. Every integer is little-endian.

The header is `0x18` bytes:
| Offset | Type      | Value                                                                                  |
|--------|-----------|----------------------------------------------------------------------------------------|
| `0x00` | `char[4]` | `"BPAK"`                                                                               |
| `0x04` | `uint8`   | Pak version, `1`, followed by 3 alignment bytes (`02 00 00` in `Engine.pak`, garbage)  |
| `0x08` | `uint32`  | Priority per Ray1Map, `1` (`2` for `Shaders.pak`)                                      |
| `0x0C` | `uint32`  | Unknown, `0` (`1` for `Shaders.pak`), only in the 20th Anniversary Edition per Ray1Map |
| `0x10` | `uint32`  | Entry count                                                                            |
| `0x14` | `uint32`  | Size of the table of contents                                                          |

The **data** starts at `0x18`, every entry offset is relative to it. Each non-empty entry has one slot, in table order:
its stored bytes, then its extra bytes, padded with spaces (`0x20`) to a multiple of 16. Empty entries have an offset
of `0` and no slot. The **table of contents** follows the last slot and runs to the end of the file, one entry each:
| Field              | Type           | Notes                                                                                                    |
|--------------------|----------------|----------------------------------------------------------------------------------------------------------|
| Flag               | `uint8`        | `0` = named, `1` = keyed                                                                                 |
| Name length or key | `uint32`       | Named: the length of the name that follows, keyed: a 32-bit Jade key                                     |
| Name               | `char[length]` | Named entries only, no terminator                                                                        |
| Size               | `uint32`       | Unpacked size                                                                                            |
| Packed size        | `uint32`       | Size of the LZ4 block, `0` when stored raw                                                               |
| Extra size         | `uint32`       | Plain text stored right after the data, not counted in the size, never compressed                        |
| Unknown            | `uint32`       | Constant per pak (`0x7FFA`, `0x25F` or `0`), likely uninitialized memory of the tool that wrote the paks |
| Offset             | `uint64`       | Relative to `0x18`, `0` for empty entries                                                                |

What the entries hold:
- **Keys**: `Resources.pak` (224,306 entries) and `Text-*.pak` (every entry) are keyed by Jade BIG keys, e.g.
  `0x710041F9` shares the `0x71` prefix of `UniverseKey=71003ff9`. The original game's BIG file is keyed the same way.
- **Names**: Wwise files named by their Wwise ID (`Audio-*.pak`, `.bnk` and `.wem`, all raw), compiled shaders
  (`Shaders.pak`, `.sbc`, all LZ4), the INIs (`Engine.pak`), and 11,072 `<decimal number>.cgro` files plus a
  `texParamTable` in `Resources.pak` (`989859086.cgro` is `0x3B000D0E`, key-like as well).
- **Compression**: only 54,649 of the 235,378 entries of `Resources.pak` are LZ4, it unpacks to 14.0 GiB from 8.3 GiB.
- **Extra bytes**: 6,125 entries of `Resources.pak` carry INI-like text after their data, which looks like the
  remaster's settings appended to the original Jade data. Lights (`0x6200....`, 36 bytes of data) get
  `FogDensity=0.000000`, `IndirectMultiplier=...`, `LightIntensity=...`, `ShadowColor=...`, textures get
  `[Base]`, `Color=0x0012e9f8`, `Flags=0x0004`, `Format=0x10`, `Mark=0xffffffff`, ...

A QuickBMS script failed on a PS4 `Resources.pak` with `unknown flag 255`, other platforms likely use more flags.

### Entry types
Per Ray1Map, the remaster ships **unbinarized** data: where the original retail game packed every level into one
binarized blob, the remaster loads every asset from its own key, the way the editor does. Ray1Map lists the worlds
with their original paths, e.g. `0x5E0084DF` is `ROOT/EngineDatas/06 Levels/_main/_main_fix/_main_fix.wol`. For
modding, single assets can be replaced.

Jade files can start with a 4-character type tag (Ray1Map's `Jade_FileType`: `.gao`, `.wol`, `.wow`, `.gri`, `.oin`,
`.omd`, `.ova`, `.ofc`, `.fce`, `.snk`, `.wav`, `.txg`, ...), but the remaster only keeps it on `.gao` and `.wow`. The
engine knows the type of every other key from the reference it follows, so typing the rest requires walking the
references from the universe key (`0x71003FF9`) and parsing every format on the way.

What `tools.unpack.unpack_3_identify` identifies in `Resources.pak` (235,378 entries), by rule, with the two load
traces of 2026-10-16 (73 worlds visited):
| Rule            | Entries        | Types                                                                                                                                           |
|-----------------|----------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| Jade tag        | 71,465 (30.4%) | `.gao` 70,828 (game objects), `.wow` 637 (worlds, the world name at `+0x10`)                                                                    |
| Structure       | 27,455 (11.7%) | `.oin` 17,415, `.map` 7,353, `.cob` 2,687 (see below)                                                                                           |
| Load trace      | 16,693 (7.1%)  | Graphic objects or materials 5,922, `.oin` 2,490, `.ova` 2,490, `.trl` 1,305, link lists 946, `.map` 772, `.cob` 565, `.gol` 476, ...           |
| Name            | 11,072 (4.7%)  | `.cgro` 11,071 (named `<decimal key>.cgro`, every one matches an existing key, likely the remaster's compiled graphic objects), `texParamTable` |
| RIFF header     | 8,840 (3.8%)   | `.wav`, all XMA2 (`0x166`), mostly 32 kHz mono: the original Jade sounds in their Xbox format, the PC plays Wwise                               |
| Reference       | 8,396 (3.6%)   | `.ofc` 3,502, `.act` 2,107, `.snk` 1,008, `.smd` 966, `.ova` 678, `.txg` 132, ...                                                               |
| Texture table   | 3,700 (1.6%)   | `.tex`, listed in `texParamTable`, they start with `0E 00 0x 00` (the 16 TGA ones with `00 00 02 00`), see [Textures](#textures)                |
| Empty           | 750 (0.3%)     | No data                                                                                                                                         |
| Font descriptor | 82             | `.fod`, they start with `FONTDESC`                                                                                                              |
| PNG signature   | 15             | `.png`                                                                                                                                          |
| Unknown         | 86,910 (36.9%) | Down from 139,536 before the references, the load traces and the structural rules, every new trace types more                                   |

The **structural rules** recognize an entry from its content and the types of the keys it holds, applied until they
stop typing new entries, each one checked against the entries the other rules typed (none matches an entry of
another type):
| Rule             | Recognizes                                                                                                         | Typed  | Matches among the entries typed by other rules                        |
|------------------|--------------------------------------------------------------------------------------------------------------------|--------|-----------------------------------------------------------------------|
| AI instance      | 8 bytes, the key of an AI model, then a key (its variables, `own key - 1` for 2,475 of the 2,490 traced instances) | 17,415 | All 2,490 traced AI instances                                         |
| Collision map    | 8 bytes, `01 FF 00 00`, then the key of a collision object                                                         | 7,353  | All 759 traced 8-byte collision maps                                  |
| Collision object | Starts with the key of the collision game materials                                                                | 2,687  | 378 of the 565 traced collision objects, the others start differently |

The 8-byte entries were the biggest block of unknowns (37,772): AI instances, collision maps (`01 FF 00 00` then a
key) and about 1,100 entries of other shapes.

`texParamTable` is an array of 3,700 records of 64 bytes, one per texture:
- The texture key first.
- At `+0x08`, a copy of the start of the [texture header](#textures), mark to font descriptor key (20 bytes). It's
  identical in all 3,700 records, so a texture whose size changes needs its record updated too.
- The three check codes at `+0x20`, `+0x28` and `+0x30`.
- Parameters in the remaining bytes, mostly zeros (sometimes `1.0` or `7`).

The extra bytes are INI sections: `[Base]` on textures (2,666), `FogDensity=` on lights (3,307), `[Performance]`
(107), `[Procedural]` (36) and `[Anniversary]` (8).

Jade's reference lists store every reference as `[uint32 key][".ext"]`, the key followed by the extension of the
file it points at (object lists, action kits, AI models, sound banks, text group lists, ...). 4,911 entries of
`Resources.pak` hold such records, they give an extension to 64,977 keys (a single key gets two different ones).
Layer 3 uses them, along with the types of the [loader callbacks](#loader-callbacks) of the collected load traces.

### Textures
`tools.unpack.unpack_4_convert` converts all 3,700 textures of `Resources.pak` to DDS and TGA files, and
`tools.repack.repack_1_convert --check` rebuilds every entry byte-identically from these files and their metadata.

A texture entry is its content followed by Jade's texture header (Jaded's `TEX_tdst_File_Desc`), its last 32 bytes:
| Offset | Type        | Value                                                                                    |
|--------|-------------|------------------------------------------------------------------------------------------|
| `0x00` | `int32`     | Mark, `-1`                                                                               |
| `0x04` | `uint16`    | Flags                                                                                    |
| `0x06` | `uint8`     | Type: `13` cooked (3,684), `1` TGA (16)                                                  |
| `0x07` | `uint8`     | Color format, `16` (1,652) or `32` (2,048), not the bit depth                            |
| `0x08` | `uint16`    | Width                                                                                    |
| `0x0A` | `uint16`    | Height                                                                                   |
| `0x0C` | `uint32`    | Color (also in the `[Base]` extra bytes)                                                 |
| `0x10` | `uint32`    | Font descriptor key: the `.fod` of the 75 font atlases (`FONTDESC`, see below), else `0` |
| `0x14` | `uint32[3]` | Check codes `0xCAD01234`, `0x00FF00FF`, `0xC0DEC0DE`                                     |

The **cooked content** (Virtuos's "Nori" texture sets, Ray1Map's `TEX_Content_Cooked`) comes first:
| Offset | Type     | Value                                                                     |
|--------|----------|---------------------------------------------------------------------------|
| `0x00` | `uint16` | Version, `14`                                                             |
| `0x02` | `uint32` | Set type (below)                                                          |
| `0x06` | `uint32` | Map count, `0` stores the albedo only                                     |
| `0x0A` | `uint32` | Compressed format: `1` RGBA8, `2` DXT, `3` ASTC (every PC texture is DXT) |
| `0x0E` | `uint32` | Size of a map with alpha                                                  |
| `0x12` | `uint32` | Size of a map without alpha                                               |
| `0x16` | `bool`   | Alpha flag                                                                |
| `0x17` | `uint32` | Mipmap count                                                              |

Then, from `0x1B`:
1. **The maps**, each a whole mipmap chain, largest level first. A map is DXT5 when it has alpha, DXT1 otherwise.
   Only the albedo has alpha (when the flag is set), except in custom sets, where every map does.
2. **The shader parameters**: one float for set types 1 to 5, two for type 6.
3. **The custom shader name** (custom and type 6 sets): 64 bytes, null-terminated. The bytes after the null are
   leftovers from the cooker's memory.

The set types, with the maps they store:
| Set type | Name     | Maps                                                                                              | Textures |
|----------|----------|---------------------------------------------------------------------------------------------------|----------|
| `0`      | Invalid  | Albedo, every one DXT1, the plain textures                                                        | 1,404    |
| `1`      | Simple   | Albedo                                                                                            | 926      |
| `2`      | Standard | Albedo, normal, spec/gloss/occlusion                                                              | 1,147    |
| `3`      | Parallax | Albedo, normal, spec/gloss/occlusion, height                                                      | 10       |
| `4`      | Emissive | Albedo, normal, spec/gloss/occlusion, emissive                                                    | 83       |
| `5`      | Custom   | 1 to 4 maps, for a named shader (`SoftMesh`, `HologramMap`, `SimpleEmissive`, `IndoorWater`, ...) | 109      |
| `6`      | Unnamed  | Albedo, for a named shader, two shader parameters                                                 | 5        |

Ray1Map names the third map height/emissive and the fourth spec/gloss/occlusion, the textures show the opposite:
- **The third map** packs three channels. It's flat `(0, 0, 255)` when unused, and on a tile it darkens only in
  blue in the grooves, so blue is occlusion.
- **The fourth map** is the grayscale height map of the parallax sets, and the glow of the emissive sets (an eye).

Every level is stored bottom-up, as in OpenGL. The converted DDS files are flipped to be top-down, block by block:
the block rows are reversed, then the pixel rows inside every block. The flip is lossless and its own inverse. The
small levels of the 290 textures whose size isn't a power of two (mostly 2560x1440, with 9 levels) have heights that
aren't multiples of 4, they end up shifted by up to 3 rows in the DDS and come back exact once flipped again.

Two kinds of entries convert differently:
- **The 16 TGA textures** are plain uncompressed TGA files (24 or 32 bits, bottom-left origin) followed by the
  header, and convert as they are. One of them (`0x4901F0EF`) is a collage of portrait photos, likely the original
  team.
- **`0x4900B368`** (2x2) holds a 128-byte map for an 8-byte chain. The rest is leftover memory from the cooker, a
  UTF-16 path from Virtuos's build machine (`...LY_MS24_RC\P\Resources\CookingDir\WIN64\Textures\19000...`). The
  converter keeps it in the metadata.

The font descriptors (`.fod`, Jaded's `STR_b_LoadFontDescriptor`) hold:
- `"FONTDESC"`, then a `uint32` character count.
- One record per glyph: a `uint32` character code, then 4 floats (`u0`, `v0`, `u1`, `v1`), the glyph's rectangle in
  the atlas.
- A `-1` at the end.

Layer 3 types them from their signature.

### BigDir
`Data/BigDir.jdproj` ships with the retail game:
```ini
[Global]
UniverseKey=71003ff9
InitialBigFileVersion=37
#Ignore file in big dir scanning : ignoring patern should be separated by a coma. To filter by extension use <*.> pattern.
BigDirIgnore=*.hlsl,ROOT\BigDir___locked__.w,ROOT\EngineDatas\04 Technical Bank\Shaders\*,*.bak
```

"BigDir" looks like the editor's unpacked form of the BIG file, a folder tree (`ROOT\EngineDatas\...`) instead of an
archive, with file names formatted by `"%s%s.%08x.%s"` (name, key, extension). Whether the retail exe can still load
from a BigDir is open.

## Modding results
In-game tests of edited paks, rebuilt or patched with the tools (the edited entries recompressed with LZ4 high
compression, so the paks differ in size from the originals):
| Date       | Pak              | Change                                                                                                   | Result                                                            |
|------------|------------------|----------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------|
| 2026-10-16 | `Text-fr.pak`    | `Nouvelle partie` → `MDISK ca marche` in entry `0x4900FDCA` (same length)                                | Shown in the main menu                                            |
| 2026-10-16 | `Text-en_US.pak` | `New Game` → `MDISK!!!` in entry `0x4900FDC6` (same length)                                              | Rebuilt and installed with the French one, not checked in English |
| 2026-10-16 | `Engine.pak`     | `FramePerf=0` → `1` in `BGE.ini`                                                                         | No FPS counter                                                    |
| 2026-10-17 | `Resources.pak`  | `MDISK` painted in magenta DXT blocks on the French logo `0x09001331`, in its top-down DDS of layer 4    | Shown on the French main menu logo, the right way up              |
| 2026-10-18 | `Resources.pak`  | The same logo, patched in place: the entry and a new table of contents appended after the original bytes | Shown the same, the game reads the table of contents from the end |
| 2026-10-20 | `Resources.pak`  | The same logo, installed as a mod by the mod loader app, the entry stored raw (packed size `0`)          | Shown the same, a compressed entry can be replaced by a raw one   |

Nothing checks the paks: a rebuilt pak with a recompressed entry and a different size loads. The FPS counter result
is inconclusive, either the counter is compiled out of the retail exe or this `BGE.ini` isn't the one that wins
(`BGE.player.ini` is read after it), to check with a setting that's always visible.

A texture edited as a DDS file in layer 4 and brought back by the repack steps shows in game, which confirms the
cooked layout, the bottom-up orientation and the flip of the converted DDS files. The main menu logo has one texture
per language: `0x09001331` (French), `0x0900133A` (English), `0x09001343` and `0x0900134C` (Chinese), `0x09001355`
(Korean), `0x0900135E` (Japanese).

A pak doesn't need to be rewritten to change entries, `tools.patch_paks` appends the edited entries and a new table
of contents after the original bytes, and only changes the table size in the header:
```text
[header][original data][original table of contents][edited entries][new table of contents]
```
The game finds the table of contents from the end of the file (file size minus the table size of the header), like
the tools' reader, and ignores the original one left in the middle. Patching `Resources.pak` takes under a second,
against 12 minutes for a full rebuild. Cutting the file back to its original size and header restores the original,
byte-identical.

## Engine file layer
The strings and immediates found statically around the file layer (the resolver below is the part confirmed at
runtime):
| RVA                    | Section   | What                                                                                                                           |
|------------------------|-----------|--------------------------------------------------------------------------------------------------------------------------------|
| `+98CE4`               | `.didata` | `'BPAK'` immediate                                                                                                             |
| `+AE6BD3`              | `.didata` | `'BPAK'` immediate, likely the magic check of the pak reader                                                                   |
| `+ACFEF7`, `+AD1601`   | `.didata` | `"BigDir.j"` immediates, an inline `"BigDir.jdproj"`                                                                           |
| `+16D62C0`             | `.rodata` | `"Data/BigDir.jdproj"`                                                                                                         |
| `+16FF128`..`+16FF148` | `.rodata` | `"BigDirIgnore"`, `"UniverseKey"`, `"InitialBigFileVersion"` (the `.jdproj` keys)                                              |
| `+16FF1E0`             | `.rodata` | `"%s%s.%08x.%s"`, next to the `BIGopen.cpp` path                                                                               |
| `+1700500`..`+17005B0` | `.rodata` | `"Config/jade.spe"`, `"Config/ForceComputeNormals.spe"`, `"Config/CINE.spe"`, `LOAdefs.cpp` path, `"Key does not exists (%x)"` |
| `+1702860`, `+170B304` | `.rodata` | `"BPAK"` strings, the second one next to a Fusion `packages` path                                                              |
| `+1702868`             | `.rodata` | `"Data/Paks/"`                                                                                                                 |
| `+1702E30`             | `.rodata` | `"BIG_Read"` and the `BIGread.cpp` asserts (`BIG_fseek`, `BIG_fread`)                                                          |
| `+1705E28`             | `.rodata` | `"BIG_ReadAllFats"` and the `BIGfat.cpp` asserts (`BIG_gst.dst_FatTable`, `st_KeyTableToPos`)                                  |
| `+17066E0`             | `.rodata` | `BIGcomp.cpp` path                                                                                                             |
| `+16DD7F8`             | `.rodata` | `".cgro"`                                                                                                                      |

`"Key does not exists (%x)"` suggests assets are still looked up by 32-bit key at some level.

### The reference resolver (`LOA_Resolve`)
Found from the only reference to `"Key does not exists (%x)"`, and nearly unchanged from Jade's `LOA_Resolve` (see
Jaded's `LOAdefs.c`). Every file the engine loads goes through it: code that needs a file queues a reference (key,
where to store the result, a **loader callback** specific to the file type, flags), then the resolver walks the
queue and calls the callback of every reference whose file isn't loaded yet:
| RVA        | What                                                                                                      |
|------------|-----------------------------------------------------------------------------------------------------------|
| `+AD68E0`  | `LOA_Resolve`, the loop over the queue                                                                    |
| `+210E1F0` | The queue (Jade's `LOA_gast_Stack`), 5,000 slots (`LOA_C_MaxStack`, `0x1388`) of 32 bytes                 |
| `+20A2700` | The slot being resolved (`LOA_gi_CurRef`)                                                                 |
| `+20A2704` | The next free slot (`LOA_gi_LastRef`)                                                                     |
| `+AEAC00`  | Hash lookup, called twice: key to file position, then file position to already loaded data (`-1` if none) |
| `+AD69CB`  | `call qword ptr [rbx + 0x10]`, the loader callback, receives the file position in `ecx`                   |
| `+AD6A8B`  | The error path, a missing key whose reference has the "must exist" flag (`LOA_C_MustExists`, bit 0)       |

A queue slot (Jade's `LOA_tdst_Ref`):
| Offset  | Type     | Field                                                                                      |
|---------|----------|--------------------------------------------------------------------------------------------|
| `+0x00` | `uint32` | Key                                                                                        |
| `+0x08` | `void**` | Where to store the loaded data                                                             |
| `+0x10` | `void*`  | Loader callback, `ULONG callback(ULONG position)`, one per file type                       |
| `+0x18` | `uint8`  | Flags (`0x01` must exist, `0x04` don't save the pointer, `0x08` temporary allocation, ...) |

Queueing a reference (`_LOA_MakeFileRef`) is inlined in every caller in this build, there's no single function to
hook. The mod loader's load trace (`[Debug] TraceLoads`) hooks the resolver instead, right after the loaded data
lookup and right after the callback returns: the references queued while a callback runs are the children of its
file, so the trace records every key with its loader callback (its type) and the key that referenced it.

Only 13 source file paths are left in `.rodata` (`BIGfiles`, audio, `INOut`, `STRing`, `BASe`, `COLlision`), the
asserts that named the callbacks' source files are stripped, the callbacks get named from the types of the keys
they load instead.

### Loader callbacks
Named from the first load trace (2026-10-16, a few levels: 13,696 rows, 8,988 keys, 29 callbacks) with
`tools.trace.analyze_callbacks`. The trace keeps the order in which every loader requests its children, which is
the order of its `LOA_MakeFileRef` calls in the Jaded source, and the keys of the children are found at fixed
offsets of the parent files (the fields of the formats that hold references):
| RVA       | Jade callback                     | Loads                       | Evidence                                                                                                                                 |
|-----------|-----------------------------------|-----------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| `+9B6150` | `WOR_ul_World_LoadCallback`       | World (`.wow`)              | `.wow` tag, requests a grid twice, the object list, the networks (Jaded's order), keys at `+0xD0`, `+0xD4`, `+0xD8`                      |
| `+9B5FA0` | `WOR_ul_GameObjectGroupCallback`  | World object list           | `[key][".gao"]` records                                                                                                                  |
| `+9E9E60` | `GRID_ul_CallbackWorldGrid`       | Grid (`.gri`)               | Compressed grid key at `+0x8`                                                                                                            |
| `+9E9CC0` | `GRID_ul_CallbackCompressedGrid`  | Compressed grid             | Requested by the grid                                                                                                                    |
| `+9E4C40` | `WAY_ul_AllNetWorksCallback`      | Network list                | Last request of the world                                                                                                                |
| `+9E4AF0` | `WAY_ul_NetWorkCallback`          | Network                     | Root object key at `+0x0`                                                                                                                |
| `+9EA250` | `OBJ_ul_GameObjectCallback`       | Game object (`.gao`)        | `.gao` tag                                                                                                                               |
| `+A39860` | `GEO_ul_Load_ObjectCallback`      | Graphic object or material  | The first two requests of an object (visual, material), multi-materials request their sub-materials                                      |
| `+9ED490` | `GRP_ul_LoadGrpCallback`          | Group (`.grp`)              | Object list key at `+0x0` in 113 of 113 (Jaded's `GRPload.c` reads it first)                                                             |
| `+9ED200` | `OBJ_ul_World_LoadGolCallback`    | Object list (`.gol`)        | `[key][".gao"]` records                                                                                                                  |
| `+9E47B0` | `WAY_ul_AllLinkListsCallback`     | Link lists                  | Requests a network, then objects                                                                                                         |
| `+AFDDA0` | `SND_ul_CallbackUnknownBank`      | Sound bank                  | `[key][".snk"]`, `[key][".smd"]` records, between the AI and the collisions in an object's requests, never followed (the PC plays Wwise) |
| `+B40340` | `AI_ul_CallbackLoadInstance`      | AI instance (`.oin`)        | 8-byte files, model key at `+0x0` and variables key at `+0x4` in 603 of 603                                                              |
| `+B3E8E0` | `AI_ul_CallbackLoadModel`         | AI model (`.omd`)           | Requests its variables, then its functions (Jaded's order)                                                                               |
| `+B3EB90` | `AI_ul_CallbackLoadVars`          | AI variables (`.ova`)       | Requests its init functions                                                                                                              |
| `+B3F520` | `AI_ul_CallbackLoadFunction`      | AI function (`.ofc`)        | Requested by models and variables                                                                                                        |
| `+9BD970` | `ACT_ul_ActionKitCallback`        | Action kit                  | `[key][".act"]` records                                                                                                                  |
| `+9BDBC0` | `ACT_ul_ActionCallback`           | Action (`.act`)             | Event tracks at `+0x4`, then shape at `+0xC` (Jaded's order)                                                                             |
| `+B442C0` | `EVE_ul_CallbackLoadListTracks`   | Event tracks (`.trl`)       | Requested by actions and objects, request the objects of their tracks                                                                    |
| `+9BEEF0` | `ANI_ul_ShapeCallback`            | Shape                       | Second request of an action                                                                                                              |
| `+9E7A50` | `COL_ul_CallBackLoadInstance`     | Collision instance (`.cin`) | Collision set key at `+0x0`                                                                                                              |
| `+9E7F30` | `COL_ul_CallBackLoadColSet`       | Collision set               | Requested by the collision instance                                                                                                      |
| `+9E82D0` | `COL_ul_CallBackLoadColMap`       | Collision map (`.map`)      | Collision object key at `+0x4`                                                                                                           |
| `+9E8540` | `COL_ul_CallBackLoadCob`          | Collision object (`.cob`)   | Game materials key at `+0x0`                                                                                                             |
| `+9E8E50` | `COL_ul_CallBackLoadGameMaterial` | Collision game materials    | A single file for the whole game, requested 120 times                                                                                    |
| `+9BFAC0` | No Jaded counterpart              | Text group list             | `[key][".txg"]` records, requested by top-level code                                                                                     |
| `+9BFC80` | No Jaded counterpart              | Text group (`.txg`)         | 208 bytes, 13 entries of 16 bytes (one per language), ids key at `+0x0`, strings key at `+0x8`                                           |
| `+9C0070` | No Jaded counterpart              | Text ids (`.txi`)           | First key of a text group entry                                                                                                          |
| `+9BFFD0` | No Jaded counterpart              | Text strings (`.txs`)       | Second key of a text group entry, `\p16\...` text markup                                                                                 |

No texture goes through the resolver: Jade's materials reference textures by index into a global texture list,
loaded separately, which matches the remaster's `texParamTable`.

## Prior art
The other projects around the game and the Jade engine, with their licenses, are listed in
[REPOSITORIES.md](REPOSITORIES.md).

Community references: [ResHax BPAK thread](https://reshax.com/topic/845-beyond-good-and-evil-20th-anniversary-edition-pak-bpak/),
[Steam "Mod Tools" thread](https://steamcommunity.com/app/2556990/discussions/0/4407417241455999354/),
[raydev.wiki Jade overview](https://raydev.wiki/jade:overview).

## Open questions
1. **BPAK**: solved (see [BPAK format](#bpak-format)), except the meaning of the three unknown header fields and of
   the constant unknown entry field.
2. **Pak mounting**: how `Data/Paks/` files are enumerated (hard-coded list, directory scan, language suffix) and
   whether an extra pak can be mounted with priority (Ray1Map names the header field at `0x08` "priority"). Nothing
   checks the paks (see [Modding results](#modding-results)).
3. **Lookup path**: table of contents parsing, name or key to entry, read and decompress, and how `BIG_Read` /
   `LOA` sit on top. Settles keys vs CRC names.
4. **BigDir**: whether loading loose files is reachable in retail.
5. **Asset formats**: type the unknown entries by walking the references from the universe key (Ray1Map's
   loader as reference), and check whether the Jade files keep the original game's structures, which decides what
   replacing or adding an asset means (keys referenced inside other assets).
6. **Other channels**: Wwise IO, shaders, Bink movies, `Config/*.spe`, `BGE_Build.ini` switches, AI2C scripts vs a
   remaining AI interpreter. On the 2003 PC version the AI is hybrid, per irisEng's decompilation
   ([REPOSITORIES.md](REPOSITORIES.md)): a function runs as compiled C when the exe has it (most `.ofc` are 12-byte
   stubs there), as interpreted nodes otherwise. The remaster ships whole functions instead (3,502 `.ofc`, 16.4 MiB)
   with their variable names. The companion's `i_cheat_mode_on` (`0x35001FF7`) switches it to a joystick-driven
   debug mode on the 2003 version, it's still to be tried on the remaster.
7. **Injection strategy**: patching the paks in place works, in under a second (see
   [Modding results](#modding-results)). A mod pak mounted by the ASI, or loose files redirected by the ASI, would
   leave the game files untouched.

## Method and tooling
- Static analysis: Python with `pefile` (PE headers, sections) and `capstone` (disassembly), strings and their
  RIP-relative references as entry points, function boundaries from the `.pdata` exception table.
- Runtime confirmation: Cheat Engine and temporary logging hooks in the mod loader.
- Archives: the Python tools in `tools/` unpack the paks layer by layer (see the README), validated by byte-identical
  rebuilds, the mod loader app (`packages/modloader`) patches them the same way.
