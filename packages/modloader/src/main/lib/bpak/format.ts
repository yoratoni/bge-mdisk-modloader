import BPAK_CONSTANTS from "@main/lib/constants/bpak"
import type { PakEntry, PakHeader } from "@/main/types/bpak"

/**
 * Rounds a value up to the next multiple of the pak alignment.
 * @param value The value to align.
 * @returns The aligned value.
 */
export function alignToSlot(value: number): number {
    return Math.ceil(value / BPAK_CONSTANTS.alignment) * BPAK_CONSTANTS.alignment
}

/**
 * Returns the name an entry is known by: its name, or its key as 8 lowercase hex digits (as the unpacked layers name
 * the files).
 * @param entry The entry.
 * @returns The file name.
 */
export function getEntryFileName(entry: PakEntry): string {
    return entry.name ?? (entry.key ?? 0).toString(16).padStart(8, "0")
}

/**
 * Returns the size of the bytes an entry stores, without its extra bytes.
 * @param entry The entry.
 * @returns The size, the packed one when the entry is compressed.
 */
export function getStoredSize(entry: PakEntry): number {
    return entry.packedSize || entry.size
}

/**
 * Parses the header of a pak.
 * @param data The first bytes of the pak, at least the header.
 * @returns The header.
 */
export function parseHeader(data: Buffer): PakHeader {
    if (data.length < BPAK_CONSTANTS.headerSize || data.toString("latin1", 0, 4) !== BPAK_CONSTANTS.magic) {
        throw new Error("Not a BPAK archive.")
    }

    return {
        unknown04: data.readUInt32LE(0x04),
        unknown08: data.readUInt32LE(0x08),
        unknown0c: data.readUInt32LE(0x0c),
        entryCount: data.readUInt32LE(0x10),
        tableSize: data.readUInt32LE(0x14),
    }
}

/**
 * Serializes the header of a pak.
 * @param header The fields of the header that aren't derived from the entries.
 * @param entryCount The number of entries.
 * @param tableSize The size of the table of contents.
 * @returns The header bytes.
 */
export function serializeHeader(header: PakHeader, entryCount: number, tableSize: number): Buffer {
    const data = Buffer.alloc(BPAK_CONSTANTS.headerSize)

    data.write(BPAK_CONSTANTS.magic, 0, "latin1")
    data.writeUInt32LE(header.unknown04, 0x04)
    data.writeUInt32LE(header.unknown08, 0x08)
    data.writeUInt32LE(header.unknown0c, 0x0c)
    data.writeUInt32LE(entryCount, 0x10)
    data.writeUInt32LE(tableSize, 0x14)

    return data
}

/**
 * Parses a table of contents.
 * @param table The table of contents.
 * @param entryCount The number of entries, from the header.
 * @returns The entries, in table order.
 */
export function parseTable(table: Buffer, entryCount: number): PakEntry[] {
    const entries: PakEntry[] = []
    let position = 0

    for (let index = 0; index < entryCount; index++) {
        const flag = table.readUInt8(position)
        const identifier = table.readUInt32LE(position + 1)
        position += 5

        let name: string | null = null
        let key: number | null = null

        if (flag === BPAK_CONSTANTS.flagNamed) {
            name = table.toString("latin1", position, position + identifier)
            position += identifier
        } else if (flag === BPAK_CONSTANTS.flagKeyed) {
            key = identifier
        } else {
            throw new Error(`Unknown entry flag ${flag} in the table of contents, at ${position - 5}.`)
        }

        entries.push({
            name,
            key,
            size: table.readUInt32LE(position),
            packedSize: table.readUInt32LE(position + 4),
            extraSize: table.readUInt32LE(position + 8),
            unknown: table.readUInt32LE(position + 12),
            offset: Number(table.readBigUInt64LE(position + 16)),
        })

        position += BPAK_CONSTANTS.entryFieldsSize
    }

    if (position !== table.length) throw new Error("The table of contents doesn't end with its last entry.")

    return entries
}

/**
 * Serializes a table of contents.
 * @param entries The entries, in table order.
 * @returns The table of contents bytes.
 */
export function serializeTable(entries: PakEntry[]): Buffer {
    const parts: Buffer[] = []

    for (const entry of entries) {
        const name = entry.name === null ? null : Buffer.from(entry.name, "latin1")
        const identifier = Buffer.alloc(5)

        identifier.writeUInt8(name ? BPAK_CONSTANTS.flagNamed : BPAK_CONSTANTS.flagKeyed, 0)
        identifier.writeUInt32LE(name ? name.length : (entry.key ?? 0), 1)
        parts.push(identifier)

        if (name) parts.push(name)

        const fields = Buffer.alloc(BPAK_CONSTANTS.entryFieldsSize)
        fields.writeUInt32LE(entry.size, 0)
        fields.writeUInt32LE(entry.packedSize, 4)
        fields.writeUInt32LE(entry.extraSize, 8)
        fields.writeUInt32LE(entry.unknown, 12)
        fields.writeBigUInt64LE(BigInt(entry.offset), 16)
        parts.push(fields)
    }

    return Buffer.concat(parts)
}
