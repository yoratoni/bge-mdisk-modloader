import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { getBigKeyFileName } from "@main/lib/big/format"
import { type OriginalBig, readOriginalBig, restoreBig, writeBigPatch } from "@main/lib/big/patch"
import { getEntryFileName } from "@main/lib/bpak/format"
import { type EntryReplacement, type OriginalPak, readOriginalPak, restorePak, writePatch } from "@main/lib/bpak/patch"
import BIG_CONSTANTS from "@main/lib/constants/big"
import MODS_CONSTANTS from "@main/lib/constants/mods"
import { detectGames } from "@main/lib/games/service"
import { getReplacedEntryName, listModBigEntries, listModEntries, readMod } from "@main/lib/mods/manifest"
import { deleteRecord, listRecordedArchives, readRecord, writeRecord } from "@main/lib/mods/records"
import { configStore } from "@main/lib/stores/config"
import { convertErrorToMessage } from "@main/lib/utils/errors"
import { findFileWithoutCase, pathExists } from "@main/lib/utils/fs"
import { getStoreDir } from "@main/lib/utils/stores"
import { type BrowserWindow, dialog } from "electron"
import type { BigPatchRecord } from "@/main/types/big"
import type { PatchRecord } from "@/main/types/bpak"
import type { Game, OriginalBuild } from "@/main/types/games"
import type { AddModResult, ApplyModsResult, Mod, ModArchive, RestoreGameResult } from "@/main/types/mods"

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
 * @param pakFileName The file name of the pak (e.g. "Resources.pak").
 * @returns The pak file.
 */
function getPakPath(gamePath: string, pakFileName: string): string {
    return path.join(gamePath, ...MODS_CONSTANTS.gamePaksDir, pakFileName)
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
 * Turns the error of an archive another process holds open (the game most likely), or that the app isn't allowed to
 * write, into a message saying what to do.
 * @param error The error thrown while writing an archive.
 * @returns The error to surface.
 */
function explainWriteError(error: unknown): Error {
    const code = (error as NodeJS.ErrnoException)?.code

    if (code === MODS_CONSTANTS.busyErrorCode) return new Error(MODS_CONSTANTS.messages.gameRunning)

    if (code && (MODS_CONSTANTS.deniedErrorCodes as readonly string[]).includes(code)) {
        return new Error(MODS_CONSTANTS.messages.writeDenied)
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
 * Returns the folders of the enabled mods, a mod removed or broken since it was enabled left out.
 * @param modIds The enabled mods, in the order they're applied.
 * @returns The folders, in the same order.
 */
async function getEnabledModDirs(modIds: string[]): Promise<string[]> {
    const modDirs: string[] = []

    for (const id of modIds) {
        const modDir = getModDir(id)
        const isReadable = await readMod(modDir, id, true).then(
            () => true,
            () => false,
        )

        if (isReadable) modDirs.push(modDir)
    }

    return modDirs
}

/**
 * Reads the new content of every pak entry the enabled mods replace (their part for the 20th Anniversary Edition).
 * @param modDirs The folders of the enabled mods, in the order they're applied.
 * @returns The new content of the entries by file name, by pak file name, a later mod replacing what an earlier one
 * set.
 */
async function collectPakReplacements(modDirs: string[]): Promise<Map<string, Map<string, EntryReplacement>>> {
    const replacementsByPak = new Map<string, Map<string, EntryReplacement>>()

    for (const modDir of modDirs) {
        for (const [pakName, files] of await listModEntries(modDir)) {
            const pakFileName = `${pakName}${MODS_CONSTANTS.pakExtension}`
            const pakReplacements = replacementsByPak.get(pakFileName) ?? new Map<string, EntryReplacement>()
            replacementsByPak.set(pakFileName, pakReplacements)

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
 * Reads the new content of every file of the BIG file the enabled mods replace (their part for the original edition):
 * their files for every build, then the ones for the install's build, which win.
 * @param modDirs The folders of the enabled mods, in the order they're applied.
 * @param build The build of the install, `null` when it's not a known one (only the files for every build apply).
 * @returns The new content of the files, by key file name, a later mod replacing what an earlier one set.
 */
async function collectBigReplacements(modDirs: string[], build: OriginalBuild | null): Promise<Map<string, Buffer>> {
    const replacements = new Map<string, Buffer>()

    for (const modDir of modDirs) {
        for (const group of await listModBigEntries(modDir)) {
            if (group.build !== null && group.build !== build) continue

            for (const file of group.files) {
                replacements.set(getReplacedEntryName(file), await readFile(path.join(group.dir, file)))
            }
        }
    }

    return replacements
}

/**
 * Reads the original state of every pak the mods change, checking that each one exists and holds the entries the mods
 * replace, so a mod naming a missing pak or entry changes nothing.
 * @param game The install.
 * @param replacementsByPak The new content of the entries, by pak file name.
 * @returns The original state of every pak, by pak file name.
 */
async function readOriginalPaks(
    game: Game,
    replacementsByPak: Map<string, Map<string, EntryReplacement>>,
): Promise<Map<string, OriginalPak>> {
    const originals = new Map<string, OriginalPak>()

    for (const [pakFileName, replacements] of replacementsByPak) {
        const pakPath = getPakPath(game.path, pakFileName)

        if (!(await pathExists(pakPath))) throw new Error(`${MODS_CONSTANTS.messages.missingPak} "${pakFileName}".`)

        const original = await readOriginalPak(pakPath, await readRecord<PatchRecord>(game.path, pakFileName))
        const entryNames = new Set(original.entries.map(getEntryFileName))
        const missingNames = [...replacements.keys()].filter(name => !entryNames.has(name))

        if (missingNames.length) throw new Error(`"${pakFileName}" has no entry named ${missingNames.join(", ")}.`)

        originals.set(pakFileName, original)
    }

    return originals
}

/**
 * Reads the original state of the BIG file, checking that it holds the files the mods replace, so a mod naming a
 * missing key changes nothing.
 * @param game The install.
 * @param bigPath The BIG file.
 * @param replacements The new content of the files, by key file name.
 * @returns The original state of the BIG file.
 */
async function readOriginalBigFile(
    game: Game,
    bigPath: string,
    replacements: Map<string, Buffer>,
): Promise<OriginalBig> {
    const original = await readOriginalBig(bigPath, await readRecord<BigPatchRecord>(game.path, BIG_CONSTANTS.fileName))
    const keyNames = new Set(original.entries.map(entry => getBigKeyFileName(entry.key)))
    const missingNames = [...replacements.keys()].filter(name => !keyNames.has(name))

    if (missingNames.length) {
        throw new Error(`"${BIG_CONSTANTS.fileName}" has no file of key ${missingNames.join(", ")}.`)
    }

    return original
}

/**
 * Patches the paks the enabled mods change, each one starting again from its original.
 * @param game The install, a 20th Anniversary Edition.
 * @param modDirs The folders of the enabled mods, in the order they're applied.
 * @returns The paks patched.
 */
async function patchPaks(game: Game, modDirs: string[]): Promise<ModArchive[]> {
    const replacementsByPak = await collectPakReplacements(modDirs)
    const originals = await readOriginalPaks(game, replacementsByPak)
    const patchedPaks: ModArchive[] = []

    for (const [pakFileName, original] of originals) {
        const replacements = replacementsByPak.get(pakFileName)!

        // Recorded before the pak is touched, so an interrupted patch can still be restored
        await writeRecord(game.path, pakFileName, original.record)
        await writePatch(getPakPath(game.path, pakFileName), original, replacements)

        patchedPaks.push({ name: pakFileName, entryCount: replacements.size })
    }

    return patchedPaks
}

/**
 * Patches the BIG file if the enabled mods change it, starting again from its original.
 * @param game The install, an original edition.
 * @param modDirs The folders of the enabled mods, in the order they're applied.
 * @returns The BIG file, if patched.
 */
async function patchBig(game: Game, modDirs: string[]): Promise<ModArchive[]> {
    const replacements = await collectBigReplacements(modDirs, game.build)
    if (!replacements.size) return []

    const bigPath = await findFileWithoutCase(game.path, BIG_CONSTANTS.fileName)
    if (!bigPath) throw new Error(`${MODS_CONSTANTS.messages.missingBig} "${BIG_CONSTANTS.fileName}".`)

    const original = await readOriginalBigFile(game, bigPath, replacements)

    // Recorded before the BIG file is touched, so an interrupted patch can still be restored
    await writeRecord(game.path, BIG_CONSTANTS.fileName, original.record)
    await writeBigPatch(bigPath, original, replacements)

    return [{ name: BIG_CONSTANTS.fileName, entryCount: replacements.size }]
}

/**
 * Puts an archive of an install the mod loader patched back to its original. An archive gone since (an uninstall) or
 * replaced since (an update) is already an original.
 * @param game The install.
 * @param archiveName The file name of the archive: a pak, or the BIG file.
 */
async function restoreArchive(game: Game, archiveName: string) {
    if (archiveName === BIG_CONSTANTS.fileName) {
        const record = await readRecord<BigPatchRecord>(game.path, archiveName)
        const bigPath = await findFileWithoutCase(game.path, archiveName)

        if (record && bigPath) await restoreBig(bigPath, record)

        return
    }

    const record = await readRecord<PatchRecord>(game.path, archiveName)
    const pakPath = getPakPath(game.path, archiveName)

    if (record && (await pathExists(pakPath))) await restorePak(pakPath, record)
}

/**
 * Puts the archives of an install the mod loader patched back to their originals, unless they're still changed by mods.
 * @param game The install.
 * @param keptArchives The archives the mods still change, left as they are.
 * @returns The archives put back.
 */
async function restoreArchives(game: Game, keptArchives: Set<string>): Promise<string[]> {
    const restoredArchives: string[] = []

    for (const archiveName of await listRecordedArchives(game.path)) {
        if (keptArchives.has(archiveName)) continue

        await restoreArchive(game, archiveName)
        await deleteRecord(game.path, archiveName)
        restoredArchives.push(archiveName)
    }

    return restoredArchives
}

/**
 * Applies the enabled mods to the picked install, their part for its edition: the archives they change are patched
 * (each one starting again from its original), the archives no mod changes anymore are put back.
 * @returns The archives patched and the archives put back.
 */
export async function applyMods(): Promise<ApplyModsResult> {
    const game = await getSelectedGame()
    const config = await configStore.get()
    const modDirs = await getEnabledModDirs(config.enabledMods)

    try {
        const patchedArchives =
            game.edition === "original" ? await patchBig(game, modDirs) : await patchPaks(game, modDirs)
        const keptArchives = new Set(patchedArchives.map(archive => archive.name))

        return { patchedArchives, restoredArchives: await restoreArchives(game, keptArchives) }
    } catch (error) {
        throw explainWriteError(error)
    }
}

/**
 * Puts every archive of the picked install the mod loader patched back to its original (the mods stay installed and
 * enabled, applying them again patches the game again).
 * @returns The archives put back.
 */
export async function restoreGame(): Promise<RestoreGameResult> {
    const game = await getSelectedGame()

    try {
        return { restoredArchives: await restoreArchives(game, new Set()) }
    } catch (error) {
        throw explainWriteError(error)
    }
}
