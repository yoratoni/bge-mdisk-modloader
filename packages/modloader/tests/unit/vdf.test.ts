import { getVdfValue, parseVdf, type VdfObject } from "@main/lib/games/vdf"
import { describe, expect, it } from "vitest"

describe("parseVdf", () => {
    it("parses the current library list, one object per library", () => {
        const text = [
            '"libraryfolders"',
            "{",
            '\t"0"',
            "\t{",
            '\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"',
            '\t\t"apps"',
            "\t\t{",
            '\t\t\t"228980"\t\t"204525588"',
            "\t\t}",
            "\t}",
            '\t"1"',
            "\t{",
            '\t\t"path"\t\t"F:\\\\SteamLibrary"',
            "\t}",
            "}",
        ].join("\n")

        const libraries = parseVdf(text).libraryfolders as VdfObject

        expect((libraries["0"] as VdfObject).path).toBe("C:\\Program Files (x86)\\Steam")
        expect(((libraries["0"] as VdfObject).apps as VdfObject)["228980"]).toBe("204525588")
        expect((libraries["1"] as VdfObject).path).toBe("F:\\SteamLibrary")
    })

    it("parses the old library list, one path per library", () => {
        const libraries = parseVdf('"LibraryFolders" { "TimeNextStatsReport" "123" "1" "D:\\\\Games" }')

        expect(getVdfValue(libraries, "libraryfolders")).toEqual({ TimeNextStatsReport: "123", "1": "D:\\Games" })
    })

    it("parses an app manifest, skipping the comments", () => {
        const text = [
            "// A manifest",
            '"AppState"',
            "{",
            '\t"appid"\t\t"2556990"',
            '\t"StateFlags"\t\t"4"',
            '\t"installdir"\t\t"Beyond Good and Evil - 20th Anniversary Edition"',
            "}",
        ].join("\n")

        const appState = parseVdf(text).AppState as VdfObject

        expect(appState.installdir).toBe("Beyond Good and Evil - 20th Anniversary Edition")
        expect(appState.StateFlags).toBe("4")
    })

    it("reads the escape sequences of quoted strings", () => {
        expect(parseVdf('"key" "a \\"quoted\\" \\\\ value\\n"').key).toBe('a "quoted" \\ value\n')
    })

    it("rejects a key without a value", () => {
        expect(() => parseVdf('"key"')).toThrow()
    })
})

describe("getVdfValue", () => {
    it("compares the keys without case, like Steam", () => {
        expect(getVdfValue({ InstallDir: "game" }, "installdir")).toBe("game")
        expect(getVdfValue({ InstallDir: "game" }, "missing")).toBeUndefined()
    })
})
