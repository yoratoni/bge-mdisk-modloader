import appApiRoutes from "@preload/routes/app"
import windowsApiRoutes from "@preload/routes/windows"
import { contextBridge } from "electron"

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
    windows: windowsApiRoutes,
} as const

// Exposes the API surface to the renderer process
contextBridge.exposeInMainWorld("api", api)
