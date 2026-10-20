import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
    alignToSlot,
    getEntryFileName,
    getStoredSize,
    parseHeader,
    parseTable,
    serializeHeader,
    serializeTable,
} from "@main/lib/bpak/format"
import { type EntryReplacement, readOriginalPak, restorePak, writePatch } from "@main/lib/bpak/patch"
import BPAK_CONSTANTS from "@main/lib/constants/bpak"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { PakEntry } from "@/main/types/bpak"

/**
 * An entry of a synthetic pak, its content stored raw.
 */
type TestEntry = { name?: string; key?: number; content: string; extra?: string }

/**
 * The entries of the synthetic pak every test starts from.
 */
const TEST_ENTRIES: TestEntry[] = [
    { name: "BGE.ini", content: "[Engine]\nFramePerf=0\n" },
    { key: 0x09001331, content: "the original logo", extra: "[Base]\nColor=0x0012e9f8\n" },
    { key: 0x71003ff9, content: "" },
    { key: 0x4900fdca, content: "Nouvelle partie" },
]

/**
 * The folder holding the paks of every test, removed afterwards.
 */
let rootDir: string

/**
 * Builds a pak the way the game's are laid out: the header, a slot per non-empty entry padded to 16 bytes, then the
 * table of contents.
 * @param entries The entries.
 * @returns The pak.
 */
function buildPak(entries: TestEntry[]): Buffer {
    const slots: Buffer[] = []
    const tableEntries: PakEntry[] = []
    let offset = 0

    for (const entry of entries) {
        const content = Buffer.from(entry.content, "latin1")
        const extra = Buffer.from(entry.extra ?? "", "latin1")
        const slot = Buffer.concat([content, extra])

        tableEntries.push({
            name: entry.name ?? null,
            key: entry.key ?? null,
            size: content.length,
            packedSize: 0,
            extraSize: extra.length,
            unknown: 0x7ffa,
            offset: content.length ? offset : 0,
        })

        if (!content.length) continue

        slots.push(slot, Buffer.alloc(alignToSlot(slot.length) - slot.length, BPAK_CONSTANTS.paddingByte))
        offset += alignToSlot(slot.length)
    }

    const table = serializeTable(tableEntries)
    const header = serializeHeader(
        {
            unknown04: 0x00000201,
            unknown08: 1,
            unknown0c: 0,
            entryCount: 0,
            tableSize: 0,
        },
        tableEntries.length,
        table.length,
    )

    return Buffer.concat([header, ...slots, table])
}

/**
 * Reads the entries of a pak the way the game does, its table of contents from the end of the file.
 * @param pak The pak.
 * @returns The entries, and the content and extra bytes of every entry by file name.
 */
function readPak(pak: Buffer): { entries: PakEntry[]; files: Map<string, { content: string; extra: string }> } {
    const header = parseHeader(pak)
    const entries = parseTable(pak.subarray(pak.length - header.tableSize), header.entryCount)
    const files = new Map<string, { content: string; extra: string }>()

    for (const entry of entries) {
        const start = BPAK_CONSTANTS.headerSize + entry.offset
        const storedEnd = start + getStoredSize(entry)

        files.set(getEntryFileName(entry), {
            content: entry.size ? pak.toString("latin1", start, storedEnd) : "",
            extra: pak.toString("latin1", storedEnd, storedEnd + entry.extraSize),
        })
    }

    return { entries, files }
}

/**
 * Writes the synthetic pak to a new file.
 * @param name The file name.
 * @returns The pak file and its bytes.
 */
async function writeTestPak(name: string): Promise<{ pakPath: string; originalBytes: Buffer }> {
    const pakPath = path.join(rootDir, name)
    const originalBytes = buildPak(TEST_ENTRIES)

    await writeFile(pakPath, originalBytes)

    return { pakPath, originalBytes }
}

/**
 * The replacement every patch test applies: the logo replaced, its extra bytes kept.
 */
const LOGO_REPLACEMENT = new Map<string, EntryReplacement>([
    ["09001331", { content: Buffer.from("the logo with MDISK painted on it", "latin1"), extra: null }],
])

beforeAll(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "mdisk-bpak-"))
})

afterAll(async () => {
    await rm(rootDir, { recursive: true, force: true })
})

describe("the BPAK format", () => {
    it("parses back what it serializes", () => {
        const { entries, files } = readPak(buildPak(TEST_ENTRIES))

        expect(entries.map(getEntryFileName)).toEqual(["BGE.ini", "09001331", "71003ff9", "4900fdca"])
        expect(files.get("09001331")).toEqual({
            content: "the original logo",
            extra: "[Base]\nColor=0x0012e9f8\n",
        })
        expect(files.get("71003ff9")).toEqual({ content: "", extra: "" })
    })
})

describe("writePatch", () => {
    it("appends the replaced entries, every other entry keeping its slot", async () => {
        const { pakPath, originalBytes } = await writeTestPak("patch.pak")
        const original = await readOriginalPak(pakPath, null)

        await writePatch(pakPath, original, LOGO_REPLACEMENT)

        const patchedBytes = await readFile(pakPath)
        const { entries, files } = readPak(patchedBytes)
        const originalEntries = readPak(originalBytes).entries

        expect(patchedBytes.subarray(BPAK_CONSTANTS.headerSize, originalBytes.length)).toEqual(
            originalBytes.subarray(BPAK_CONSTANTS.headerSize),
        )
        expect(files.get("09001331")).toEqual({
            content: "the logo with MDISK painted on it",
            extra: "[Base]\nColor=0x0012e9f8\n",
        })
        expect(entries.filter(entry => getEntryFileName(entry) !== "09001331")).toEqual(
            originalEntries.filter(entry => getEntryFileName(entry) !== "09001331"),
        )
    })

    it("starts again from the original, so patching twice gives the same pak", async () => {
        const { pakPath, originalBytes } = await writeTestPak("twice.pak")
        const original = await readOriginalPak(pakPath, null)

        await writePatch(pakPath, original, LOGO_REPLACEMENT)
        const firstBytes = await readFile(pakPath)

        // The record finds the original bytes inside the patched pak
        const patchedOriginal = await readOriginalPak(pakPath, original.record)
        expect(patchedOriginal.record).toEqual(original.record)
        expect(patchedOriginal.record.originalSize).toBe(originalBytes.length)

        await writePatch(pakPath, patchedOriginal, LOGO_REPLACEMENT)
        expect(await readFile(pakPath)).toEqual(firstBytes)
    })

    it("refuses a replacement for an entry the pak doesn't have, leaving the pak untouched", async () => {
        const { pakPath, originalBytes } = await writeTestPak("missing.pak")
        const replacements = new Map([["deadbeef", { content: Buffer.from("x"), extra: null }]])

        await expect(writePatch(pakPath, await readOriginalPak(pakPath, null), replacements)).rejects.toThrow()
        expect(await readFile(pakPath)).toEqual(originalBytes)
    })
})

describe("restorePak", () => {
    it("gives back the original pak, byte for byte", async () => {
        const { pakPath, originalBytes } = await writeTestPak("restore.pak")
        const original = await readOriginalPak(pakPath, null)

        await writePatch(pakPath, original, LOGO_REPLACEMENT)
        await writePatch(pakPath, await readOriginalPak(pakPath, original.record), LOGO_REPLACEMENT)

        expect(await restorePak(pakPath, original.record)).toBe(true)
        expect(await readFile(pakPath)).toEqual(originalBytes)
    })

    it("leaves a pak replaced since alone, its record pointing at bytes that aren't there", async () => {
        const { pakPath } = await writeTestPak("replaced.pak")
        const original = await readOriginalPak(pakPath, null)

        await writePatch(pakPath, original, LOGO_REPLACEMENT)

        // An update puts back a different pak
        const updatedBytes = buildPak([...TEST_ENTRIES, { key: 0x12345678, content: "new in the update" }])
        await writeFile(pakPath, updatedBytes)

        expect(await restorePak(pakPath, original.record)).toBe(false)
        expect(await readFile(pakPath)).toEqual(updatedBytes)
        expect((await readOriginalPak(pakPath, original.record)).record.originalSize).toBe(updatedBytes.length)
    })
})
