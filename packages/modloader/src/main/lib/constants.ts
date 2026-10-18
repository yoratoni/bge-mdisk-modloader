/**
 * The constants for the main process.
 */
const CONSTANTS = {
    titleBarHeight: 32,
    ipc: {
        // App
        appGetVersion: "app:get-version",
        // Windows
        windowsGetState: "windows:get-state",
        windowsStateChanged: "windows:state-changed",
        windowsMinimize: "windows:minimize",
        windowsMaximizeToggle: "windows:maximize-toggle",
        windowsClose: "windows:close",
    },
} as const

export default CONSTANTS
