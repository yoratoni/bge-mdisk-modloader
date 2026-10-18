import path from "node:path"
import type { BrowserWindowConstructorOptions, WebPreferences } from "electron"

/**
 * The shared web preferences applied to every renderer window.
 */
const WEB_PREFERENCES: WebPreferences = {
    preload: path.join(__dirname, "..", "preload", "index.js"),
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false,
}

/**
 * The default `BrowserWindow` options for every window kind the app opens,
 * keyed by role.
 */
const WINDOWS_CONFIG: {
    main: BrowserWindowConstructorOptions
} = {
    main: {
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        show: false,
        frame: false,
        thickFrame: true,
        useContentSize: true,
        autoHideMenuBar: true,
        acceptFirstMouse: true,
        webPreferences: WEB_PREFERENCES,
    },
}

export default WINDOWS_CONFIG
