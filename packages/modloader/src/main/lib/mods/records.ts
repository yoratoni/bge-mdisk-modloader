import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import MODS_CONSTANTS from "@main/lib/constants/mods"
import { getStoreDir } from "@main/lib/utils/stores"
import type { PatchRecord } from "@/main/types/bpak"

/**
 * Returns the folder holding the records of the paks of one install, named after a hash of its folder.
 * @param gamePath The install folder.
 * @returns The folder.
 */
function getRecordsDir(gamePath: string): string {
    const normalizedPath = process.platform === "win32" ? path.resolve(gamePath).toLowerCase() : path.resolve(gamePath)
    const gameId = createHash(MODS_CONSTANTS.gameIdHashAlgorithm)
        .update(normalizedPath)
        .digest("hex")
        .slice(0, MODS_CONSTANTS.gameIdLength)

    return path.join(getStoreDir(), MODS_CONSTANTS.patchesDirName, gameId)
}

/**
 * Returns the record of one pak of an install.
 * @param gamePath The install folder.
 * @param pakName The pak name, without extension.
 * @returns The record file.
 */
function getRecordPath(gamePath: string, pakName: string): string {
    return path.join(getRecordsDir(gamePath), `${pakName}${MODS_CONSTANTS.recordExtension}`)
}

/**
 * Reads the record of a pak the mod loader patched.
 * @param gamePath The install folder.
 * @param pakName The pak name, without extension.
 * @returns The record, `null` when the pak isn't patched.
 */
export async function readRecord(gamePath: string, pakName: string): Promise<PatchRecord | null> {
    try {
        return JSON.parse(await readFile(getRecordPath(gamePath, pakName), "utf-8")) as PatchRecord
    } catch {
        return null
    }
}

/**
 * Writes the record of a pak, before the pak is touched, so an interrupted patch can still be restored.
 * @param gamePath The install folder.
 * @param pakName The pak name, without extension.
 * @param record The original state of the pak.
 */
export async function writeRecord(gamePath: string, pakName: string, record: PatchRecord) {
    await mkdir(getRecordsDir(gamePath), { recursive: true })
    await writeFile(getRecordPath(gamePath, pakName), JSON.stringify(record, null, 4), "utf-8")
}

/**
 * Deletes the record of a pak, once it's back to its original.
 * @param gamePath The install folder.
 * @param pakName The pak name, without extension.
 */
export async function deleteRecord(gamePath: string, pakName: string) {
    await rm(getRecordPath(gamePath, pakName), { force: true })
}

/**
 * Lists the paks of an install the mod loader patched.
 * @param gamePath The install folder.
 * @returns The pak names, without extension.
 */
export async function listRecordedPaks(gamePath: string): Promise<string[]> {
    try {
        const files = await readdir(getRecordsDir(gamePath))
        return files
            .filter(file => file.endsWith(MODS_CONSTANTS.recordExtension))
            .map(file => file.slice(0, -MODS_CONSTANTS.recordExtension.length))
    } catch {
        return []
    }
}
