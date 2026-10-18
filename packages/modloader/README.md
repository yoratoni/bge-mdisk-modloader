# MDisk Mod Loader
The desktop app of the BG&E MDISK Mod Loader, which installs mods into Beyond Good & Evil 20th Anniversary Edition.
Work in progress, only the skeleton for now: a frameless window with its title bar.

Built with [Electron](https://www.electronjs.org/) and [electron-vite](https://electron-vite.org/), React and
Tailwind CSS for the interface, Biome and [Nitpicker](https://www.npmjs.com/package/@alien_intelligence/eslint-plugin-nitpicker)
for the lint, Vitest for the tests.

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

A new feature goes through all three: its channel names in `src/main/lib/constants.ts`, its handlers in
`src/main/lib/<feature>/` (with `safeHandle`, which returns an `IpcResult` instead of throwing), its route in
`src/preload/routes/<feature>.ts` (with `safeInvoke`, which unwraps it) and its types in `MDiskApi`
(`src/preload/index.ts`).
