import IPC_CONSTANTS from "@main/lib/constants/ipc"
import type { MDiskApi } from "@preload/index"
import { ipcRenderer } from "electron"

const appApiRoutes: MDiskApi["app"] = {
    version: ipcRenderer.sendSync(IPC_CONSTANTS.appGetVersion) as string,
}

export default appApiRoutes
