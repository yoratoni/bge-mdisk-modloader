import type { GameEdition, OriginalBuild } from "@/main/types/games"

/**
 * The description of a mod, its "mod.json".
 */
export type ModManifest = {
    /**
     * The name shown in the list of mods.
     */
    name: string

    /**
     * The version of the mod, free text, empty when not given.
     */
    version: string

    /**
     * Who made the mod, empty when not given.
     */
    author: string

    /**
     * What the mod changes, empty when not given.
     */
    description: string
}

/**
 * The entries a mod replaces in one archive of the game.
 */
export type ModArchive = {
    /**
     * The file name of the archive: a pak (e.g. "Resources.pak"), or the BIG file of the original edition.
     */
    name: string

    /**
     * The number of entries the mod replaces in it.
     */
    entryCount: number
}

/**
 * The part of a mod for one edition of the game, or for one build of the original edition.
 */
export type ModPart = {
    /**
     * The edition the part applies to.
     */
    edition: GameEdition

    /**
     * The build of the original edition the part is made for, `null` when it suits every build of its edition.
     */
    build: OriginalBuild | null

    /**
     * The archives it changes.
     */
    archives: ModArchive[]
}

/**
 * An installed mod.
 */
export type Mod = ModManifest & {
    /**
     * The folder of the mod in the mods folder, which identifies it.
     */
    id: string

    /**
     * Whether the mod is applied to the picked install.
     */
    isEnabled: boolean

    /**
     * Its parts, an install getting the ones of its edition and build.
     */
    parts: ModPart[]
}

/**
 * The result of adding a mod, the folder picked may not be a mod.
 */
export type AddModResult =
    | { ok: true; mods: Mod[] }
    | { ok: false; reason: "canceled" | "invalid" | "already-installed"; details?: string }

/**
 * What applying the mods changed in the archives of the picked install.
 */
export type ApplyModsResult = {
    /**
     * The archives patched, with the number of entries replaced in each.
     */
    patchedArchives: ModArchive[]

    /**
     * The archives put back to their original, no enabled mod changing them anymore.
     */
    restoredArchives: string[]
}

/**
 * What restoring the game put back.
 */
export type RestoreGameResult = {
    /**
     * The archives put back to their original.
     */
    restoredArchives: string[]
}
