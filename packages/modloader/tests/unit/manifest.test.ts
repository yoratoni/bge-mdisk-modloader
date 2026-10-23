import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { readMod } from "@main/lib/mods/manifest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * The folder holding the mods of every test, removed afterwards.
 */
let rootDir: string

/**
 * Writes a mod folder.
 * @param name The folder name.
 * @param files The files of the mod, by path relative to its folder, its "mod.json" added.
 * @returns The folder.
 */
async function writeTestMod(name: string, files: Record<string, string>): Promise<string> {
    const modDir = path.join(rootDir, name)
    const allFiles = { "mod.json": JSON.stringify({ name, version: "1.0.0" }), ...files }

    for (const [filePath, content] of Object.entries(allFiles)) {
        await mkdir(path.dirname(path.join(modDir, filePath)), { recursive: true })
        await writeFile(path.join(modDir, filePath), content)
    }

    return modDir
}

beforeAll(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "mdisk-mods-"))
})

afterAll(async () => {
    await rm(rootDir, { recursive: true, force: true })
})

describe("readMod", () => {
    it("tells a mod for the 20th Anniversary Edition from its paks folder", async () => {
        const modDir = await writeTestMod("logo", {
            "paks/Resources/09001331": "texture",
            "paks/Resources/09001331.extra": "extra bytes",
        })

        expect((await readMod(modDir, "logo", false)).parts).toEqual([
            { edition: "anniversary", build: null, archives: [{ name: "Resources.pak", entryCount: 1 }] },
        ])
    })

    it("tells a mod for every build of the original from the files of its bf folder", async () => {
        const modDir = await writeTestMod("texture", { "bf/61000001": "texture", "bf/61000002": "texture" })

        expect((await readMod(modDir, "texture", false)).parts).toEqual([
            { edition: "original", build: null, archives: [{ name: "sally_clean.bf", entryCount: 2 }] },
        ])
    })

    it("reads a part per build from the build folders of its bf folder", async () => {
        const modDir = await writeTestMod("menu", {
            "bf/61000001": "texture",
            "bf/gog/FD10631A": "text",
            "bf/Steam/fd10631a": "text",
        })

        // The files for every build come first, the build-specific ones override them
        const builds = (await readMod(modDir, "menu", false)).parts.map(part => part.build)
        expect(builds[0]).toBeNull()
        expect(builds.slice(1).sort()).toEqual(["gog", "steam"])
    })

    it("refuses a folder of the bf folder not named after a known build", async () => {
        const modDir = await writeTestMod("disc", { "bf/disc/fd10631a": "text" })
        await expect(readMod(modDir, "disc", false)).rejects.toThrow("isn't a known build")
    })

    it("reads a part for each edition from a mod holding both", async () => {
        const modDir = await writeTestMod("both", { "paks/Text-fr_FR/menu": "text", "bf/fd00aaaa": "text" })
        const mod = await readMod(modDir, "both", true)

        expect(mod.parts.map(part => part.edition)).toEqual(["anniversary", "original"])
        expect(mod.isEnabled).toBe(true)
    })

    it("refuses a mod replacing nothing", async () => {
        const modDir = await writeTestMod("empty", {})
        await expect(readMod(modDir, "empty", false)).rejects.toThrow("replaces nothing")
    })

    it("refuses a file of the bf folder not named after a key", async () => {
        const modDir = await writeTestMod("unnamed", { "bf/gog/menu.txt": "text" })
        await expect(readMod(modDir, "unnamed", false)).rejects.toThrow('"bf/gog/menu.txt" isn\'t named after a key')
    })
})
