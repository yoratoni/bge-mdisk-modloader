import appApiRoutes from "@preload/routes/app"
import gamesApiRoutes from "@preload/routes/games"
import modsApiRoutes from "@preload/routes/mods"
import windowsApiRoutes from "@preload/routes/windows"
import { contextBridge } from "electron"
import type { AddGameResult, GamesState } from "@/main/types/games"
import type { AddModResult, ApplyModsResult, Mod, RestoreGameResult } from "@/main/types/mods"

/**
 * A snapshot of the current state of the application window.
 */
export type WindowState = {
    isFocused: boolean
    isVisible: boolean
    isMinimized: boolean
    isMaximized: boolean
    isFullScreen: boolean
}

/**
 * The type for the API surface exposed to the renderer process via `window.api`.
 */
export type MDiskApi = {
    platform: {
        value: NodeJS.Platform
        isWindows: boolean
        isLinux: boolean
    }
    app: {
        version: string
    }
    games: {
        detect: () => Promise<GamesState>
        select: (gamePath: string) => Promise<GamesState>
        add: () => Promise<AddGameResult>
    }
    mods: {
        list: () => Promise<Mod[]>
        add: () => Promise<AddModResult>
        remove: (id: string) => Promise<Mod[]>
        setEnabled: (id: string, isEnabled: boolean) => Promise<Mod[]>
        apply: () => Promise<ApplyModsResult>
        restore: () => Promise<RestoreGameResult>
    }
    windows: {
        getState: () => Promise<WindowState>
        onStateChange: (callback: (state: WindowState) => void) => () => void
        minimize: () => void
        toggleMaximize: () => void
        close: () => void
    }
}

/**
 * The API surface exposed to the renderer process via `window.api`.
 */
const api: MDiskApi = {
    platform: {
        value: process.platform,
        isWindows: process.platform === "win32",
        isLinux: process.platform === "linux",
    },
    app: appApiRoutes,
    games: gamesApiRoutes,
    mods: modsApiRoutes,
    windows: windowsApiRoutes,
} as const

// Exposes the API surface to the renderer process
contextBridge.exposeInMainWorld("api", api)
