import { readdir } from "node:fs/promises"
import path from "node:path"
import { identifyBigBuild } from "@main/lib/big/build"
import BIG_CONSTANTS from "@main/lib/constants/big"
import GAMES_CONSTANTS from "@main/lib/constants/games"
import { findFileWithoutCase } from "@main/lib/utils/fs"
import type { GameEdition, OriginalBuild } from "@/main/types/games"

/**
 * Lists the entries of a folder by lowercase name, telling the folders from the files.
 * @param dir The folder.
 * @returns Whether every entry is a folder, by lowercase name, empty if the folder can't be read.
 */
async function listEntries(dir: string): Promise<Map<string, { name: string; isDirectory: boolean }>> {
    try {
        const entries = await readdir(dir, { withFileTypes: true })

        return new Map(
            entries.map(entry => [entry.name.toLowerCase(), { name: entry.name, isDirectory: entry.isDirectory() }]),
        )
    } catch {
        return new Map()
    }
}

/**
 * Tells the edition of the game installed in a folder from its files.
 * @param dir The folder.
 * @returns The edition, `null` if the folder doesn't hold the game.
 */
export async function identifyEdition(dir: string): Promise<GameEdition | null> {
    const entries = await listEntries(dir)
    const executable = entries.get(GAMES_CONSTANTS.markers.executable)

    if (!executable || executable.isDirectory) return null

    const bigFile = entries.get(GAMES_CONSTANTS.markers.originalBigFile)
    if (bigFile && !bigFile.isDirectory) return "original"

    const dataDir = entries.get(GAMES_CONSTANTS.markers.anniversaryDataDir)
    if (!dataDir?.isDirectory) return null

    const paksDir = (await listEntries(path.join(dir, dataDir.name))).get(GAMES_CONSTANTS.markers.anniversaryPaksDir)
    return paksDir?.isDirectory ? "anniversary" : null
}

/**
 * Tells the build of the original edition installed in a folder, from its BIG file.
 * @param dir The folder, an original edition.
 * @returns The build, `null` when it's not a known one.
 */
export async function identifyOriginalBuild(dir: string): Promise<OriginalBuild | null> {
    const bigPath = await findFileWithoutCase(dir, BIG_CONSTANTS.fileName)

    return bigPath ? identifyBigBuild(bigPath) : null
}
