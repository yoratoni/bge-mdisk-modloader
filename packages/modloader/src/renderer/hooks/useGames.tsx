import toast from "@renderer/components/ui/Toast"
import GAMES_UI_CONSTANTS from "@renderer/lib/constants/games"
import { convertErrorToMessage } from "@renderer/lib/utils/errors"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { GamesState } from "@/main/types/games"

/**
 * Looks for the installs of the game on mount, and exposes the one the mods go into along with the actions changing it.
 * @returns The installs, the picked one, whether the search is running, and the actions to search again, pick an
 * install or add one by hand.
 */
export default function useGames() {
    const [state, setState] = useState<GamesState | null>(null)
    const [isDetecting, setIsDetecting] = useState(true)

    /**
     * Looks for the installs again.
     */
    const detect = useCallback(async () => {
        setIsDetecting(true)

        try {
            setState(await window.api.games.detect())
        } catch (error) {
            toast.error(GAMES_UI_CONSTANTS.messages.detectFailed, convertErrorToMessage(error))
        } finally {
            setIsDetecting(false)
        }
    }, [])

    /**
     * Picks the install the mods go into.
     * @param gamePath The install folder.
     */
    const select = useCallback(async (gamePath: string) => {
        try {
            setState(await window.api.games.select(gamePath))
        } catch (error) {
            toast.error(GAMES_UI_CONSTANTS.messages.selectFailed, convertErrorToMessage(error))
        }
    }, [])

    /**
     * Adds an install from a folder the user picks.
     */
    const add = useCallback(async () => {
        try {
            const result = await window.api.games.add()

            if (result.ok) setState(result.state)
            else if (result.reason === "not-a-game") {
                toast.error(GAMES_UI_CONSTANTS.messages.notAGame, GAMES_UI_CONSTANTS.messages.notAGameDetails)
            }
        } catch (error) {
            toast.error(GAMES_UI_CONSTANTS.messages.addFailed, convertErrorToMessage(error))
        }
    }, [])

    // Look for the installs once, when the window opens
    useEffect(() => {
        detect()
    }, [detect])

    /**
     * The install the mods go into, `null` when there is none.
     */
    const selectedGame = useMemo(() => state?.games.find(game => game.path === state.selectedPath) ?? null, [state])

    return {
        games: state?.games ?? [],
        selectedGame,
        isDetecting,
        detect,
        select,
        add,
    }
}
