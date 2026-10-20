/**
 * All constants related to showing the mods.
 */
const MODS_UI_CONSTANTS = {
    /**
     * The messages shown when managing or applying the mods.
     */
    messages: {
        listFailed: "The mods couldn't be listed",
        addFailed: "This mod couldn't be added",
        invalidMod: "This folder isn't a mod",
        alreadyInstalled: "A mod with this folder name is already installed",
        alreadyInstalledDetails: "Remove it first, or rename the folder of the new one.",
        removeFailed: "This mod couldn't be removed",
        toggleFailed: "This mod couldn't be switched",
        applyFailed: "The mods couldn't be applied",
        applied: "Mods applied",
        nothingToApply: "Nothing to apply, the game is already its original",
        restoreFailed: "The game couldn't be restored",
        restored: "The game is back to its original",
        nothingToRestore: "The game is already its original",
    },
} as const

export default MODS_UI_CONSTANTS
