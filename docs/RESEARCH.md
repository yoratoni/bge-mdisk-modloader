# Research notes: BG&E 20th Anniversary Edition, modding
Everything learned while reverse engineering `bge.exe` and its data for the mod loader: archive formats, engine file
layer, injection points, and what is still open. Written so the work can be resumed from scratch.

All addresses are **RVAs** (offsets from the image base) for the build below, in Cheat Engine an RVA `0xAE6BD3` is
written `"bge.exe"+AE6BD3`, in static tools it's `0x140AE6BD3` (default image base `0x140000000`). The display
findings (aspect ratio, cameras, FOV) live in the widescreen fix's own `docs/RESEARCH.md`.

## Table of contents
1. [The build](#the-build)
2. [Protection and injection](#protection-and-injection)
3. [Data layout](#data-layout)
4. [Engine file layer](#engine-file-layer)
5. [Prior art](#prior-art)
6. [Open questions](#open-questions)
7. [Method and tooling](#method-and-tooling)

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
**Denuvo Anti-Tamper**: the real game code is plain and unencrypted in `.didata` (RVA `0x1000`, ~21 MB), Denuvo's
virtual machine lives in a separate ~330 MB writable + executable section (`.tls$`). Every code site found so far for
the file layer is plain `.didata` code. The widescreen fix runs 7 mid hooks and a byte patch in `.didata` with no
issue, the exe on disk must never be modified.

There is **no anti-cheat** and the game is offline single-player, so modding carries no ban risk.

**Injection**: the exe imports `dinput8.dll`, `winmm.dll` and `xinput1_4.dll`, so Ultimate ASI Loader works as
`dinput8.dll` or `winmm.dll` in the game folder. Several ASIs coexist fine (the widescreen fix and the mod loader).

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
**Confirmed**: the paks are rebuilt byte-identically from their unpacked entries (`tools/repack_1_bpak.py`), the
layout is computed from scratch, so the rules below are the whole format. Every integer is little-endian.

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

What `tools/unpack_3_identify.py` can identify with certainty in `Resources.pak`:
| Type    | Entries | How                                                                                                                       |
|---------|---------|---------------------------------------------------------------------------------------------------------------------------|
| `.gao`  | 70,828  | Game objects, tag at offset 0                                                                                             |
| `.cgro` | 11,071  | Named `<decimal key>.cgro`, every one matches an existing key, likely the remaster's compiled version of a graphic object |
| `.wav`  | 8,840   | RIFF WAVE, all XMA2 (`0x166`), mostly 32 kHz mono: the original Jade sounds in their Xbox format, the PC plays Wwise      |
| `.tex`  | 3,700   | Listed in `texParamTable`, they start with `0E 00 0x 00` (16 with `00 00 02 00`)                                          |
| `.wow`  | 637     | Worlds, tag at offset 0, the world name at `+0x10`                                                                        |
| `.png`  | 15      | PNG signature                                                                                                             |
| Empty   | 750     | No data                                                                                                                   |
| Unknown | 139,536 | 59% of the pak, including 37,772 entries of 8 bytes holding two keys, the second being the entry's own key minus 1        |

`texParamTable` is an array of 3,700 records of 64 bytes, one per texture: the texture key first, then fields
framed by the `0xCAD01234` (`+0x20`) and `0xC0DEC0DE` (`+0x30`) markers of the original Jade texture headers.

The extra bytes are INI sections: `[Base]` on textures (2,666), `FogDensity=` on lights (3,307), `[Performance]`
(107), `[Procedural]` (36) and `[Anniversary]` (8).

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
from a BigDir is one of the most valuable open questions.

## Engine file layer
Leads only, nothing confirmed at runtime yet:
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

## Prior art
| Tool                                                                                  | Author           | Target                                                 | Scope and status                                                                                                                            |
|---------------------------------------------------------------------------------------|------------------|--------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| Mdisk                                                                                 | yoratoni         | Original `.bf`                                         | TypeScript extract/build tool, deleted, never archived (Software Heritage only saw it deleted)                                              |
| [BGEModTools](https://github.com/nillvy/BGEModTools)                                  | nillvy           | BPAK                                                   | C#, unpacks and identifies `png`, `gao`, `wem`, `fnt`, identical rebuild per its author, abandoned in May 2025                              |
| [`Beyond_Good_and_Evil_PAK_BPAK_script.bms`](https://github.com/bartlomiejduda/Tools) | ikskoks          | BPAK                                                   | QuickBMS, unpacks, handles the hashed names of `Resources.pak`                                                                              |
| [`bf.bt`](https://github.com/xesf/game-data-reverse-engineering)                      | xesf             | Original `.bf`                                         | 010 Editor template, not checked yet                                                                                                        |
| [Ray1Map](https://github.com/BinarySerializer/Ray1Map)                                | BinarySerializer | Jade games, **including the 20th Anniversary Edition** | Unity viewer, reads BPAK (`BIG_PakFile.cs`), lists the unbinarized worlds (`Jade_BGE_Anniversary_Manager.cs`), no license so reference only |
| [JadeStudio](https://github.com/4g3v/JadeStudio)                                      | 4g3v             | Original Jade games                                    | Not checked yet                                                                                                                             |
| [Jaded](https://github.com/hogsy/jaded)                                               | hogsy            | Jade engine                                            | Community fork of the Jade engine source (2006 Rayman 4 prototype): `BIGfiles`, object, graphic object and texture loaders, no license      |

Community references: [ResHax BPAK thread](https://reshax.com/topic/845-beyond-good-and-evil-20th-anniversary-edition-pak-bpak/),
[Steam "Mod Tools" thread](https://steamcommunity.com/app/2556990/discussions/0/4407417241455999354/),
[raydev.wiki Jade overview](https://raydev.wiki/jade:overview).

## Open questions
The survey, every answer goes into this document:
1. **BPAK**: solved (see [BPAK format](#bpak-format)), except the meaning of the three unknown header fields and of
   the constant unknown entry field.
2. **Pak mounting**: how `Data/Paks/` files are enumerated (hard-coded list, directory scan, language suffix),
   whether an extra pak can be mounted with priority (Ray1Map names the header field at `0x08` "priority"), and
   whether anything checks the paks (hash, CRC, size).
3. **Lookup path**: table of contents parsing, name or key to entry, read and decompress, and how `BIG_Read` /
   `LOA` sit on top. Settles keys vs CRC names.
4. **BigDir**: whether loading loose files is reachable in retail.
5. **Asset formats**: type the 139,536 unknown entries by walking the references from the universe key (Ray1Map's
   loader as reference), and check whether the Jade files keep the original game's structures, which decides what
   replacing or adding an asset means (keys referenced inside other assets).
6. **Other channels**: Wwise IO, shaders, Bink movies, `Config/*.spe`, `BGE_Build.ini` switches, AI2C scripts vs a
   remaining AI interpreter.
7. **Injection strategy**: rank patching paks in place, a mod pak mounted by the ASI, and loose files redirected
   by the ASI.

## Method and tooling
- Static analysis: Python with `pefile` (PE headers, sections) and `capstone` (disassembly), strings and their
  RIP-relative references as entry points, function boundaries from the `.pdata` exception table.
- Runtime confirmation: Cheat Engine and temporary logging hooks in the mod loader.
- Archives: the Python tools in `tools/` unpack the paks layer by layer (see the README), validated by byte-identical
  rebuilds, `MDiskPacker` will do the same in C++.
