import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import BIG_CONSTANTS from "@main/lib/constants/big"
import MODS_CONSTANTS from "@main/lib/constants/mods"
import type { OriginalBuild } from "@/main/types/games"
import type { Mod, ModManifest, ModPart } from "@/main/types/mods"

/**
 * The files a mod replaces in the BIG file, for every build or for one.
 */
export type ModBigFiles = {
    /**
     * The build they're made for, `null` for every build.
     */
    build: OriginalBuild | null

    /**
     * The folder holding them.
     */
    dir: string

    /**
     * The file names, each one a key.
     */
    files: string[]
}

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
    }
}

/**
 * Lists the files or the folders of a folder.
 * @param dir The folder.
 * @param isDirectory Whether to list the folders instead of the files.
 * @returns Their names, none when the folder doesn't exist.
 */
async function listChildren(dir: string, isDirectory: boolean): Promise<string[]> {
    try {
        return (await readdir(dir, { withFileTypes: true }))
            .filter(child => (isDirectory ? child.isDirectory() : child.isFile()))
            .map(child => child.name)
    } catch {
        return []
    }
}

/**
 * Returns the name of the entry a file of a mod replaces, keys lowercase like the unpacked layers name them.
 * @param fileName The file name, in a pak folder or the BIG folder of the mod.
 * @returns The entry name.
 */
export function getReplacedEntryName(fileName: string): string {
    return MODS_CONSTANTS.keyFileNamePattern.test(fileName) ? fileName.toLowerCase() : fileName
}

/**
 * Lists the entries a mod replaces in each pak.
 * @param modDir The folder of the mod.
 * @returns The files replacing entries, by pak folder name (the extra bytes files left out, they follow their entry).
 */
export async function listModEntries(modDir: string): Promise<Map<string, string[]>> {
    const paksDir = path.join(modDir, MODS_CONSTANTS.paksDirName)
    const entries = new Map<string, string[]>()

    for (const pakName of await listChildren(paksDir, true)) {
        const files = (await listChildren(path.join(paksDir, pakName), false)).filter(
            file => !file.endsWith(MODS_CONSTANTS.extraSuffix),
        )

        if (files.length) entries.set(pakName, files)
    }

    return entries
}

/**
 * Lists the files a mod replaces in the BIG file of the original edition, the ones for every build first.
 * @param modDir The folder of the mod.
 * @returns The files, for every build and by build, each one named after a key.
 */
export async function listModBigEntries(modDir: string): Promise<ModBigFiles[]> {
    const bigDir = path.join(modDir, MODS_CONSTANTS.bigDirName)
    const groups: ModBigFiles[] = [
        {
            build: null,
            dir: bigDir,
            files: await listChildren(bigDir, false),
        },
    ]

    for (const buildDirName of await listChildren(bigDir, true)) {
        const knownBuild = BIG_CONSTANTS.builds.find(build => build.build === buildDirName.toLowerCase())

        if (!knownBuild) {
            const buildNames = BIG_CONSTANTS.builds.map(build => build.build).join(", ")
            throw new Error(`"${MODS_CONSTANTS.bigDirName}/${buildDirName}" isn't a known build (${buildNames}).`)
        }

        const buildDir = path.join(bigDir, buildDirName)
        groups.push({
            build: knownBuild.build,
            dir: buildDir,
            files: await listChildren(buildDir, false),
        })
    }

    for (const group of groups) {
        const unnamedFile = group.files.find(file => !MODS_CONSTANTS.keyFileNamePattern.test(file))

        if (unnamedFile) {
            const filePath = [MODS_CONSTANTS.bigDirName, group.build, unnamedFile].filter(Boolean).join("/")
            throw new Error(`"${filePath}" isn't named after a key (8 hex digits).`)
        }
    }

    return groups.filter(group => group.files.length)
}

/**
 * Reads a mod from its folder, its parts told from the folders it holds.
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
    const pakEntries = await listModEntries(modDir)
    const parts: ModPart[] = []

    if (pakEntries.size) {
        parts.push({
            edition: "anniversary",
            build: null,
            archives: [...pakEntries].map(([pakName, files]) => ({
                name: `${pakName}${MODS_CONSTANTS.pakExtension}`,
                entryCount: files.length,
            })),
        })
    }

    for (const group of await listModBigEntries(modDir)) {
        parts.push({
            edition: "original",
            build: group.build,
            archives: [{ name: BIG_CONSTANTS.fileName, entryCount: group.files.length }],
        })
    }

    if (!parts.length) {
        const dirNames = `"${MODS_CONSTANTS.paksDirName}" or "${MODS_CONSTANTS.bigDirName}"`
        throw new Error(`The mod replaces nothing, it has no ${dirNames} folder holding files.`)
    }

    return {
        ...manifest,
        id,
        isEnabled,
        parts,
    }
}
