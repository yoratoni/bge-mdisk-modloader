import BIG_CONSTANTS from "@main/lib/constants/big"
import type { BigEntry, BigHeader } from "@/main/types/big"
import type { OriginalBuild } from "@/main/types/games"

/**
 * Parses the header of the BIG file.
 * @param data The start of the BIG file, at least up to its file table.
 * @returns The header fields.
 */
export function parseBigHeader(data: Buffer): BigHeader {
    if (data.toString("latin1", 0, BIG_CONSTANTS.magic.length) !== BIG_CONSTANTS.magic)
        throw new Error("Not a BIG file.")

    const version = data.readUInt32LE(BIG_CONSTANTS.versionOffset)
    if (version !== BIG_CONSTANTS.version) throw new Error(`Unsupported BIG file version ${version}.`)

    if (data.readUInt32LE(BIG_CONSTANTS.tableCountOffset) !== 1)
        throw new Error("The BIG file has several file tables.")

    return {
        fileCount: data.readUInt32LE(BIG_CONSTANTS.fileCountOffset),
        folderCount: data.readUInt32LE(BIG_CONSTANTS.folderCountOffset),
        capacity: data.readUInt32LE(BIG_CONSTANTS.capacityOffset),
        tableOffset: data.readUInt32LE(BIG_CONSTANTS.tableOffsetOffset),
    }
}

/**
 * Tells the build of a BIG file from its header.
 * @param header The header.
 * @returns The build, `null` when it's not a known one.
 */
export function getBigBuild(header: BigHeader): OriginalBuild | null {
    const knownBuild = BIG_CONSTANTS.builds.find(
        build => build.fileCount === header.fileCount && build.folderCount === header.folderCount,
    )

    return knownBuild?.build ?? null
}

/**
 * Returns the size of the file table and the file records, the region a patch changes.
 * @param header The header.
 * @returns The size in bytes.
 */
export function getTablesSize(header: BigHeader): number {
    return header.capacity * (BIG_CONSTANTS.tableSlotSize + BIG_CONSTANTS.fileRecordSize)
}

/**
 * Parses the file table.
 * @param tables The file table and the file records, from the position of the file table.
 * @param header The header.
 * @returns The files, in table order.
 */
export function parseBigTable(tables: Buffer, header: BigHeader): BigEntry[] {
    const entries: BigEntry[] = []

    for (let index = 0; index < header.fileCount; index++) {
        entries.push({
            index,
            offset: tables.readUInt32LE(index * BIG_CONSTANTS.tableSlotSize),
            key: tables.readUInt32LE(index * BIG_CONSTANTS.tableSlotSize + BIG_CONSTANTS.tableSlotKeyOffset),
        })
    }

    return entries
}

/**
 * Returns the name a file of the BIG file is known by, its key as 8 lowercase hex digits.
 * @param key The key.
 * @returns The file name.
 */
export function getBigKeyFileName(key: number): string {
    return key.toString(16).padStart(8, "0")
}

/**
 * Tells whether the files of a key are LZO compressed, the engine decides it from the key alone.
 * @param key The key.
 * @returns True if the file is a chain of LZO blocks.
 */
export function isCompressedKey(key: number): boolean {
    return (
        key >>> 28 === BIG_CONSTANTS.compressedKeyNibble &&
        key >>> 24 !== BIG_CONSTANTS.rawKeyPrefix8 &&
        key >>> 20 !== BIG_CONSTANTS.rawKeyPrefix12
    )
}

/**
 * Builds the stored form of a file: as is, or for a compressed key, a chain of raw LZO blocks ended by an empty block,
 * zero padded to a sector boundary.
 * @param key The key of the file.
 * @param content The content of the file.
 * @returns The stored bytes, without the size field.
 */
export function buildBigFileData(key: number, content: Buffer): Buffer {
    const parts: Buffer[] = []

    if (isCompressedKey(key)) {
        for (let position = 0; position < content.length; position += BIG_CONSTANTS.blockMaxSize) {
            const block = content.subarray(position, position + BIG_CONSTANTS.blockMaxSize)
            const blockHeader = Buffer.alloc(BIG_CONSTANTS.blockHeaderSize)

            // The unpacked size, then the packed one, the same for a raw block, which the engine copies as it is
            blockHeader.writeUInt32LE(block.length, 0)
            blockHeader.writeUInt32LE(block.length, BIG_CONSTANTS.blockHeaderSize / 2)
            parts.push(blockHeader, block)
        }

        parts.push(Buffer.alloc(BIG_CONSTANTS.blockHeaderSize))
    } else {
        parts.push(content)
    }

    // The size field counts toward the sector boundary
    const data = Buffer.concat(parts)
    const fileSize = BIG_CONSTANTS.sizeFieldSize + data.length
    const paddedFileSize = Math.ceil(fileSize / BIG_CONSTANTS.sectorSize) * BIG_CONSTANTS.sectorSize

    return Buffer.concat([data, Buffer.alloc(paddedFileSize - fileSize)])
}
