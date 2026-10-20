/**
 * All the IPC channels between the main process and the renderer, by feature.
 */
const IPC_CONSTANTS = {
    // App
    appGetVersion: "app:get-version",
    // Windows
    windowsGetState: "windows:get-state",
    windowsStateChanged: "windows:state-changed",
    windowsMinimize: "windows:minimize",
    windowsMaximizeToggle: "windows:maximize-toggle",
    windowsClose: "windows:close",
    // Games
    gamesDetect: "games:detect",
    gamesSelect: "games:select",
    gamesAdd: "games:add",
    // Mods
    modsList: "mods:list",
    modsAdd: "mods:add",
    modsRemove: "mods:remove",
    modsSetEnabled: "mods:set-enabled",
    modsApply: "mods:apply",
    modsRestore: "mods:restore",
} as const

export default IPC_CONSTANTS
