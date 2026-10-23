import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import BIG_CONSTANTS from "@main/lib/constants/big"
import { identifyEdition, identifyOriginalBuild } from "@main/lib/games/identify"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * The folder holding the fake installs of every test, removed afterwards.
 */
let rootDir: string

/**
 * Creates a fake install, the given files empty and the given folders empty.
 * @param name The name of the install folder.
 * @param files The files, relative to the install folder.
 * @param dirs The folders, relative to the install folder.
 * @returns The install folder.
 */
async function createInstall(name: string, files: string[], dirs: string[] = []): Promise<string> {
    const installDir = path.join(rootDir, name)

    for (const dir of dirs) await mkdir(path.join(installDir, dir), { recursive: true })

    for (const file of files) {
        await mkdir(path.dirname(path.join(installDir, file)), { recursive: true })
        await writeFile(path.join(installDir, file), "")
    }

    return installDir
}

beforeAll(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "mdisk-identify-"))
})

afterAll(async () => {
    await rm(rootDir, { recursive: true, force: true })
})

describe("identifyEdition", () => {
    it("recognizes the 20th Anniversary Edition from its paks", async () => {
        const installDir = await createInstall("anniversary", ["bge.exe", "Data/Paks/Resources.pak"])
        expect(await identifyEdition(installDir)).toBe("anniversary")
    })

    it("recognizes the original from its BIG file", async () => {
        const installDir = await createInstall("original", ["BGE.exe", "sally_clean.bf", "jade.spe"])
        expect(await identifyEdition(installDir)).toBe("original")
    })

    it("compares the names without case, as a Proton install keeps them", async () => {
        const installDir = await createInstall("cased", ["BGE.EXE"], ["DATA/PAKS"])
        expect(await identifyEdition(installDir)).toBe("anniversary")
    })

    it("rejects a folder without the executable", async () => {
        const installDir = await createInstall("no-executable", ["sally_clean.bf"])
        expect(await identifyEdition(installDir)).toBeNull()
    })

    it("rejects the executable alone", async () => {
        const installDir = await createInstall("executable-only", ["bge.exe"], ["Data"])
        expect(await identifyEdition(installDir)).toBeNull()
    })

    it("rejects a folder that doesn't exist", async () => {
        expect(await identifyEdition(path.join(rootDir, "missing"))).toBeNull()
    })
})

describe("identifyOriginalBuild", () => {
    /**
     * Writes the header of a BIG file, the only part the build is told from.
     * @param installDir The install folder.
     * @param fileCount The number of files.
     * @param folderCount The number of folders.
     */
    async function writeBigHeader(installDir: string, fileCount: number, folderCount: number) {
        const header = Buffer.alloc(BIG_CONSTANTS.headerReadSize)
        header.write(BIG_CONSTANTS.magic, 0, "latin1")
        header.writeUInt32LE(BIG_CONSTANTS.version, BIG_CONSTANTS.versionOffset)
        header.writeUInt32LE(fileCount, BIG_CONSTANTS.fileCountOffset)
        header.writeUInt32LE(folderCount, BIG_CONSTANTS.folderCountOffset)
        header.writeUInt32LE(1, BIG_CONSTANTS.tableCountOffset)

        await writeFile(path.join(installDir, "SALLY_CLEAN.BF"), header)
    }

    it("recognizes the Steam and GOG builds from the counts of their header", async () => {
        const steamDir = await createInstall("steam-build", ["BGE.exe"])
        const gogDir = await createInstall("gog-build", ["BGE.exe"])

        await writeBigHeader(steamDir, 10005, 11023)
        await writeBigHeader(gogDir, 8924, 335)

        expect(await identifyOriginalBuild(steamDir)).toBe("steam")
        expect(await identifyOriginalBuild(gogDir)).toBe("gog")
    })

    it("leaves an unknown build, or an unreadable BIG file, unnamed", async () => {
        const unknownDir = await createInstall("unknown-build", ["BGE.exe"])
        const emptyDir = await createInstall("empty-big", ["BGE.exe", "sally_clean.bf"])

        await writeBigHeader(unknownDir, 9000, 400)

        expect(await identifyOriginalBuild(unknownDir)).toBeNull()
        expect(await identifyOriginalBuild(emptyDir)).toBeNull()
    })
})
