import TitleBar from "@renderer/components/bars/Title"
import APP_CONFIG from "@renderer/config/app"
import { useEffect } from "react"

/**
 * The main application window title, with the app version.
 */
const WINDOW_TITLE = `${APP_CONFIG.title} v${window.api.app.version}`

export default function App() {
    // Keep the OS window/taskbar caption in sync with the visible title bar
    useEffect(() => {
        document.title = WINDOW_TITLE
    }, [])

    return (
        <div className="flex h-full flex-col">
            <TitleBar title={WINDOW_TITLE} />

            <main className="relative w-full flex-1 overflow-hidden" />
        </div>
    )
}
