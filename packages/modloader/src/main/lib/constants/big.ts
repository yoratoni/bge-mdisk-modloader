import type { OriginalBuild } from "@/main/types/games"

/**
 * All constants related to the BIG file of the original edition ("sally_clean.bf", version 0x22 on PC, see the
 * research notes of the repository).
 */
const BIG_CONSTANTS = {
    /**
     * The name of the BIG file, at the root of the install folder (compared without case).
     */
    fileName: "sally_clean.bf",

    /**
     * The magic starting the BIG file.
     */
    magic: "BIG\0",

    /**
     * The version of the BIG file of the PC releases, the only one read here.
     */
    version: 0x22,

    /**
     * The offset of the version in the header.
     */
    versionOffset: 0x04,

    /**
     * The offset of the number of files in the header.
     */
    fileCountOffset: 0x08,

    /**
     * The offset of the number of folders in the header.
     */
    folderCountOffset: 0x0c,

    /**
     * The offset of the number of slots of the file table in the header (it holds more slots than files).
     */
    capacityOffset: 0x20,

    /**
     * The offset of the number of file tables in the header, always 1 on PC.
     */
    tableCountOffset: 0x24,

    /**
     * The offset of the position of the file table, in the descriptor of the first table that ends the header.
     */
    tableOffsetOffset: 0x34,

    /**
     * The bytes read to parse the header, up to the position of the file table.
     */
    headerReadSize: 0x38,

    /**
     * The known builds, told apart from the file and folder counts of their header, which a patch never changes.
     */
    builds: [
        {
            build: "steam",
            fileCount: 10005,
            folderCount: 11023,
        },
        {
            build: "gog",
            fileCount: 8924,
            folderCount: 335,
        },
    ] as { build: OriginalBuild; fileCount: number; folderCount: number }[],

    /**
     * The size of a slot of the file table: the position of the file, then its key.
     */
    tableSlotSize: 8,

    /**
     * The offset of the key in a slot of the file table.
     */
    tableSlotKeyOffset: 4,

    /**
     * The size of the size field starting every file, which counts the padding.
     */
    sizeFieldSize: 4,

    /**
     * The size of the header of an LZO block: its unpacked size, then its packed size (equal when the block is raw).
     */
    blockHeaderSize: 8,

    /**
     * The size of a file record, after the file table: its size, the previous and next files of its folder, its folder,
     * its timestamp and its name (64 bytes).
     */
    fileRecordSize: 84,

    /**
     * Every file starts on a boundary of this many bytes, its size field included, zero padded.
     */
    sectorSize: 2048,

    /**
     * The largest LZO block of a compressed file, the files are cut in blocks of this many unpacked bytes.
     */
    blockMaxSize: 512000,

    /**
     * The top 4 bits of the keys of the compressed files, except the prefixes below.
     */
    compressedKeyNibble: 0xf,

    /**
     * The top 8 bits of the keys under the compressed nibble whose files are stored raw.
     */
    rawKeyPrefix8: 0xf4,

    /**
     * The top 12 bits of the keys under the compressed nibble whose files are stored raw.
     */
    rawKeyPrefix12: 0xff4,

    /**
     * The largest position the file table can hold (32 bits), a patched BIG file can't grow past it.
     */
    maxFileOffset: 0xffffffff,

    /**
     * The size of the end of the original bytes whose CRC tells whether the BIG file was replaced since it was patched
     * (an update, Steam's verification).
     */
    fingerprintSize: 65536,
} as const

export default BIG_CONSTANTS
