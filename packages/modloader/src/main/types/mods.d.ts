import type { GameEdition } from "@/main/types/games"

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

    /**
     * The edition the mod is made for.
     */
    edition: GameEdition
}

/**
 * The entries a mod replaces in one pak.
 */
export type ModPak = {
    /**
     * The pak name, without extension (e.g. "Resources").
     */
    name: string

    /**
     * The number of entries the mod replaces in it.
     */
    entryCount: number
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
     * The paks the mod changes.
     */
    paks: ModPak[]
}

/**
 * The result of adding a mod, the folder picked may not be a mod.
 */
export type AddModResult =
    | { ok: true; mods: Mod[] }
    | { ok: false; reason: "canceled" | "invalid" | "already-installed"; details?: string }

/**
 * What applying the mods changed in the paks of the picked install.
 */
export type ApplyModsResult = {
    /**
     * The paks patched, with the number of entries replaced in each.
     */
    patchedPaks: ModPak[]

    /**
     * The paks put back to their original, no enabled mod changing them anymore.
     */
    restoredPaks: string[]
}

/**
 * What restoring the game put back.
 */
export type RestoreGameResult = {
    /**
     * The paks put back to their original.
     */
    restoredPaks: string[]
}
