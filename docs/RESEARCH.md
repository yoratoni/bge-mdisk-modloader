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
Working hypothesis from hex dumps, **to be confirmed** by the packer's round trip:
- Every pak starts with the `"BPAK"` magic followed by small integers that differ per pak: `01 02 00 00 01 00 00 00
  00 00 00 00` for `Engine.pak`, `01 00 00 00 02 00 00 00 01 00 00 00` for `Shaders.pak`,
  `01 00 00 00 01 00 00 00 00 00 00 00` for the others.
- The data blobs look **LZ4 block** compressed: `Resources.pak` starts with `72 97 03 00 B9 A0 6A 00` then an LZ4
  token (`F0 05`) followed by literal bytes `89 50 4E 47 0D 0A 1A 0A ...` (a PNG header).
- The **table of contents** sits at the end of the file, entries look like this:

| Field         | Type           | Notes                                                                                  |
|---------------|----------------|----------------------------------------------------------------------------------------|
| Name length   | `uint32`       |                                                                                        |
| Name          | `char[length]` | No terminator, e.g. `989859086.cgro`                                                   |
| Size          | `uint32`       | Unpacked size (assumed)                                                                |
| Packed size   | `uint32`       | Compressed size (assumed)                                                              |
| Runtime field | `uint64`       | Looks like a pointer left over from the tool that wrote the pak (`0x00007FFA........`) |
| Offset        | `uint64`       | Absolute, 16-byte aligned                                                              |
| Flags         | `uint8`        |                                                                                        |

- **Names**: `Resources.pak` names are `<decimal number>.<extension>`, e.g. `989859086.cgro`, where 989859086 is
  `0x3B000D0E`. Either Jade **BIG keys** (consecutive numbers, a typical key allocation) or CRCs of the original
  paths (ResHax's conclusion), to settle. `Text-*.pak` tables of contents have no names. A QuickBMS script failed on a
  PS4 `Resources.pak` with `unknown flag 255`.

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
| Tool                                                                                  | Author   | Target              | Scope and status                                                                                               |
|---------------------------------------------------------------------------------------|----------|---------------------|----------------------------------------------------------------------------------------------------------------|
| Mdisk                                                                                 | yoratoni | Original `.bf`      | TypeScript extract/build tool, deleted, never archived (Software Heritage only saw it deleted)                 |
| [BGEModTools](https://github.com/nillvy/BGEModTools)                                  | nillvy   | BPAK                | C#, unpacks and identifies `png`, `gao`, `wem`, `fnt`, identical rebuild per its author, abandoned in May 2025 |
| [`Beyond_Good_and_Evil_PAK_BPAK_script.bms`](https://github.com/bartlomiejduda/Tools) | ikskoks  | BPAK                | QuickBMS, unpacks, handles the hashed names of `Resources.pak`                                                 |
| [`bf.bt`](https://github.com/xesf/game-data-reverse-engineering)                      | xesf     | Original `.bf`      | 010 Editor template, not checked yet                                                                           |
| [JadeStudio](https://github.com/4g3v/JadeStudio)                                      | 4g3v     | Original Jade games | Not checked yet                                                                                                |
| [Jaded](https://github.com/hogsy/jaded)                                               | hogsy    | Jade engine         | Not checked yet                                                                                                |

Community references: [ResHax BPAK thread](https://reshax.com/topic/845-beyond-good-and-evil-20th-anniversary-edition-pak-bpak/),
[Steam "Mod Tools" thread](https://steamcommunity.com/app/2556990/discussions/0/4407417241455999354/),
[raydev.wiki Jade overview](https://raydev.wiki/jade:overview).

## Open questions
The survey, every answer goes into this document:
1. **BPAK**: header fields, table of contents (including the nameless `Text-*` one), flags, chunking, compression.
2. **Pak mounting**: how `Data/Paks/` files are enumerated (hard-coded list, directory scan, language suffix),
   whether an extra pak can be mounted with priority, and whether anything checks the paks (hash, CRC, size).
3. **Lookup path**: table of contents parsing, name or key to entry, read and decompress, and how `BIG_Read` /
   `LOA` sit on top. Settles keys vs CRC names.
4. **BigDir**: whether loading loose files is reachable in retail.
5. **Asset formats**: whether the Jade files inside the paks (`.gao`, `.cgro`, ...) keep the original game's
   structures, which decides what replacing or adding an asset means (keys referenced inside other assets).
6. **Other channels**: Wwise IO, shaders, Bink movies, `Config/*.spe`, `BGE_Build.ini` switches, AI2C scripts vs a
   remaining AI interpreter.
7. **Injection strategy**: rank patching paks in place, a mod pak mounted by the ASI, and loose files redirected
   by the ASI.

## Method and tooling
- Static analysis: Python with `pefile` (PE headers, sections) and `capstone` (disassembly), strings and their
  RIP-relative references as entry points, function boundaries from the `.pdata` exception table.
- Runtime confirmation: Cheat Engine and temporary logging hooks in the mod loader.
- Archives: `MDiskPacker` (planned), validated by byte-identical round trips.
