import type { GameEdition, GameSource } from "@/main/types/games"

/**
 * All constants related to showing the installs of the game.
 */
const GAMES_UI_CONSTANTS = {
    /**
     * The display name of every edition.
     */
    editionNames: {
        anniversary: "20th Anniversary Edition",
        original: "Original (2003)",
    } as Record<GameEdition, string>,

    /**
     * The display name of every place an install can come from.
     */
    sourceNames: {
        steam: "Steam",
        gog: "GOG",
        ubisoft: "Ubisoft Connect",
        retail: "Retail",
        manual: "Added by hand",
    } as Record<GameSource, string>,

    /**
     * The messages shown when looking for the installs goes wrong.
     */
    messages: {
        detectFailed: "The installs of the game couldn't be listed",
        selectFailed: "This install couldn't be picked",
        addFailed: "This folder couldn't be added",
        notAGame: "This folder doesn't hold the game",
        notAGameDetails: "Pick the folder holding BGE.exe, with its Data/Paks folder or its sally_clean.bf file.",
    },
} as const

export default GAMES_UI_CONSTANTS
