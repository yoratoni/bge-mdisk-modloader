import IPC_CONSTANTS from "@main/lib/constants/ipc"
import type { MDiskApi } from "@preload/index"
import { safeInvoke } from "@preload/lib/ipc"
import type { AddGameResult, GamesState } from "@/main/types/games"

const gamesApiRoutes: MDiskApi["games"] = {
    detect: () => safeInvoke<GamesState>(IPC_CONSTANTS.gamesDetect),
    select: gamePath => safeInvoke<GamesState>(IPC_CONSTANTS.gamesSelect, gamePath),
    add: () => safeInvoke<AddGameResult>(IPC_CONSTANTS.gamesAdd),
}

export default gamesApiRoutes
