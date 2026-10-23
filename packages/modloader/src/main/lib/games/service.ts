import path from "node:path"
import GAMES_CONSTANTS from "@main/lib/constants/games"
import { identifyEdition, identifyOriginalBuild } from "@main/lib/games/identify"
import { findInstallerGames } from "@main/lib/games/installers"
import { findSteamGames } from "@main/lib/games/steam"
import { configStore } from "@main/lib/stores/config"
import { type BrowserWindow, dialog } from "electron"
import type { AddGameResult, Game, GameSource, GamesState } from "@/main/types/games"

/**
 * Compares two install folders, without case on Windows.
 * @param firstPath The first folder.
 * @param secondPath The second folder.
 * @returns True if both name the same folder.
 */
function isSamePath(firstPath: string, secondPath: string): boolean {
    const first = path.resolve(firstPath)
    const second = path.resolve(secondPath)

    return process.platform === "win32" ? first.toLowerCase() === second.toLowerCase() : first === second
}

/**
 * Picks an install, persisted so the next launch starts on it.
 * @param gamePath The install folder, `null` when there is none.
 */
async function storeSelectedPath(gamePath: string | null) {
    await configStore.update(config => {
        config.selectedGamePath = gamePath
        return undefined
    })
}

/**
 * Finds every install of the game, from Steam's libraries, the installers' uninstall entries and the folders added by
 * hand, each one checked from its files.
 * @returns The installs, and the one picked: the last one picked while it's still there, else the first one found.
 */
export async function detectGames(): Promise<GamesState> {
    const config = await configStore.get()

    const candidates: { folder: string; source: GameSource }[] = [
        ...(await findSteamGames()).map(folder => ({ folder, source: "steam" as const })),
        ...(await findInstallerGames()),
        ...config.manualGamePaths.map(folder => ({ folder, source: "manual" as const })),
    ]

    const games: Game[] = []

    for (const { folder, source } of candidates) {
        if (games.some(game => isSamePath(game.path, folder))) continue

        const edition = await identifyEdition(folder)
        if (!edition) continue

        games.push({
            path: path.resolve(folder),
            edition,
            build: edition === "original" ? await identifyOriginalBuild(folder) : null,
            source,
        })
    }

    const selectedGame = config.selectedGamePath
        ? games.find(game => isSamePath(game.path, config.selectedGamePath as string))
        : undefined
    const selectedPath = selectedGame?.path ?? games[0]?.path ?? null

    if (selectedPath !== config.selectedGamePath) await storeSelectedPath(selectedPath)

    return { games, selectedPath }
}

/**
 * Picks the install the mods go into.
 * @param gamePath The install folder, one of the detected installs.
 * @returns The installs, with the new one picked.
 */
export async function selectGame(gamePath: string): Promise<GamesState> {
    const state = await detectGames()

    const game = state.games.find(detectedGame => isSamePath(detectedGame.path, gamePath))
    if (!game) throw new Error(GAMES_CONSTANTS.missingGameMessage)

    await storeSelectedPath(game.path)

    return { ...state, selectedPath: game.path }
}

/**
 * Adds an install no launcher knows about, from a folder the user picks, and picks it.
 * @param parentWindow The window the folder picker belongs to.
 * @returns The installs with the new one picked, or why none was added.
 */
export async function addGame(parentWindow: BrowserWindow | null): Promise<AddGameResult> {
    const options = { title: GAMES_CONSTANTS.addDialogTitle, properties: ["openDirectory" as const] }
    const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, options)
        : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return { ok: false, reason: "canceled" }

    const folder = path.resolve(result.filePaths[0])

    if (!(await identifyEdition(folder))) return { ok: false, reason: "not-a-game" }

    await configStore.update(config => {
        if (!config.manualGamePaths.some(manualPath => isSamePath(manualPath, folder))) {
            config.manualGamePaths.push(folder)
        }

        config.selectedGamePath = folder
        return undefined
    })

    return { ok: true, state: await detectGames() }
}
