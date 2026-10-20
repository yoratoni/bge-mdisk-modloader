import type { GameEdition } from "@/main/types/games"

/**
 * All constants related to the mods: their format, where they're kept and how they're applied.
 */
const MODS_CONSTANTS = {
    /**
     * The folder holding the installed mods, in the app's data folder, one folder per mod.
     */
    modsDirName: "mods",

    /**
     * The folder holding the records of the patched paks, in the app's data folder, one folder per install.
     */
    patchesDirName: "patches",

    /**
     * The extension of the records of the patched paks, one per pak.
     */
    recordExtension: ".json",

    /**
     * The hash naming the records folder of an install, from its folder.
     */
    gameIdHashAlgorithm: "sha1",

    /**
     * The number of hex digits of the hash kept in the name of the records folder of an install.
     */
    gameIdLength: 16,

    /**
     * The description of a mod, at the root of its folder.
     */
    manifestFileName: "mod.json",

    /**
     * The editions a mod can be made for, its "edition" field.
     */
    editions: ["anniversary", "original"] as GameEdition[],

    /**
     * The folder of a mod holding its entries, one folder per pak (e.g. "paks/Resources/09001331"), each file being the
     * new content of an entry (as the unpacked layer 2 names and holds it).
     */
    paksDirName: "paks",

    /**
     * Appended to the file name of an entry to name the file holding its new extra bytes.
     */
    extraSuffix: ".extra",

    /**
     * A file of a mod named after a key, as the unpacked layers name them (8 hex digits), compared without case.
     */
    keyFileNamePattern: /^[0-9a-f]{8}$/i,

    /**
     * The folder of the paks, relative to the install folder.
     */
    gamePaksDir: ["Data", "Paks"],

    /**
     * The extension of the paks.
     */
    pakExtension: ".pak",

    /**
     * The title of the folder picker, when a mod is added.
     */
    addDialogTitle: "Pick the folder of a mod",

    /**
     * The error codes of a pak opened by another process, the game most likely.
     */
    busyErrorCodes: ["EBUSY", "EPERM", "EACCES"],

    /**
     * The errors surfaced to the user.
     */
    messages: {
        noGame: "No install of the game is picked.",
        unsupportedEdition: "Mods can only be applied to the 20th Anniversary Edition for now.",
        missingPak: "The game has no pak named",
        gameRunning: "A pak of the game is in use, close the game before applying the mods.",
    },
} as const

export default MODS_CONSTANTS
