import CONSTANTS from "@main/lib/constants"
import type { MDiskApi } from "@preload/index"
import { ipcRenderer } from "electron"

const appApiRoutes: MDiskApi["app"] = {
    version: ipcRenderer.sendSync(CONSTANTS.ipc.appGetVersion) as string,
}

export default appApiRoutes
