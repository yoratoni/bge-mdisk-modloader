import { type FileHandle, open } from "node:fs/promises"
import { crc32 } from "node:zlib"
import { buildBigFileData, getBigKeyFileName, getTablesSize, parseBigHeader, parseBigTable } from "@main/lib/big/format"
import BIG_CONSTANTS from "@main/lib/constants/big"
import { readFileRange } from "@main/lib/utils/fs"
import type { BigEntry, BigHeader, BigPatchRecord } from "@/main/types/big"

/**
 * A BIG file as it was before the mod loader patched it.
 */
export type OriginalBig = {
    /**
     * The original state, saved before the BIG file is touched.
     */
    record: BigPatchRecord

    /**
     * The header, never changed by a patch.
     */
    header: BigHeader

    /**
     * The original files, in table order.
     */
    entries: BigEntry[]
}

/**
 * Computes the fingerprints of the bytes a patch never changes: the header, and the end of the original bytes (after
 * the tables, which a patch rewrites).
 * @param handle The open BIG file.
 * @param tablesOffset The position of the file table, where the header ends.
 * @param tablesSize The size of the file table and file records.
 * @param originalSize The size of the original bytes.
 * @returns The CRC-32 of the header and of the end of the original bytes.
 */
async function readFingerprints(
    handle: FileHandle,
    tablesOffset: number,
    tablesSize: number,
    originalSize: number,
): Promise<{ headerCrc32: number; tailCrc32: number }> {
    const tailStart = Math.max(tablesOffset + tablesSize, originalSize - BIG_CONSTANTS.fingerprintSize)

    return {
        headerCrc32: crc32(await readFileRange(handle, 0, tablesOffset)),
        tailCrc32: crc32(await readFileRange(handle, tailStart, originalSize - tailStart)),
    }
}

/**
 * Checks that a BIG file still holds the original bytes a record describes.
 * @param handle The open BIG file.
 * @param fileSize The current size of the BIG file.
 * @param record The record of its original state.
 * @returns True if its header and the end of its original bytes are unchanged.
 */
async function hasOriginalBytes(handle: FileHandle, fileSize: number, record: BigPatchRecord): Promise<boolean> {
    if (fileSize < record.originalSize) return false

    const tablesSize = Buffer.byteLength(record.originalTables, "base64")
    const fingerprints = await readFingerprints(handle, record.tablesOffset, tablesSize, record.originalSize)

    return fingerprints.headerCrc32 === record.headerCrc32 && fingerprints.tailCrc32 === record.tailCrc32
}

/**
 * Reads a BIG file as it was before the mod loader patched it: from its record when it's patched, from the BIG file
 * itself otherwise (the state it's in now becomes its original).
 * @param bigPath The BIG file.
 * @param record The record of its original state, `null` when it was never patched.
 * @returns The original state, its header and its files.
 */
export async function readOriginalBig(bigPath: string, record: BigPatchRecord | null): Promise<OriginalBig> {
    const handle = await open(bigPath, "r")

    try {
        const { size: fileSize } = await handle.stat()

        const header = parseBigHeader(await readFileRange(handle, 0, BIG_CONSTANTS.headerReadSize))

        // A record whose bytes aren't there anymore belongs to a BIG file replaced since (an update, Steam's verification)
        if (record && (await hasOriginalBytes(handle, fileSize, record))) {
            const tables = Buffer.from(record.originalTables, "base64")

            return {
                record,
                header,
                entries: parseBigTable(tables, header),
            }
        }

        const tables = await readFileRange(handle, header.tableOffset, getTablesSize(header))

        return {
            record: {
                originalSize: fileSize,
                ...(await readFingerprints(handle, header.tableOffset, tables.length, fileSize)),
                tablesOffset: header.tableOffset,
                originalTables: tables.toString("base64"),
            },
            header,
            entries: parseBigTable(tables, header),
        }
    } finally {
        await handle.close()
    }
}

/**
 * Cuts a BIG file back to its original bytes, then appends the replaced files and writes the original tables back with
 * their slots and file records pointing at them, every other file keeping its original place.
 * @param bigPath The BIG file.
 * @param original The BIG file as it was before the mod loader patched it.
 * @param replacements The new content of the replaced files, by file name (see `getBigKeyFileName`).
 * @returns The number of bytes appended.
 */
export async function writeBigPatch(
    bigPath: string,
    original: OriginalBig,
    replacements: Map<string, Buffer>,
): Promise<number> {
    const entryNames = new Set(original.entries.map(entry => getBigKeyFileName(entry.key)))
    const missingNames = [...replacements.keys()].filter(name => !entryNames.has(name))

    if (missingNames.length) throw new Error(`The BIG file has no file of key ${missingNames.join(", ")}.`)

    const tables = Buffer.from(original.record.originalTables, "base64")
    const recordsOffset = original.header.capacity * BIG_CONSTANTS.tableSlotSize
    const handle = await open(bigPath, "r+")

    try {
        await handle.truncate(original.record.originalSize)

        // Every file starts on a sector boundary, the original bytes end on one in the known builds
        const start = Math.ceil(original.record.originalSize / BIG_CONSTANTS.sectorSize) * BIG_CONSTANTS.sectorSize
        const padding = Buffer.alloc(start - original.record.originalSize)
        await handle.write(padding, 0, padding.length, original.record.originalSize)

        let position = start

        for (const entry of original.entries) {
            const content = replacements.get(getBigKeyFileName(entry.key))
            if (!content) continue

            const data = buildBigFileData(entry.key, content)
            const sizeField = Buffer.alloc(BIG_CONSTANTS.sizeFieldSize)
            sizeField.writeUInt32LE(data.length, 0)

            if (position + sizeField.length + data.length > BIG_CONSTANTS.maxFileOffset) {
                throw new Error("The patched BIG file would grow past 4 GiB, its file table can't point that far.")
            }

            await handle.write(Buffer.concat([sizeField, data]), 0, sizeField.length + data.length, position)

            // The slot points at the new file, the file record gives its size (the size field, padding included)
            tables.writeUInt32LE(position, entry.index * BIG_CONSTANTS.tableSlotSize)
            tables.writeUInt32LE(data.length, recordsOffset + entry.index * BIG_CONSTANTS.fileRecordSize)

            position += sizeField.length + data.length
        }

        await handle.write(tables, 0, tables.length, original.record.tablesOffset)

        return position - original.record.originalSize
    } finally {
        await handle.close()
    }
}

/**
 * Cuts a patched BIG file back to its original bytes and writes its original tables back.
 * @param bigPath The BIG file.
 * @param record The record of its original state.
 * @returns True if the BIG file was restored, false if its original bytes weren't there anymore (it was replaced
 * since, by an update or Steam's verification, so it's already an original).
 */
export async function restoreBig(bigPath: string, record: BigPatchRecord): Promise<boolean> {
    const handle = await open(bigPath, "r+")

    try {
        const { size: fileSize } = await handle.stat()

        if (!(await hasOriginalBytes(handle, fileSize, record))) return false

        const tables = Buffer.from(record.originalTables, "base64")
        await handle.truncate(record.originalSize)
        await handle.write(tables, 0, tables.length, record.tablesOffset)

        return true
    } finally {
        await handle.close()
    }
}
