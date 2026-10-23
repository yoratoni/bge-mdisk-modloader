import { open } from "node:fs/promises"
import { getBigBuild, parseBigHeader } from "@main/lib/big/format"
import BIG_CONSTANTS from "@main/lib/constants/big"
import { readFileRange } from "@main/lib/utils/fs"
import type { OriginalBuild } from "@/main/types/games"

/**
 * Tells the build of a BIG file from its header, which a patch never changes.
 * @param bigPath The BIG file.
 * @returns The build, `null` when it's not a known one or the BIG file can't be read.
 */
export async function identifyBigBuild(bigPath: string): Promise<OriginalBuild | null> {
    try {
        const handle = await open(bigPath, "r")

        try {
            return getBigBuild(parseBigHeader(await readFileRange(handle, 0, BIG_CONSTANTS.headerReadSize)))
        } finally {
            await handle.close()
        }
    } catch {
        return null
    }
}
