import path from "node:path"
import GAMES_CONSTANTS from "@main/lib/constants/games"
import { findRegistryKeys } from "@main/lib/utils/registry"
import type { GameSource } from "@/main/types/games"

/**
 * An install folder named by an installer, and the store it came from.
 */
export type InstallerGame = {
    folder: string
    source: GameSource
}

/**
 * Tells the store an uninstall entry comes from, from its publisher.
 * @param publisher The publisher of the entry.
 * @returns The store, "retail" for the discs and anything else.
 */
function readSource(publisher: string | undefined): GameSource {
    const lowerPublisher = publisher?.toLowerCase() ?? ""
    const publisherSource = GAMES_CONSTANTS.publisherSources.find(({ term }) => lowerPublisher.includes(term))

    return publisherSource?.source ?? GAMES_CONSTANTS.defaultInstallerSource
}

/**
 * Finds the installs of the game the Windows installers registered (GOG, Ubisoft Connect, the retail discs), from
 * their uninstall entries, the Steam ones are skipped, their entries hold no folder and the libraries name them.
 * @returns The install folders and their stores, the editions are checked from the files afterwards.
 */
export async function findInstallerGames(): Promise<InstallerGame[]> {
    if (process.platform !== "win32") return []

    const games: InstallerGame[] = []

    for (const uninstallKey of GAMES_CONSTANTS.uninstallRegistryKeys) {
        const entries = await findRegistryKeys(uninstallKey, GAMES_CONSTANTS.uninstallSearchTerm)

        for (const [key, values] of entries) {
            const installLocation = values[GAMES_CONSTANTS.uninstallValueNames.installLocation]?.trim()
            if (!installLocation || GAMES_CONSTANTS.steamUninstallKeyPattern.test(key)) continue

            games.push({
                folder: path.normalize(installLocation),
                source: readSource(values[GAMES_CONSTANTS.uninstallValueNames.publisher]),
            })
        }
    }

    return games
}
