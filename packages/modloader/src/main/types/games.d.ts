/**
 * The editions of the game: the 20th Anniversary Edition (BPAK archives) and the original (a single BIG file).
 */
export type GameEdition = "anniversary" | "original"

/**
 * Where an install was found.
 */
export type GameSource = "steam" | "gog" | "ubisoft" | "retail" | "manual"

/**
 * An install of the game.
 */
export type Game = {
    /**
     * The install folder, normalized, which identifies the install.
     */
    path: string

    /**
     * The edition, told from the files of the folder.
     */
    edition: GameEdition

    /**
     * Where the install was found.
     */
    source: GameSource
}

/**
 * The installs found and the one the mods go into.
 */
export type GamesState = {
    games: Game[]
    selectedPath: string | null
}

/**
 * The result of adding an install by hand, the folder picked may not be the game's.
 */
export type AddGameResult = { ok: true; state: GamesState } | { ok: false; reason: "canceled" | "not-a-game" }
