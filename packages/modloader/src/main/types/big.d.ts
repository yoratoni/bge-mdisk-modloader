/**
 * The header fields of the BIG file read by the mod loader.
 */
export type BigHeader = {
    /**
     * The number of files.
     */
    fileCount: number

    /**
     * The number of folders.
     */
    folderCount: number

    /**
     * The number of slots of the file table, and of file records.
     */
    capacity: number

    /**
     * The position of the file table, followed by the file records.
     */
    tableOffset: number
}

/**
 * A file of the BIG file.
 */
export type BigEntry = {
    /**
     * The index of its slot in the file table, and of its file record.
     */
    index: number

    /**
     * Its Jade key.
     */
    key: number

    /**
     * The position of its size field, its data following.
     */
    offset: number
}

/**
 * The original state of a BIG file the mod loader patched.
 */
export type BigPatchRecord = {
    /**
     * The size of the BIG file before the first patch.
     */
    originalSize: number

    /**
     * The CRC-32 of the header, never changed by a patch.
     */
    headerCrc32: number

    /**
     * The CRC-32 of the end of the original bytes, never changed by a patch.
     */
    tailCrc32: number

    /**
     * The position of the file table, where the original tables are written back.
     */
    tablesOffset: number

    /**
     * The original file table and file records, in base64, the only original bytes a patch overwrites.
     */
    originalTables: string
}
