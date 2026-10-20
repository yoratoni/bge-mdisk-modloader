# MDisk Mod Loader
The desktop app of the BG&E MDISK Mod Loader: it finds the installs of Beyond Good & Evil, installs mods and applies
them to the 20th Anniversary Edition (not to the original edition yet).

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
A mod is a folder holding a `mod.json` and the new content of the entries it replaces, named as the unpacked layer 2
of the repository's tools names them (a key as 8 hex digits, or the entry's name):
```text
my-mod/
  mod.json              {"name": "...", "version": "...", "author": "...", "description": "...", "edition": "anniversary"}
  paks/
    Resources/
      09001331          the new content of entry 0x09001331, as layer 2 holds it (decompressed)
      09001331.extra    optional, its new extra bytes (the original ones are kept otherwise)
```

Applying the enabled mods patches the paks of the picked install in place, the way `tools.patch_paks` does: the
replaced entries (stored raw) and a new table of contents are appended after the original bytes, which stay untouched.
Each pak starts again from its original, a later mod wins over an earlier one replacing the same entry, and "Restore
the game" cuts every pak back to its original. A pak's original size, header and table CRC are recorded before it's
touched, the paks of a game updated or verified by Steam since are taken as new originals.

What the app keeps, in the `mdisk-modloader` folder of the user's application data:
| Path                           | Content                                                          |
|--------------------------------|------------------------------------------------------------------|
| `config.json`                  | The picked install, the installs added by hand, the enabled mods |
| `mods/<mod>/`                  | The installed mods, copied from the folder they were added from  |
| `patches/<install>/<pak>.json` | The original state of every pak the app patched, per install     |

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
