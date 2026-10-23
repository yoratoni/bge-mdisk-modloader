# MDisk Mod Loader
The desktop app of the BG&E MDISK Mod Loader: it finds the installs of Beyond Good & Evil, installs mods and applies
them to the 20th Anniversary Edition or to the original edition.

Built with [Electron](https://www.electronjs.org/) and [electron-vite](https://electron-vite.org/), React and
Tailwind CSS for the interface, Biome and [Nitpicker](https://www.npmjs.com/package/@alien_intelligence/eslint-plugin-nitpicker)
for the lint, Vitest for the tests.

The installs are found in three places, each one confirmed from its files (`Data/Paks/` for the 20th Anniversary
Edition, `sally_clean.bf` for the original):
- **Steam**: the libraries of `libraryfolders.vdf`, then the manifests of both editions' apps (2556990 and 15130),
  also on Linux, for Proton.
- **The installers** (Windows): the uninstall entries naming the game, left by GOG, Ubisoft Connect and the discs.
- **By hand**: any folder the user picks.

## Mods
A mod is a folder holding a `mod.json` and the files it replaces: `paks/<pak>/` for the 20th Anniversary Edition,
`bf/` for every build of the original edition, `bf/steam/` and `bf/gog/` for one build (the layout and how to make
the files are in [docs/MODDING.md](../../docs/MODDING.md)). `manifest.ts` reads a mod into its parts, one per edition
and build, and an install gets the parts of its own edition and build: on the original, the files for every build
apply first, then the files of its build.

The app tells the builds apart from the file and folder counts of their BIG file's header, which a patch never
changes, and shows the build of every original install. A mod with nothing for the picked edition and build gets a
warning, and is skipped when the mods are applied. An unknown build only gets the files for every build.

Applying the enabled mods patches the archives of the picked install in place, the way `tools.patch_paks` does. In a
pak, the replaced entries (stored raw) and a new table of contents are appended after the original bytes, which stay
untouched. In `sally_clean.bf`, the replaced files are appended after the original bytes, and the file table and
file records are rewritten to point at them (see the research notes).

Each archive starts again from its original, a later mod wins over an earlier one replacing the same file, and
"Restore the game" cuts every archive back to its original. What's needed to restore an archive is recorded before
it's touched: a pak's original size, header and table CRC, and the BIG file's original size, fingerprints and file
tables. An archive updated or verified by Steam since is taken as a new original.

What the app keeps, in the `mdisk-modloader` folder of the user's application data:
| Path                               | Content                                                                    |
|------------------------------------|----------------------------------------------------------------------------|
| `config.json`                      | The picked install, the installs added by hand, the enabled mods           |
| `mods/<mod>/`                      | The installed mods, copied from the folder they were added from            |
| `patches/<install>/<archive>.json` | The original state of every archive the app patched (`Resources.pak.json`) |

## Development
Requirements:
- [Node.js](https://nodejs.org) 22 or newer.
- [Yarn](https://classic.yarnpkg.com) 1.x (classic).

```bash
# From this folder
yarn install

# Run the app in development mode
yarn dev
```

The scripts:
| Script           | Role                                                                     |
|------------------|--------------------------------------------------------------------------|
| `yarn dev`       | Runs the app with hot reload                                             |
| `yarn build`     | Bundles the main process, the preload script and the renderer in `dist/` |
| `yarn typecheck` | Checks the types of the whole package                                    |
| `yarn lint`      | Runs Biome then Nitpicker, `yarn lint:fix` fixes what they can           |
| `yarn test`      | Runs the unit tests (`tests/unit/**/*.test.ts`)                          |
| `yarn dist`      | Builds the installers in `dist/release/` (NSIS on Windows, AppImage)     |

## Layout
The usual three Electron processes, each in its own folder of `src/`:
| Folder          | Role                                                                                             |
|-----------------|--------------------------------------------------------------------------------------------------|
| `src/main/`     | The main process (Node): windows, file system, IPC handlers, registered from `src/main/index.ts` |
| `src/preload/`  | The bridge exposing the typed `window.api` to the renderer, one route file per feature           |
| `src/renderer/` | The interface (React), it only reaches the system through `window.api`                           |

A new feature goes through all three: its channel names in `src/main/lib/constants/ipc.ts`, its handlers in
`src/main/lib/<feature>/` (with `safeHandle`, which returns an `IpcResult` instead of throwing), its route in
`src/preload/routes/<feature>.ts` (with `safeInvoke`, which unwraps it) and its types in `MDiskApi`
(`src/preload/index.ts`). Its constants go in `lib/constants/<feature>.ts` of its process, one `<FEATURE>_CONSTANTS`
object per file.

The interface is built from the components of `src/renderer/components/ui/` (shadcn/ui on Radix, from
waas-dashboard), themed in `src/renderer/styles/globals.css` with colors measured on the game's own interface
textures (only the colors, none of the game's art).
