import { readFile } from "node:fs/promises"
import path from "node:path"
import GAMES_CONSTANTS from "@main/lib/constants/games"
import { getVdfValue, parseVdf, type VdfObject } from "@main/lib/games/vdf"
import { pathExists } from "@main/lib/utils/fs"
import { readRegistryValue } from "@main/lib/utils/registry"

/**
 * Lists the Steam installs to read the libraries of, the one the registry names first on Windows.
 * @returns The Steam folders that exist.
 */
async function findSteamRoots(): Promise<string[]> {
    const candidates: string[] = []

    if (process.platform === "win32") {
        for (const { key, value } of GAMES_CONSTANTS.steamRegistryValues) {
            const steamPath = await readRegistryValue(key, value)
            if (steamPath) candidates.push(path.normalize(steamPath))
        }
    }

    candidates.push(...(GAMES_CONSTANTS.steamRoots[process.platform] ?? []))

    const roots: string[] = []

    for (const candidate of candidates) {
        if (!roots.some(root => root.toLowerCase() === candidate.toLowerCase()) && (await pathExists(candidate))) {
            roots.push(candidate)
        }
    }

    return roots
}

/**
 * Lists the libraries of a Steam install, from its "libraryfolders.vdf" (both the current format, an object per
 * library, and the old one, a path per library).
 * @param steamRoot The Steam folder.
 * @returns The library folders, the Steam folder itself included.
 */
async function readLibraries(steamRoot: string): Promise<string[]> {
    const libraries = [steamRoot]

    try {
        const libraryFoldersPath = path.join(
            steamRoot,
            GAMES_CONSTANTS.steamAppsDirName,
            GAMES_CONSTANTS.steamLibraryFoldersFileName,
        )
        const text = await readFile(libraryFoldersPath, "utf-8")
        const libraryFolders = getVdfValue(parseVdf(text), GAMES_CONSTANTS.steamVdfKeys.libraryFolders)

        if (typeof libraryFolders !== "object") return libraries

        for (const library of Object.values(libraryFolders)) {
            const libraryPath =
                typeof library === "string" ? library : getVdfValue(library, GAMES_CONSTANTS.steamVdfKeys.path)
            if (typeof libraryPath === "string") libraries.push(path.normalize(libraryPath))
        }
    } catch {
        // No library list, the Steam folder is the only library
    }

    return libraries
}

/**
 * Finds the install folder of an app in a Steam library, from its manifest.
 * @param library The library folder.
 * @param appId The Steam app.
 * @returns The install folder, `null` when the app isn't fully installed in that library.
 */
async function findAppFolder(library: string, appId: string): Promise<string | null> {
    try {
        const manifestName = `${GAMES_CONSTANTS.steamManifestPrefix}${appId}${GAMES_CONSTANTS.steamManifestExtension}`
        const text = await readFile(path.join(library, GAMES_CONSTANTS.steamAppsDirName, manifestName), "utf-8")

        const appState = getVdfValue(parseVdf(text), GAMES_CONSTANTS.steamVdfKeys.appState) as VdfObject | undefined
        const installDir = appState && getVdfValue(appState, GAMES_CONSTANTS.steamVdfKeys.installDir)
        const stateFlags = appState && Number(getVdfValue(appState, GAMES_CONSTANTS.steamVdfKeys.stateFlags))

        if (typeof installDir !== "string" || !stateFlags || !(stateFlags & GAMES_CONSTANTS.steamFullyInstalledFlag)) {
            return null
        }

        return path.join(library, GAMES_CONSTANTS.steamAppsDirName, GAMES_CONSTANTS.steamCommonDirName, installDir)
    } catch {
        return null
    }
}

/**
 * Finds the installs of every edition of the game in the Steam libraries.
 * @returns The install folders, the editions are checked from the files afterwards.
 */
export async function findSteamGames(): Promise<string[]> {
    const folders: string[] = []

    for (const steamRoot of await findSteamRoots()) {
        for (const library of await readLibraries(steamRoot)) {
            for (const appId of Object.values(GAMES_CONSTANTS.steamAppIds)) {
                const folder = await findAppFolder(library, appId)
                if (folder) folders.push(folder)
            }
        }
    }

    return folders
}
