import IPC_CONSTANTS from "@main/lib/constants/ipc"
import { safeHandle } from "@main/lib/ipc"
import { addMod, applyMods, listMods, removeMod, restoreGame, setModEnabled } from "@main/lib/mods/service"
import { BrowserWindow } from "electron"

/**
 * Registers the IPC handlers that install, enable and remove the mods, apply them to the picked install, and put the
 * install back to its original.
 */
export function registerModsHandlers() {
    safeHandle(IPC_CONSTANTS.modsList, () => listMods())
    safeHandle(IPC_CONSTANTS.modsAdd, event => addMod(BrowserWindow.fromWebContents(event.sender)))
    safeHandle(IPC_CONSTANTS.modsRemove, (_event, id: string) => removeMod(id))
    safeHandle(IPC_CONSTANTS.modsSetEnabled, (_event, id: string, isEnabled: boolean) => setModEnabled(id, isEnabled))
    safeHandle(IPC_CONSTANTS.modsApply, () => applyMods())
    safeHandle(IPC_CONSTANTS.modsRestore, () => restoreGame())
}
