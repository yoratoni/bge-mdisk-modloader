import { access } from "node:fs/promises"

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
