import os from "node:os"
import path from "node:path"
import type { GameEdition, GameSource } from "@/main/types/games"

/**
 * All constants related to finding the installs of the game and telling their editions apart.
 */
const GAMES_CONSTANTS = {
    /**
     * The Steam app of every edition.
     */
    steamAppIds: {
        anniversary: "2556990",
        original: "15130",
    } as Record<GameEdition, string>,

    /**
     * The Steam installs tried when the registry doesn't name one, per platform (Linux: native, then Flatpak).
     */
    steamRoots: {
        win32: ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"],
        linux: [
            path.join(os.homedir(), ".steam", "steam"),
            path.join(os.homedir(), ".local", "share", "Steam"),
            path.join(os.homedir(), ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
        ],
    } as Record<string, string[]>,

    /**
     * The registry values naming the Steam install on Windows, the user's first.
     */
    steamRegistryValues: [
        { key: "HKCU\\Software\\Valve\\Steam", value: "SteamPath" },
        { key: "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", value: "InstallPath" },
    ],

    /**
     * The folder of a Steam library holding its apps, their manifests and the list of libraries.
     */
    steamAppsDirName: "steamapps",

    /**
     * The folder of the apps folder the games are installed in, one folder per game.
     */
    steamCommonDirName: "common",

    /**
     * The list of libraries, in the apps folder of the Steam install.
     */
    steamLibraryFoldersFileName: "libraryfolders.vdf",

    /**
     * The start of the name of an app manifest ("appmanifest_<app>.acf"), in the apps folder of its library.
     */
    steamManifestPrefix: "appmanifest_",

    /**
     * The extension of an app manifest.
     */
    steamManifestExtension: ".acf",

    /**
     * The keys read in Steam's VDF files, the library list and the app manifests.
     */
    steamVdfKeys: {
        libraryFolders: "libraryfolders",
        path: "path",
        appState: "AppState",
        installDir: "installdir",
        stateFlags: "StateFlags",
    },

    /**
     * The flag of a Steam app manifest's "StateFlags" set once the app is fully installed.
     */
    steamFullyInstalledFlag: 4,

    /**
     * The uninstall entries of the installers (GOG, Ubisoft Connect, the retail discs), searched for the game's name.
     */
    uninstallRegistryKeys: [
        "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    ],

    /**
     * The term the uninstall entries of the game hold, in their display name.
     */
    uninstallSearchTerm: "Beyond Good",

    /**
     * The uninstall entries Steam registers, they hold no folder (the libraries name them instead).
     */
    steamUninstallKeyPattern: /\\Steam App \d+$/i,

    /**
     * The values read in the uninstall entries.
     */
    uninstallValueNames: {
        installLocation: "InstallLocation",
        publisher: "Publisher",
    },

    /**
     * The store of an uninstall entry, from a term its publisher contains (without case).
     */
    publisherSources: [
        { term: "gog", source: "gog" },
        { term: "ubisoft", source: "ubisoft" },
    ] as { term: string; source: GameSource }[],

    /**
     * The store of an uninstall entry whose publisher matches none (the discs, and anything else).
     */
    defaultInstallerSource: "retail" as GameSource,

    /**
     * The files telling an install's edition apart, compared without case (Proton keeps the original case on Linux):
     * both editions ship a "BGE.exe", the remaster has its paks, the original its BIG file.
     */
    markers: {
        executable: "bge.exe",
        anniversaryDataDir: "data",
        anniversaryPaksDir: "paks",
        originalBigFile: "sally_clean.bf",
    },

    /**
     * The title of the folder picker, when an install is added by hand.
     */
    addDialogTitle: "Pick the folder of Beyond Good & Evil",

    /**
     * The error when an install picked in the list isn't there anymore.
     */
    missingGameMessage: "This install of the game isn't there anymore, it may have been moved or uninstalled.",
} as const

export default GAMES_CONSTANTS
