import IPC_CONSTANTS from "@main/lib/constants/ipc"
import { addGame, detectGames, selectGame } from "@main/lib/games/service"
import { safeHandle } from "@main/lib/ipc"
import { BrowserWindow } from "electron"

/**
 * Registers the IPC handlers that find the installs of the game, pick the one the mods go into, and add one by hand.
 */
export function registerGamesHandlers() {
    safeHandle(IPC_CONSTANTS.gamesDetect, () => detectGames())
    safeHandle(IPC_CONSTANTS.gamesSelect, (_event, gamePath: string) => selectGame(gamePath))
    safeHandle(IPC_CONSTANTS.gamesAdd, event => addGame(BrowserWindow.fromWebContents(event.sender)))
}
