/**
 * The header of a pak.
 */
export type PakHeader = {
    /**
     * The field at 0x04, kept as is: the pak version (1) and 3 alignment bytes.
     */
    unknown04: number

    /**
     * The field at 0x08, kept as is: the priority per Ray1Map (1, 2 for "Shaders.pak").
     */
    unknown08: number

    /**
     * The field at 0x0C, kept as is: unknown (0, 1 for "Shaders.pak").
     */
    unknown0c: number

    /**
     * The number of entries of the table of contents.
     */
    entryCount: number

    /**
     * The size of the table of contents, which ends the file.
     */
    tableSize: number
}

/**
 * An entry of the table of contents, identified either by a name or by a key.
 */
export type PakEntry = {
    /**
     * The name of a named entry, `null` for a keyed one.
     */
    name: string | null

    /**
     * The Jade key of a keyed entry, `null` for a named one.
     */
    key: number | null

    /**
     * The unpacked size.
     */
    size: number

    /**
     * The size of the LZ4 block, 0 when the entry is stored raw.
     */
    packedSize: number

    /**
     * The size of the plain text stored right after the data.
     */
    extraSize: number

    /**
     * A field kept as is (constant per pak).
     */
    unknown: number

    /**
     * The offset of the slot, relative to the end of the header, 0 for empty entries.
     */
    offset: number
}

/**
 * The original state of a pak the mod loader patched, enough to check its original bytes are still there and to
 * restore it.
 */
export type PatchRecord = {
    /**
     * The size of the pak before the first patch.
     */
    originalSize: number

    /**
     * The header of the pak before the first patch, as hex.
     */
    originalHeader: string

    /**
     * The CRC-32 of the table of contents before the first patch, at the end of the original bytes.
     */
    originalTableCrc32: number
}
