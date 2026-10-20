import IPC_CONSTANTS from "@main/lib/constants/ipc"
import type { MDiskApi } from "@preload/index"
import { safeInvoke } from "@preload/lib/ipc"
import type { AddModResult, ApplyModsResult, Mod, RestoreGameResult } from "@/main/types/mods"

const modsApiRoutes: MDiskApi["mods"] = {
    list: () => safeInvoke<Mod[]>(IPC_CONSTANTS.modsList),
    add: () => safeInvoke<AddModResult>(IPC_CONSTANTS.modsAdd),
    remove: id => safeInvoke<Mod[]>(IPC_CONSTANTS.modsRemove, id),
    setEnabled: (id, isEnabled) => safeInvoke<Mod[]>(IPC_CONSTANTS.modsSetEnabled, id, isEnabled),
    apply: () => safeInvoke<ApplyModsResult>(IPC_CONSTANTS.modsApply),
    restore: () => safeInvoke<RestoreGameResult>(IPC_CONSTANTS.modsRestore),
}

export default modsApiRoutes
