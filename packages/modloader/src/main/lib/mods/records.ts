import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import MODS_CONSTANTS from "@main/lib/constants/mods"
import { getStoreDir } from "@main/lib/utils/stores"

/**
 * Returns the folder holding the records of the archives of one install, named after a hash of its folder.
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
 * Returns the record of one archive of an install.
 * @param gamePath The install folder.
 * @param archiveName The file name of the archive: a pak (e.g. "Resources.pak"), or the BIG file.
 * @returns The record file.
 */
function getRecordPath(gamePath: string, archiveName: string): string {
    return path.join(getRecordsDir(gamePath), `${archiveName}${MODS_CONSTANTS.recordExtension}`)
}

/**
 * Reads the record of an archive the mod loader patched.
 * @param gamePath The install folder.
 * @param archiveName The file name of the archive: a pak (e.g. "Resources.pak"), or the BIG file.
 * @returns The record, `null` when the archive isn't patched.
 */
export async function readRecord<T>(gamePath: string, archiveName: string): Promise<T | null> {
    try {
        return JSON.parse(await readFile(getRecordPath(gamePath, archiveName), "utf-8")) as T
    } catch {
        return null
    }
}

/**
 * Writes the record of an archive, before the archive is touched, so an interrupted patch can still be restored.
 * @param gamePath The install folder.
 * @param archiveName The file name of the archive: a pak (e.g. "Resources.pak"), or the BIG file.
 * @param record The original state of the archive.
 */
export async function writeRecord(gamePath: string, archiveName: string, record: object) {
    await mkdir(getRecordsDir(gamePath), { recursive: true })
    await writeFile(getRecordPath(gamePath, archiveName), JSON.stringify(record, null, 4), "utf-8")
}

/**
 * Deletes the record of an archive, once it's back to its original.
 * @param gamePath The install folder.
 * @param archiveName The file name of the archive: a pak (e.g. "Resources.pak"), or the BIG file.
 */
export async function deleteRecord(gamePath: string, archiveName: string) {
    await rm(getRecordPath(gamePath, archiveName), { force: true })
}

/**
 * Lists the archives of an install the mod loader patched.
 * @param gamePath The install folder.
 * @returns The file names of the archives: the paks, and the BIG file.
 */
export async function listRecordedArchives(gamePath: string): Promise<string[]> {
    try {
        const files = await readdir(getRecordsDir(gamePath))
        return files
            .filter(file => file.endsWith(MODS_CONSTANTS.recordExtension))
            .map(file => file.slice(0, -MODS_CONSTANTS.recordExtension.length))
    } catch {
        return []
    }
}
