<p align="center">
  <br />
  <a href="https://yoratoni.com" target="_blank"><img width="100px" src="https://yoratoni.com/favicon.ico" /></a>
  <h2 align="center">@yoratoni/bge-mdisk-modloader</h2>
  <p align="center">A mod loader for Beyond Good & Evil 20th anniversary edition.</p>
</p>

> Note: I'm not a fan but yes, i'm using AI a bit for lookups and docs, I had my share of looking at
> HxD for days and days, as you know, reverse engineering is a tedious process and having AI
> assistance helps streamline some of the more repetitive tasks.

## Status
Early research phase, nothing usable for players yet. The goal is to make the 20th Anniversary Edition actually
moddable, previous community tools stopped at extracting its files.

The project is split in packages, each one with its own build, sources, dependencies and tests:
| Package              | Output                              | Role                                                                                                                          |
|----------------------|-------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| `packages/asi`       | `MDiskModLoader.asi`                | The in-game toolbox (debugging and runtime injection), loaded by Ultimate ASI Loader, Windows only                            |
| `packages/modloader` | MDisk Mod Loader (work in progress) | The desktop app installing the mods, Electron, Windows and Linux (Steam Deck), see its [README](packages/modloader/README.md) |
| `packages/bpak`      | Library (planned)                   | The `.pak` archive format (read, write, compression), shared by the other packages, portable                                  |
| `packages/packer`    | `MDiskPacker.exe` (planned)         | The repacker, unpacks and repacks the game's `Data/Paks/*.pak` archives to apply mods, portable                               |

The name comes from the MDisks of the game, and from Mdisk, an extract/build tool for the original game's
`sally_clean.bf` that got lost years ago.

The reverse engineering behind the project (archive format, engine structures, hook sites) is documented in
[docs/RESEARCH.md](docs/RESEARCH.md).

## Building from source
Requirements (the same as the widescreen fix):
- [LLVM](https://github.com/llvm/llvm-project/releases) (Clang >= 20), the project builds in C++23.
- [CMake](https://cmake.org/download/) >= 3.21 and [Ninja](https://ninja-build.org/).
- [vcpkg](https://learn.microsoft.com/vcpkg/get_started/get-started), with the `VCPKG_ROOT` environment variable
  pointing to its installation directory.
- The Visual Studio Build Tools ("Desktop development with C++" workload), Clang targets the MSVC ABI.

```bash
# Debug build (output in "build/")
cmake --preset default
cmake --build --preset default

# Release build (output in "build-release/")
cmake --preset release
cmake --build --preset release

# Run the tests
ctest --test-dir build --output-on-failure
```

Every binary lands at the root of the build directory. Packages can be turned off when configuring:
| Option              | Default         | Description                                       |
|---------------------|-----------------|---------------------------------------------------|
| `MDISK_BUILD_ASI`   | `ON` on Windows | Builds the in-game toolbox (`MDiskModLoader.asi`) |
| `MDISK_BUILD_TESTS` | `ON`            | Builds the tests of every enabled package         |

```bash
# Configure without the ASI
cmake --preset default -DMDISK_BUILD_ASI=OFF
```

The version is defined in the `project()` call of the root `CMakeLists.txt`, shared by every C++ package, and
repeated in `packages/modloader/package.json` for the app. Pushing a `vX.Y.Z` tag matching it builds, tests and
publishes the release ZIP through the GitHub workflow.

## Research tools
The Python package in `tools/` copies the game files into the `workspace/` folder (ignored by git) and unpacks them
layer by layer, every layer is made from the previous one, repacking does the same in reverse. The scripts are
modules, run from the repository root with `python -m`:
| Module                           | Output                             | Role                                                                                                     |
|----------------------------------|------------------------------------|----------------------------------------------------------------------------------------------------------|
| `tools.copy_game`                | `workspace/game/`                  | Copies the paks, `Config/` and `BigDir.jdproj` from the game folder (only what changed)                  |
| `tools.unpack.unpack_1_bpak`     | `workspace/unpacked/1-bpak/`       | Unpacks every pak into its entries as stored and a `toc.json`                                            |
| `tools.unpack.unpack_2_lz4`      | `workspace/unpacked/2-lz4/`        | Decompresses the entries of layer 1                                                                      |
| `tools.unpack.unpack_3_identify` | `workspace/unpacked/3-identified/` | Sorts the entries of layer 2 into one folder per type (`unknown/` when not identified yet)               |
| `tools.unpack.unpack_4_convert`  | `workspace/unpacked/4-converted/`  | Converts the textures of layer 3 to DDS (one per map, top-down) and TGA files, with their metadata       |
| `tools.repack.repack_1_convert`  | `workspace/unpacked/2-lz4/`        | Brings the textures edited in layer 4 back into layer 2, `--check` proves layer 4 rebuilds them exactly  |
| `tools.repack.repack_2_lz4`      | `workspace/unpacked/1-bpak/`       | Brings the entries edited in layer 2 back into layer 1, recompressed                                     |
| `tools.repack.repack_3_bpak`     | `workspace/repacked/`              | Rebuilds the paks from layer 1 and checks they're byte-identical to the game's                           |
| `tools.install_paks`             | The game folder                    | Installs the rebuilt paks (backing up the originals in `workspace/backups/`), or restores the originals  |
| `tools.patch_paks`               | The game folder                    | Appends the entries edited in layer 1 to the game's paks in seconds, or cuts them back to the originals  |
| `tools.trace.collect_trace`      | `workspace/traces/`                | Copies the load trace the ASI wrote in the game folder (`[Debug] TraceLoads`), one file per game session |
| `tools.trace.analyze_callbacks`  | The console                        | Reports what every loader callback of the traces loads, to name them (see `docs/RESEARCH.md`)            |

The paths that depend on the computer live in `mdisk.toml` at the repository root, ignored by git: copy
`mdisk.example.toml` and set `game_dir` (the game folder) and optionally `workspace_dir` (to put the workspace on
another drive).

```bash
# Once: the virtual environment (Python >= 3.11) and the local settings
python -m venv .venv
.venv/Scripts/python -m pip install -r tools/requirements.txt
cp mdisk.example.toml mdisk.toml

# "--game <folder>" overrides game_dir
.venv/Scripts/python -m tools.copy_game

# "--pak <pattern>" selects paks, e.g. "Text-*", already unpacked paks are skipped unless "--force" is passed
.venv/Scripts/python -m tools.unpack.unpack_1_bpak
.venv/Scripts/python -m tools.unpack.unpack_2_lz4
.venv/Scripts/python -m tools.unpack.unpack_3_identify
.venv/Scripts/python -m tools.unpack.unpack_4_convert
```

Layer 3 hard links its files from layer 2 (no extra disk space), so editing a file in one layer edits it in both.
Unpacking everything takes about 30 GiB on top of the 12 GiB copy. Layer 3 also uses the collected load traces,
run it again with `--force` after collecting new ones:
```bash
# With "TraceLoads = 1" in the game folder's MDiskModLoader.ini, after playing
.venv/Scripts/python -m tools.trace.collect_trace
.venv/Scripts/python -m tools.trace.analyze_callbacks --callback 9ea250
.venv/Scripts/python -m tools.unpack.unpack_3_identify --force
```

Editing a pak goes the other way, edit the files in layer 2 then patch the game's pak: the edited entries and a new
table of contents are appended after the original bytes, which stay untouched (a second of work, even for the 8 GiB
`Resources.pak`):
```bash
.venv/Scripts/python -m tools.repack.repack_2_lz4 --pak Engine
.venv/Scripts/python -m tools.patch_paks --pak Engine

# Back to the game's original pak (in the game folder and in the layers)
.venv/Scripts/python -m tools.patch_paks --pak Engine --restore
.venv/Scripts/python -m tools.unpack.unpack_1_bpak --pak Engine --force
```

Rebuilding a whole pak from layer 1 instead checks that layer 1 holds everything, and installs a pak with no
leftover bytes, but takes 12 minutes for `Resources.pak`. The two ways don't stack, restore one before using the
other:
```bash
.venv/Scripts/python -m tools.repack.repack_3_bpak --pak Engine --keep
.venv/Scripts/python -m tools.install_paks --pak Engine
.venv/Scripts/python -m tools.install_paks --pak Engine --restore
```

Textures are edited in layer 4, then brought back into layer 2 first. The edited DDS files must stay DXT1 (BC1)
or DXT5 (BC3), the format of the albedo deciding whether the texture has alpha, and every map of a texture keeps the
size of its albedo. The size and the mipmap count are free:
```bash
.venv/Scripts/python -m tools.repack.repack_1_convert --pak Resources
.venv/Scripts/python -m tools.repack.repack_2_lz4 --pak Resources
.venv/Scripts/python -m tools.patch_paks --pak Resources
```

The shared code sits next to the scripts: `tools/bpak.py` (the archive format), `tools/load_trace.py` (the load
trace format), `tools/formats/` (the entry formats: textures, DDS, TGA), `tools/paths.py` (every location),
`tools/constants.py` (every other constant) and `tools/utils.py` (helpers). The scripts follow Pylint, configured in
`pyproject.toml` (`.venv/Scripts/python -m pylint tools`), and python-lz4 gets its types from the stubs in `typings/`.

## License
Released under the [MIT License](LICENSE).

It bundles [Ultimate ASI Loader](https://github.com/ThirteenAG/Ultimate-ASI-Loader) by ThirteenAG (MIT) and is built
with [SafetyHook](https://github.com/cursey/safetyhook) (Boost 1.0) and [Zydis](https://github.com/zyantific/zydis) /
Zycore (MIT), these components stay under their own licenses, all included in the release ZIP.
