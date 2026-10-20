import IPC_CONSTANTS from "@main/lib/constants/ipc"
import type { MDiskApi, WindowState } from "@preload/index"
import { ipcRenderer } from "electron"

const windowsApiRoutes: MDiskApi["windows"] = {
    getState: () => ipcRenderer.invoke(IPC_CONSTANTS.windowsGetState),
    onStateChange: callback => {
        /**
         * Forwards a broadcast window state to the subscriber.
         * @param _ The Electron event, unused.
         * @param state The window state the main process broadcast.
         */
        const listener = (_: unknown, state: WindowState) => {
            callback(state)
        }
        ipcRenderer.on(IPC_CONSTANTS.windowsStateChanged, listener)
        return () => ipcRenderer.off(IPC_CONSTANTS.windowsStateChanged, listener)
    },
    minimize: () => ipcRenderer.send(IPC_CONSTANTS.windowsMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC_CONSTANTS.windowsMaximizeToggle),
    close: () => ipcRenderer.send(IPC_CONSTANTS.windowsClose),
}

export default windowsApiRoutes
