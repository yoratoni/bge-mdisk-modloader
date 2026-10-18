import CONSTANTS from "@main/lib/constants"
import { app, ipcMain } from "electron"

/**
 * Registers the synchronous IPC handler returning the application version, baked in at
 * build time by electron-builder or read from `package.json` in dev.
 */
export function registerAppHandlers() {
    ipcMain.on(CONSTANTS.ipc.appGetVersion, event => {
        event.returnValue = app.getVersion()
    })
}
