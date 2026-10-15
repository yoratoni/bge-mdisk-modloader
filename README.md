<p align="center">
  <br />
  <a href="https://yoratoni.com" target="_blank"><img width="100px" src="https://yoratoni.com/favicon.ico" /></a>
  <h2 align="center">@yoratoni/bge-mdisk-modloader</h2>
  <p align="center">A mod loader for Beyond Good & Evil 20th anniversary edition.</p>
</p>

## Status
Early research phase, nothing usable for players yet. The goal is to make the 20th Anniversary Edition actually
moddable, previous community tools stopped at extracting its files.

The project is split in packages, each one with its own `CMakeLists.txt`, sources, dependencies and tests:
| Package           | Output                      | Role                                                                                               |
|-------------------|-----------------------------|----------------------------------------------------------------------------------------------------|
| `packages/asi`    | `MDiskModLoader.asi`        | The in-game toolbox (debugging and runtime injection), loaded by Ultimate ASI Loader, Windows only |
| `packages/bpak`   | Library (planned)           | The `.pak` archive format (read, write, compression), shared by the other packages, portable       |
| `packages/packer` | `MDiskPacker.exe` (planned) | The repacker, unpacks and repacks the game's `Data/Paks/*.pak` archives to apply mods, portable    |

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

The version is defined once, in the `project()` call of the root `CMakeLists.txt`, and shared by every package. Pushing a `vX.Y.Z` tag matching it builds,
tests and publishes the release ZIP through the GitHub workflow.

## License
Released under the [MIT License](LICENSE).

It bundles [Ultimate ASI Loader](https://github.com/ThirteenAG/Ultimate-ASI-Loader) by ThirteenAG (MIT) and is built
with [SafetyHook](https://github.com/cursey/safetyhook) (Boost 1.0) and [Zydis](https://github.com/zyantific/zydis) /
Zycore (MIT), these components stay under their own licenses, all included in the release ZIP.
