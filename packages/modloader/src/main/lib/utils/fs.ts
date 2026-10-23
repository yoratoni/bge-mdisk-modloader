import { access, type FileHandle, readdir } from "node:fs/promises"
import path from "node:path"

/**
 * Checks whether a path currently exists on disk.
 * @param target The absolute path to check.
 * @returns True if the path exists, `false` otherwise.
 */
export async function pathExists(target: string): Promise<boolean> {
    try {
        await access(target)
        return true
    } catch {
        return false
    }
}

/**
 * Reads a range of an open file.
 * @param handle The open file.
 * @param position The position of the range.
 * @param size The size of the range.
 * @returns The bytes of the range.
 */
export async function readFileRange(handle: FileHandle, position: number, size: number): Promise<Buffer> {
    const data = Buffer.alloc(size)
    const { bytesRead } = await handle.read(data, 0, size, position)

    if (bytesRead !== size) throw new Error("The file ends before the range read.")

    return data
}

/**
 * Finds a file of a folder by its name compared without case, as a game installed through Proton keeps the case of
 * its files on Linux.
 * @param dir The folder.
 * @param fileName The file name, in any case.
 * @returns The file, `null` when the folder holds none of that name.
 */
export async function findFileWithoutCase(dir: string, fileName: string): Promise<string | null> {
    try {
        const entries = await readdir(dir, { withFileTypes: true })
        const entry = entries.find(child => child.isFile() && child.name.toLowerCase() === fileName.toLowerCase())

        return entry ? path.join(dir, entry.name) : null
    } catch {
        return null
    }
}
