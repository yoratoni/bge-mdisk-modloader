import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { identifyEdition } from "@main/lib/games/identify"
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
