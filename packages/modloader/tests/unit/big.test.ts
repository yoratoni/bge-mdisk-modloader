import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { buildBigFileData, getTablesSize, isCompressedKey, parseBigHeader, parseBigTable } from "@main/lib/big/format"
import { readOriginalBig, restoreBig, writeBigPatch } from "@main/lib/big/patch"
import BIG_CONSTANTS from "@main/lib/constants/big"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * A file of a synthetic BIG file, its content stored the way its key calls for.
 */
type TestFile = { key: number; content: string }

/**
 * The files of the synthetic BIG file every test starts from: an AI model (stored raw), a text bank (compressed key)
 * and a texture (stored raw).
 */
const TEST_FILES: TestFile[] = [
    { key: 0x71003ff3, content: "univers.omd" },
    { key: 0xfd00aaaa, content: "Nouvelle partie" },
    { key: 0x61000001, content: "a texture" },
]

/**
 * The number of slots of the synthetic file table, more than its files like the game's.
 */
const TEST_CAPACITY = 8

/**
 * The position of the file table, where the game's header ends.
 */
const TEST_TABLE_OFFSET = 0x44

/**
 * The folder holding the BIG files of every test, removed afterwards.
 */
let rootDir: string

/**
 * Builds a BIG file the way the game's are laid out: the header, the file table and the file records, then every
 * file from a sector boundary.
 * @param files The files.
 * @returns The BIG file.
 */
function buildBig(files: TestFile[]): Buffer {
    const header = Buffer.alloc(TEST_TABLE_OFFSET)
    header.write(BIG_CONSTANTS.magic, 0, "latin1")
    header.writeUInt32LE(BIG_CONSTANTS.version, BIG_CONSTANTS.versionOffset)
    header.writeUInt32LE(files.length, BIG_CONSTANTS.fileCountOffset)
    header.writeUInt32LE(TEST_CAPACITY, BIG_CONSTANTS.capacityOffset)
    header.writeUInt32LE(1, BIG_CONSTANTS.tableCountOffset)
    header.writeUInt32LE(TEST_TABLE_OFFSET, BIG_CONSTANTS.tableOffsetOffset)

    const tables = Buffer.alloc(TEST_CAPACITY * (BIG_CONSTANTS.tableSlotSize + BIG_CONSTANTS.fileRecordSize))
    const dataStart = BIG_CONSTANTS.sectorSize
    const datas: Buffer[] = []
    let position = dataStart

    for (const [index, file] of files.entries()) {
        const data = buildBigFileData(file.key, Buffer.from(file.content, "latin1"))
        const sizeField = Buffer.alloc(BIG_CONSTANTS.sizeFieldSize)
        sizeField.writeUInt32LE(data.length, 0)

        tables.writeUInt32LE(position, index * BIG_CONSTANTS.tableSlotSize)
        tables.writeUInt32LE(file.key, index * BIG_CONSTANTS.tableSlotSize + BIG_CONSTANTS.tableSlotKeyOffset)
        tables.writeUInt32LE(
            data.length,
            TEST_CAPACITY * BIG_CONSTANTS.tableSlotSize + index * BIG_CONSTANTS.fileRecordSize,
        )

        datas.push(sizeField, data)
        position += sizeField.length + data.length
    }

    const head = Buffer.concat([header, tables])
    return Buffer.concat([head, Buffer.alloc(dataStart - head.length), ...datas])
}

/**
 * Reads the content of every file of a BIG file the way the game does, from its file table, the raw LZO blocks of the
 * compressed keys unwrapped.
 * @param big The BIG file.
 * @returns The content of every file, and its stored size, by key.
 */
function readBig(big: Buffer): Map<number, { content: string; size: number }> {
    const header = parseBigHeader(big)
    const entries = parseBigTable(big.subarray(header.tableOffset, header.tableOffset + getTablesSize(header)), header)
    const files = new Map<number, { content: string; size: number }>()

    for (const entry of entries) {
        const size = big.readUInt32LE(entry.offset)
        let position = entry.offset + BIG_CONSTANTS.sizeFieldSize
        let content = ""

        if (isCompressedKey(entry.key)) {
            for (let plain = big.readUInt32LE(position); plain; plain = big.readUInt32LE(position)) {
                expect(big.readUInt32LE(position + 4)).toBe(plain)
                content += big.toString("latin1", position + BIG_CONSTANTS.blockHeaderSize, position + 8 + plain)
                position += BIG_CONSTANTS.blockHeaderSize + plain
            }
        } else {
            content = big.toString("latin1", position, position + size).replace(/\0+$/, "")
        }

        files.set(entry.key, { content, size })
    }

    return files
}

/**
 * Writes the synthetic BIG file to a new file.
 * @param name The file name.
 * @returns The BIG file and its bytes.
 */
async function writeTestBig(name: string): Promise<{ bigPath: string; originalBytes: Buffer }> {
    const bigPath = path.join(rootDir, name)
    const originalBytes = buildBig(TEST_FILES)

    await writeFile(bigPath, originalBytes)

    return { bigPath, originalBytes }
}

/**
 * The replacement every patch test applies: the text bank, under a compressed key.
 */
const TEXT_REPLACEMENT = new Map([["fd00aaaa", Buffer.from("MDISK ca marche", "latin1")]])

beforeAll(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "mdisk-big-"))
})

afterAll(async () => {
    await rm(rootDir, { recursive: true, force: true })
})

describe("the BIG format", () => {
    it("tells the compressed keys from their prefix", () => {
        expect(isCompressedKey(0xfd00aaaa)).toBe(true)
        expect(isCompressedKey(0xff007685)).toBe(true)
        expect(isCompressedKey(0xf4000001)).toBe(false)
        expect(isCompressedKey(0xff400001)).toBe(false)
        expect(isCompressedKey(0x71003ff3)).toBe(false)
    })

    it("pads every file to a sector boundary, its size field included", () => {
        const data = buildBigFileData(0x61000001, Buffer.alloc(5000))
        expect((BIG_CONSTANTS.sizeFieldSize + data.length) % BIG_CONSTANTS.sectorSize).toBe(0)
    })

    it("reads back what it builds", () => {
        const files = readBig(buildBig(TEST_FILES))
        expect(files.get(0xfd00aaaa)?.content).toBe("Nouvelle partie")
        expect(files.get(0x71003ff3)?.content).toBe("univers.omd")
    })
})

describe("writeBigPatch", () => {
    it("appends the replaced files, every other file keeping its place", async () => {
        const { bigPath, originalBytes } = await writeTestBig("patch.bf")

        await writeBigPatch(bigPath, await readOriginalBig(bigPath, null), TEXT_REPLACEMENT)

        const patchedBytes = await readFile(bigPath)
        const files = readBig(patchedBytes)
        const originalFiles = readBig(originalBytes)

        expect(files.get(0xfd00aaaa)?.content).toBe("MDISK ca marche")
        expect(files.get(0x71003ff3)).toEqual(originalFiles.get(0x71003ff3))
        expect(files.get(0x61000001)).toEqual(originalFiles.get(0x61000001))
        expect(patchedBytes.subarray(BIG_CONSTANTS.sectorSize, originalBytes.length)).toEqual(
            originalBytes.subarray(BIG_CONSTANTS.sectorSize),
        )
    })

    it("starts again from the original, so patching twice gives the same BIG file", async () => {
        const { bigPath } = await writeTestBig("twice.bf")
        const original = await readOriginalBig(bigPath, null)

        await writeBigPatch(bigPath, original, TEXT_REPLACEMENT)
        const firstBytes = await readFile(bigPath)

        await writeBigPatch(bigPath, await readOriginalBig(bigPath, original.record), TEXT_REPLACEMENT)
        expect(await readFile(bigPath)).toEqual(firstBytes)
    })

    it("refuses a replacement for a key the BIG file doesn't have, leaving it untouched", async () => {
        const { bigPath, originalBytes } = await writeTestBig("missing.bf")
        const replacements = new Map([["deadbeef", Buffer.from("x")]])

        await expect(writeBigPatch(bigPath, await readOriginalBig(bigPath, null), replacements)).rejects.toThrow()
        expect(await readFile(bigPath)).toEqual(originalBytes)
    })
})

describe("restoreBig", () => {
    it("gives back the original BIG file, byte for byte", async () => {
        const { bigPath, originalBytes } = await writeTestBig("restore.bf")
        const original = await readOriginalBig(bigPath, null)

        await writeBigPatch(bigPath, original, TEXT_REPLACEMENT)

        expect(await restoreBig(bigPath, original.record)).toBe(true)
        expect(await readFile(bigPath)).toEqual(originalBytes)
    })

    it("leaves a BIG file replaced since alone, its record pointing at bytes that aren't there", async () => {
        const { bigPath } = await writeTestBig("replaced.bf")
        const original = await readOriginalBig(bigPath, null)

        await writeBigPatch(bigPath, original, TEXT_REPLACEMENT)

        // An update puts back a different BIG file
        const updatedBytes = buildBig([...TEST_FILES, { key: 0x12345678, content: "new in the update" }])
        await writeFile(bigPath, updatedBytes)

        expect(await restoreBig(bigPath, original.record)).toBe(false)
        expect(await readFile(bigPath)).toEqual(updatedBytes)
        expect((await readOriginalBig(bigPath, original.record)).record.originalSize).toBe(updatedBytes.length)
    })
})
