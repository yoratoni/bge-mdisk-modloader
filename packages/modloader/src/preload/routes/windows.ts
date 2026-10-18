import CONSTANTS from "@main/lib/constants"
import type { MDiskApi, WindowState } from "@preload/index"
import { ipcRenderer } from "electron"

const windowsApiRoutes: MDiskApi["windows"] = {
    getState: () => ipcRenderer.invoke(CONSTANTS.ipc.windowsGetState),
    onStateChange: callback => {
        /**
         * Forwards a broadcast window state to the subscriber.
         * @param _ The Electron event, unused.
         * @param state The window state the main process broadcast.
         */
        const listener = (_: unknown, state: WindowState) => {
            callback(state)
        }
        ipcRenderer.on(CONSTANTS.ipc.windowsStateChanged, listener)
        return () => ipcRenderer.off(CONSTANTS.ipc.windowsStateChanged, listener)
    },
    minimize: () => ipcRenderer.send(CONSTANTS.ipc.windowsMinimize),
    toggleMaximize: () => ipcRenderer.send(CONSTANTS.ipc.windowsMaximizeToggle),
    close: () => ipcRenderer.send(CONSTANTS.ipc.windowsClose),
}

export default windowsApiRoutes
