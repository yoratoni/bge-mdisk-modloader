import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import MODS_CONSTANTS from "@main/lib/constants/mods"
import type { GameEdition } from "@/main/types/games"
import type { Mod, ModManifest, ModPak } from "@/main/types/mods"

/**
 * Validates the content of a "mod.json".
 * @param value The parsed JSON.
 * @returns The manifest, the optional fields empty when missing.
 */
function parseManifest(value: unknown): ModManifest {
    if (typeof value !== "object" || value === null)
        throw new Error(`${MODS_CONSTANTS.manifestFileName} isn't an object.`)

    const manifest = value as Record<string, unknown>

    if (typeof manifest.name !== "string" || !manifest.name.trim()) {
        throw new Error(`${MODS_CONSTANTS.manifestFileName} has no "name".`)
    }

    if (!MODS_CONSTANTS.editions.includes(manifest.edition as GameEdition)) {
        const editions = MODS_CONSTANTS.editions.join('" or "')
        throw new Error(`${MODS_CONSTANTS.manifestFileName} has no "edition" ("${editions}").`)
    }

    /**
     * Reads an optional text field.
     * @param field The field.
     * @returns Its text, empty when missing.
     */
    const readText = (field: string) => (typeof manifest[field] === "string" ? (manifest[field] as string) : "")

    return {
        name: manifest.name.trim(),
        version: readText("version"),
        author: readText("author"),
        description: readText("description"),
        edition: manifest.edition as GameEdition,
    }
}

/**
 * Returns the name of the entry a file of a mod replaces, keys lowercase like the unpacked layers name them.
 * @param fileName The file name, in a pak folder of the mod.
 * @returns The entry name.
 */
export function getReplacedEntryName(fileName: string): string {
    return MODS_CONSTANTS.keyFileNamePattern.test(fileName) ? fileName.toLowerCase() : fileName
}

/**
 * Lists the entries a mod replaces in each pak.
 * @param modDir The folder of the mod.
 * @returns The files replacing entries, by pak name (the extra bytes files left out, they follow their entry).
 */
export async function listModEntries(modDir: string): Promise<Map<string, string[]>> {
    const paksDir = path.join(modDir, MODS_CONSTANTS.paksDirName)
    const entries = new Map<string, string[]>()
    let pakDirs: string[]

    try {
        pakDirs = (await readdir(paksDir, { withFileTypes: true }))
            .filter(dir => dir.isDirectory())
            .map(dir => dir.name)
    } catch {
        return entries
    }

    for (const pakName of pakDirs) {
        const files = (await readdir(path.join(paksDir, pakName), { withFileTypes: true }))
            .filter(file => file.isFile() && !file.name.endsWith(MODS_CONSTANTS.extraSuffix))
            .map(file => file.name)

        if (files.length) entries.set(pakName, files)
    }

    return entries
}

/**
 * Reads a mod from its folder.
 * @param modDir The folder of the mod.
 * @param id The name the mod is known by, its folder name in the mods folder.
 * @param isEnabled Whether the mod is enabled.
 * @returns The mod.
 */
export async function readMod(modDir: string, id: string, isEnabled: boolean): Promise<Mod> {
    let manifestJson: unknown

    try {
        manifestJson = JSON.parse(await readFile(path.join(modDir, MODS_CONSTANTS.manifestFileName), "utf-8"))
    } catch {
        throw new Error(`The folder has no readable ${MODS_CONSTANTS.manifestFileName}.`)
    }

    const manifest = parseManifest(manifestJson)
    const paks: ModPak[] = [...(await listModEntries(modDir))].map(([name, files]) => ({
        name,
        entryCount: files.length,
    }))

    if (!paks.length) throw new Error(`The mod replaces no entry, its "${MODS_CONSTANTS.paksDirName}" folder is empty.`)

    return {
        ...manifest,
        id,
        isEnabled,
        paks,
    }
}
