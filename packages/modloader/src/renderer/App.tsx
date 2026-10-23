import TitleBar from "@renderer/components/bars/Title"
import GameSelect from "@renderer/components/fields/GameSelect"
import Skeleton from "@renderer/components/ui/Skeleton"
import Mods from "@renderer/components/views/Mods"
import NoGame from "@renderer/components/views/NoGame"
import APP_CONFIG from "@renderer/config/app"
import useGames from "@renderer/hooks/useGames"
import { useEffect, useMemo } from "react"
import { Toaster } from "sonner"

export default function App() {
    const { games, selectedGame, isDetecting, detect, select, add } = useGames()

    /**
     * The main application window title, with the app version.
     */
    const windowTitle = useMemo(() => {
        return `${APP_CONFIG.title} v${window.api.app.version}`
    }, [])

    // Keep the OS window/taskbar caption in sync with the visible title bar
    useEffect(() => {
        document.title = windowTitle
    }, [windowTitle])

    /**
     * The view filling the main area: a placeholder while the first search runs, the way to add an install when none
     * was found, the mods of the picked install otherwise.
     */
    const mainView = useMemo(() => {
        if (!selectedGame) {
            return isDetecting ? <Skeleton className="m-6 h-24" /> : <NoGame onAdd={add} />
        }

        return <Mods game={selectedGame} />
    }, [selectedGame, isDetecting, add])

    return (
        <div className="flex h-full flex-col">
            <TitleBar title={windowTitle} />

            <header className="flex shrink-0 items-center border-b border-border bg-card/60 px-4 py-2">
                <GameSelect
                    games={games}
                    selectedGame={selectedGame}
                    isDetecting={isDetecting}
                    onSelect={select}
                    onAdd={add}
                    onDetect={detect}
                />
            </header>

            <main className="relative w-full flex-1 overflow-hidden">{mainView}</main>

            <footer className="shrink-0 border-t border-border px-4 py-1.5 text-xs text-muted-foreground">
                {APP_CONFIG.disclaimer}
            </footer>

            <Toaster position="bottom-right" />
        </div>
    )
}
