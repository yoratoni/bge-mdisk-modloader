import GAMES_UI_CONSTANTS from "@renderer/lib/constants/games"
import type { Game } from "@/main/types/games"
import type { ModPart } from "@/main/types/mods"

/**
 * Tells whether a part of a mod applies to an install: made for its edition, and for every build or its own.
 * @param part The part of the mod.
 * @param game The install.
 * @returns True if applying the mods applies the part.
 */
export function isPartForGame(part: ModPart, game: Game): boolean {
    return part.edition === game.edition && (part.build === null || part.build === game.build)
}

/**
 * Names what a part of a mod is made for.
 * @param part The part of the mod.
 * @returns Its edition, and its build when it's made for one, e.g. "Original (2003) · GOG".
 */
export function describePartTarget(part: ModPart): string {
    const editionName = GAMES_UI_CONSTANTS.editionNames[part.edition]

    return part.build ? `${editionName} · ${GAMES_UI_CONSTANTS.buildNames[part.build]}` : editionName
}

/**
 * Names the edition of an install, and its build for the original edition.
 * @param game The install.
 * @returns The name, e.g. "20th Anniversary Edition" or "Original (2003) · Steam".
 */
export function describeGameTarget(game: Game): string {
    const editionName = GAMES_UI_CONSTANTS.editionNames[game.edition]

    if (game.edition !== "original") return editionName

    const buildName = game.build ? GAMES_UI_CONSTANTS.buildNames[game.build] : GAMES_UI_CONSTANTS.unknownBuildName

    return `${editionName} · ${buildName}`
}

/**
 * Names where an install was found, left out when its build already names it (the GOG build sold on GOG).
 * @param game The install.
 * @returns The name, empty when the build names it.
 */
export function describeGameSource(game: Game): string {
    return game.build === game.source ? "" : GAMES_UI_CONSTANTS.sourceNames[game.source]
}
