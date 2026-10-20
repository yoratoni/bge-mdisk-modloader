import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { getEntryFileName } from "@main/lib/bpak/format"
import { type EntryReplacement, type OriginalPak, readOriginalPak, restorePak, writePatch } from "@main/lib/bpak/patch"
import MODS_CONSTANTS from "@main/lib/constants/mods"
import { detectGames } from "@main/lib/games/service"
import { getReplacedEntryName, listModEntries, readMod } from "@main/lib/mods/manifest"
import { deleteRecord, listRecordedPaks, readRecord, writeRecord } from "@main/lib/mods/records"
import { configStore } from "@main/lib/stores/config"
import { convertErrorToMessage } from "@main/lib/utils/errors"
import { pathExists } from "@main/lib/utils/fs"
import { getStoreDir } from "@main/lib/utils/stores"
import { type BrowserWindow, dialog } from "electron"
import type { Game, GameEdition } from "@/main/types/games"
import type { AddModResult, ApplyModsResult, Mod, RestoreGameResult } from "@/main/types/mods"

/**
 * Returns the folder holding the installed mods, one folder per mod.
 * @returns The folder, in the app's data folder.
 */
function getModsDir(): string {
    return path.join(getStoreDir(), MODS_CONSTANTS.modsDirName)
}

/**
 * Returns a pak of an install.
 * @param gamePath The install folder.
 * @param pakName The pak name, without extension.
 * @returns The pak file.
 */
function getPakPath(gamePath: string, pakName: string): string {
    return path.join(gamePath, ...MODS_CONSTANTS.gamePaksDir, `${pakName}${MODS_CONSTANTS.pakExtension}`)
}

/**
 * Returns the folder of an installed mod, refusing a name reaching out of the mods folder.
 * @param id The name of the mod, its folder name.
 * @returns The folder.
 */
function getModDir(id: string): string {
    if (path.basename(id) !== id) throw new Error(`"${id}" isn't the name of an installed mod.`)

    return path.join(getModsDir(), id)
}

/**
 * Returns the install the mods go into.
 * @returns The picked install.
 */
async function getSelectedGame(): Promise<Game> {
    const state = await detectGames()
    const game = state.games.find(detectedGame => detectedGame.path === state.selectedPath)

    if (!game) throw new Error(MODS_CONSTANTS.messages.noGame)

    return game
}

/**
 * Turns the error of a pak another process holds open (the game most likely) into a message saying so.
 * @param error The error thrown while writing a pak.
 * @returns The error to surface.
 */
function explainWriteError(error: unknown): Error {
    const code = (error as NodeJS.ErrnoException)?.code

    if (code && (MODS_CONSTANTS.busyErrorCodes as readonly string[]).includes(code)) {
        return new Error(MODS_CONSTANTS.messages.gameRunning)
    }

    return error instanceof Error ? error : new Error(String(error))
}

/**
 * Lists the installed mods.
 * @returns The mods, by name, the folders that aren't readable mods left out.
 */
export async function listMods(): Promise<Mod[]> {
    const modsDir = getModsDir()
    await mkdir(modsDir, { recursive: true })

    const config = await configStore.get()
    const mods: Mod[] = []

    for (const dir of await readdir(modsDir, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue

        try {
            mods.push(await readMod(path.join(modsDir, dir.name), dir.name, config.enabledMods.includes(dir.name)))
        } catch (error) {
            console.warn(`[mods] ${dir.name} skipped:`, convertErrorToMessage(error))
        }
    }

    return mods.sort((first, second) => first.name.localeCompare(second.name))
}

/**
 * Installs a mod from a folder the user picks, copied into the mods folder.
 * @param parentWindow The window the folder picker belongs to.
 * @returns The installed mods, or why the mod wasn't added.
 */
export async function addMod(parentWindow: BrowserWindow | null): Promise<AddModResult> {
    const options = { title: MODS_CONSTANTS.addDialogTitle, properties: ["openDirectory" as const] }
    const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, options)
        : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return { ok: false, reason: "canceled" }

    const sourceDir = path.resolve(result.filePaths[0])
    const id = path.basename(sourceDir)

    try {
        await readMod(sourceDir, id, false)
    } catch (error) {
        return {
            ok: false,
            reason: "invalid",
            details: convertErrorToMessage(error),
        }
    }

    const modDir = getModDir(id)

    if (await pathExists(modDir)) return { ok: false, reason: "already-installed" }

    await cp(sourceDir, modDir, { recursive: true })

    return { ok: true, mods: await listMods() }
}

/**
 * Enables or disables a mod, an enabled mod going last (it wins over the ones enabled before it).
 * @param id The name of the mod.
 * @param isEnabled Whether the mod is enabled.
 * @returns The installed mods.
 */
export async function setModEnabled(id: string, isEnabled: boolean): Promise<Mod[]> {
    await configStore.update(config => {
        config.enabledMods = config.enabledMods.filter(enabledId => enabledId !== id)
        if (isEnabled) config.enabledMods.push(id)

        return undefined
    })

    return listMods()
}

/**
 * Uninstalls a mod, deleting its folder (the game keeps it until the mods are applied again).
 * @param id The name of the mod.
 * @returns The installed mods.
 */
export async function removeMod(id: string): Promise<Mod[]> {
    const modDir = getModDir(id)

    await setModEnabled(id, false)
    await rm(modDir, { recursive: true, force: true })

    return listMods()
}

/**
 * Reads the new content of every entry the enabled mods of an edition replace.
 * @param modIds The enabled mods, in the order they're applied.
 * @param edition The edition of the install.
 * @returns The new content of the entries by file name, by pak name, a later mod replacing what an earlier one set.
 */
async function collectReplacements(
    modIds: string[],
    edition: GameEdition,
): Promise<Map<string, Map<string, EntryReplacement>>> {
    const replacementsByPak = new Map<string, Map<string, EntryReplacement>>()

    for (const id of modIds) {
        const modDir = getModDir(id)

        // A mod removed or broken since it was enabled is skipped, like a mod made for the other edition
        const mod = await readMod(modDir, id, true).catch(() => null)
        if (mod?.edition !== edition) continue

        for (const [pakName, files] of await listModEntries(modDir)) {
            const pakReplacements = replacementsByPak.get(pakName) ?? new Map<string, EntryReplacement>()
            replacementsByPak.set(pakName, pakReplacements)

            for (const file of files) {
                const filePath = path.join(modDir, MODS_CONSTANTS.paksDirName, pakName, file)
                const extraPath = `${filePath}${MODS_CONSTANTS.extraSuffix}`

                pakReplacements.set(getReplacedEntryName(file), {
                    content: await readFile(filePath),
                    extra: (await pathExists(extraPath)) ? await readFile(extraPath) : null,
                })
            }
        }
    }

    return replacementsByPak
}

/**
 * Reads the original state of every pak the mods change, checking that each one exists and holds the entries the mods
 * replace, so a mod naming a missing pak or entry changes nothing.
 * @param game The install.
 * @param replacementsByPak The new content of the entries, by pak name.
 * @returns The original state of every pak, by pak name.
 */
async function readOriginalPaks(
    game: Game,
    replacementsByPak: Map<string, Map<string, EntryReplacement>>,
): Promise<Map<string, OriginalPak>> {
    const originals = new Map<string, OriginalPak>()

    for (const [pakName, replacements] of replacementsByPak) {
        const pakPath = getPakPath(game.path, pakName)

        if (!(await pathExists(pakPath))) throw new Error(`${MODS_CONSTANTS.messages.missingPak} "${pakName}".`)

        const original = await readOriginalPak(pakPath, await readRecord(game.path, pakName))
        const entryNames = new Set(original.entries.map(getEntryFileName))
        const missingNames = [...replacements.keys()].filter(name => !entryNames.has(name))

        if (missingNames.length) throw new Error(`"${pakName}" has no entry named ${missingNames.join(", ")}.`)

        originals.set(pakName, original)
    }

    return originals
}

/**
 * Puts the paks of an install the mod loader patched back to their originals, unless they're still changed by mods.
 * @param game The install.
 * @param keptPaks The paks the mods still change, left as they are.
 * @returns The paks put back.
 */
async function restorePaks(game: Game, keptPaks: Set<string>): Promise<string[]> {
    const restoredPaks: string[] = []

    for (const pakName of await listRecordedPaks(game.path)) {
        if (keptPaks.has(pakName)) continue

        const pakPath = getPakPath(game.path, pakName)
        const record = await readRecord(game.path, pakName)

        // A pak gone since (an uninstall) or replaced since (an update) is already an original
        if (record && (await pathExists(pakPath))) await restorePak(pakPath, record)

        await deleteRecord(game.path, pakName)
        restoredPaks.push(pakName)
    }

    return restoredPaks
}

/**
 * Applies the enabled mods to the picked install: the paks they change are patched (each one starting again from its
 * original), the paks no mod changes anymore are put back.
 * @returns The paks patched and the paks put back.
 */
export async function applyMods(): Promise<ApplyModsResult> {
    const game = await getSelectedGame()

    if (game.edition !== "anniversary") throw new Error(MODS_CONSTANTS.messages.unsupportedEdition)

    const config = await configStore.get()
    const replacementsByPak = await collectReplacements(config.enabledMods, game.edition)
    const originals = await readOriginalPaks(game, replacementsByPak)
    const patchedPaks: ApplyModsResult["patchedPaks"] = []

    try {
        for (const [pakName, original] of originals) {
            const replacements = replacementsByPak.get(pakName)!

            // Recorded before the pak is touched, so an interrupted patch can still be restored
            await writeRecord(game.path, pakName, original.record)
            await writePatch(getPakPath(game.path, pakName), original, replacements)

            patchedPaks.push({ name: pakName, entryCount: replacements.size })
        }

        return { patchedPaks, restoredPaks: await restorePaks(game, new Set(originals.keys())) }
    } catch (error) {
        throw explainWriteError(error)
    }
}

/**
 * Puts every pak of the picked install the mod loader patched back to its original (the mods stay installed and
 * enabled, applying them again patches the game again).
 * @returns The paks put back.
 */
export async function restoreGame(): Promise<RestoreGameResult> {
    const game = await getSelectedGame()

    try {
        return { restoredPaks: await restorePaks(game, new Set()) }
    } catch (error) {
        throw explainWriteError(error)
    }
}
