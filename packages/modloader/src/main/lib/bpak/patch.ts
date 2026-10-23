import { type FileHandle, open } from "node:fs/promises"
import { crc32 } from "node:zlib"
import {
    alignToSlot,
    getEntryFileName,
    getStoredSize,
    parseHeader,
    parseTable,
    serializeHeader,
    serializeTable,
} from "@main/lib/bpak/format"
import BPAK_CONSTANTS from "@main/lib/constants/bpak"
import { readFileRange } from "@main/lib/utils/fs"
import type { PakEntry, PakHeader, PatchRecord } from "@/main/types/bpak"

/**
 * The new content of an entry.
 */
export type EntryReplacement = {
    /**
     * The new data, stored raw.
     */
    content: Buffer

    /**
     * The new extra bytes, `null` to keep the original ones.
     */
    extra: Buffer | null
}

/**
 * A pak as it was before the mod loader patched it.
 */
export type OriginalPak = {
    record: PatchRecord
    header: PakHeader
    entries: PakEntry[]
}

/**
 * Checks that a pak still holds the original bytes a record describes, its original table of contents where it was.
 * @param handle The open pak.
 * @param fileSize The current size of the pak.
 * @param record The record of its original state.
 * @returns True if the original table of contents is intact.
 */
async function hasOriginalBytes(handle: FileHandle, fileSize: number, record: PatchRecord): Promise<boolean> {
    if (fileSize < record.originalSize) return false

    const { tableSize } = parseHeader(Buffer.from(record.originalHeader, "hex"))
    const table = await readFileRange(handle, record.originalSize - tableSize, tableSize)

    return crc32(table) === record.originalTableCrc32
}

/**
 * Reads a pak as it was before the mod loader patched it: from its record when it's patched, from the pak itself
 * otherwise (the state it's in now becomes its original).
 * @param pakPath The pak.
 * @param record The record of its original state, `null` when it was never patched.
 * @returns The original state, its header and its entries.
 */
export async function readOriginalPak(pakPath: string, record: PatchRecord | null): Promise<OriginalPak> {
    const handle = await open(pakPath, "r")

    try {
        const { size: fileSize } = await handle.stat()

        // A record whose bytes aren't there anymore belongs to a pak replaced since (an update, Steam's verification)
        let originalRecord = record && (await hasOriginalBytes(handle, fileSize, record)) ? record : null

        if (!originalRecord) {
            const header = await readFileRange(handle, 0, BPAK_CONSTANTS.headerSize)
            const { tableSize } = parseHeader(header)
            const table = await readFileRange(handle, fileSize - tableSize, tableSize)

            originalRecord = {
                originalSize: fileSize,
                originalHeader: header.toString("hex"),
                originalTableCrc32: crc32(table),
            }
        }

        const header = parseHeader(Buffer.from(originalRecord.originalHeader, "hex"))
        const table = await readFileRange(handle, originalRecord.originalSize - header.tableSize, header.tableSize)

        return {
            record: originalRecord,
            header,
            entries: parseTable(table, header.entryCount),
        }
    } finally {
        await handle.close()
    }
}

/**
 * Cuts a pak back to its original bytes, then appends the replaced entries and a new table of contents pointing at
 * them, every other entry keeping its original slot.
 * @param pakPath The pak.
 * @param original The pak as it was before the mod loader patched it.
 * @param replacements The new content of the replaced entries, by file name (see `getEntryFileName`).
 * @returns The number of bytes appended.
 */
export async function writePatch(
    pakPath: string,
    original: OriginalPak,
    replacements: Map<string, EntryReplacement>,
): Promise<number> {
    const entryNames = new Set(original.entries.map(getEntryFileName))
    const missingNames = [...replacements.keys()].filter(name => !entryNames.has(name))

    if (missingNames.length) throw new Error(`The pak has no entry named ${missingNames.join(", ")}.`)

    const handle = await open(pakPath, "r+")

    try {
        await handle.truncate(original.record.originalSize)

        // The offsets are relative to the end of the header, every slot starts on a 16-byte boundary
        const dataEnd = original.record.originalSize - BPAK_CONSTANTS.headerSize
        let offset = alignToSlot(dataEnd)
        await handle.write(
            Buffer.alloc(offset - dataEnd, BPAK_CONSTANTS.paddingByte),
            0,
            offset - dataEnd,
            original.record.originalSize,
        )

        const tableEntries: PakEntry[] = []

        for (const entry of original.entries) {
            const replacement = replacements.get(getEntryFileName(entry))

            if (!replacement) {
                tableEntries.push(entry)
                continue
            }

            // The original extra bytes are read from the original slot, still there after the cut
            const extra =
                replacement.extra ??
                (await readFileRange(
                    handle,
                    BPAK_CONSTANTS.headerSize + entry.offset + getStoredSize(entry),
                    entry.extraSize,
                ))
            const slot = Buffer.concat([replacement.content, extra])
            const paddedSlot = Buffer.concat([
                slot,
                Buffer.alloc(alignToSlot(slot.length) - slot.length, BPAK_CONSTANTS.paddingByte),
            ])

            await handle.write(paddedSlot, 0, paddedSlot.length, BPAK_CONSTANTS.headerSize + offset)

            tableEntries.push({
                ...entry,
                size: replacement.content.length,
                packedSize: 0,
                extraSize: extra.length,
                offset: replacement.content.length ? offset : 0,
            })

            offset += paddedSlot.length
        }

        const table = serializeTable(tableEntries)
        await handle.write(table, 0, table.length, BPAK_CONSTANTS.headerSize + offset)

        const header = serializeHeader(original.header, tableEntries.length, table.length)
        await handle.write(header, 0, header.length, 0)

        return BPAK_CONSTANTS.headerSize + offset + table.length - original.record.originalSize
    } finally {
        await handle.close()
    }
}

/**
 * Cuts a patched pak back to its original bytes and header.
 * @param pakPath The pak.
 * @param record The record of its original state.
 * @returns True if the pak was restored, false if its original bytes weren't there anymore (it was replaced since, by
 * an update or Steam's verification, so it's already an original).
 */
export async function restorePak(pakPath: string, record: PatchRecord): Promise<boolean> {
    const handle = await open(pakPath, "r+")

    try {
        const { size: fileSize } = await handle.stat()

        if (!(await hasOriginalBytes(handle, fileSize, record))) return false

        const header = Buffer.from(record.originalHeader, "hex")
        await handle.truncate(record.originalSize)
        await handle.write(header, 0, header.length, 0)

        return true
    } finally {
        await handle.close()
    }
}
