import path from "node:path"
import WINDOWS_CONFIG from "@main/config/windows"
import { registerAppHandlers } from "@main/lib/app/handlers"
import { attachWindowStateBroadcaster, registerWindowsControlHandlers } from "@main/lib/windows"
import { app, BrowserWindow, shell } from "electron"

/**
 * Creates the application's main `BrowserWindow` and loads either the Vite dev server URL
 * (in development) or the bundled renderer HTML file (in production).
 * @returns The created BrowserWindow instance.
 */
function createMainWindow(): BrowserWindow {
    const window = new BrowserWindow(WINDOWS_CONFIG.main)

    // Show the window when it's ready
    window.on("ready-to-show", () => window.show())

    // Broadcast focus/visibility/maximize/fullscreen state changes to the renderer
    attachWindowStateBroadcaster(window)

    // Open external links in the user's default browser
    window.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: "deny" }
    })

    // Load the appropriate URL or file into the window
    if (process.env.ELECTRON_RENDERER_URL) {
        window.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        window.loadFile(path.join(__dirname, "..", "renderer", "index.html"))
    }

    return window
}

// Create the main application window when Electron is ready
app.whenReady().then(() => {
    // Handlers, the app shell itself
    registerAppHandlers()
    registerWindowsControlHandlers()

    // Create the main window
    createMainWindow()
})

// Quit the application when all windows are closed
app.on("window-all-closed", () => app.quit())
