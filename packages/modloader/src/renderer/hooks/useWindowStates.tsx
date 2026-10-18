import { useEffect, useState } from "react"
import type { WindowState } from "@/preload"

/**
 * Subscribes to the main-process window state (focus, maximized, ...) and
 * returns the latest snapshot, so title bars and window-scoped UI can stay in sync.
 * @returns The current window state, or `undefined` before the first read lands.
 */
export default function useWindowStates() {
    const [states, setStates] = useState<WindowState>()

    // Fetch the initial state on mount and subscribe to subsequent changes so
    // the first render already reflects the actual window focus
    useEffect(() => {
        let canceled = false

        window.api.windows.getState().then(state => {
            if (!canceled) setStates(state)
        })

        const unsubscribe = window.api.windows.onStateChange(setStates)

        return () => {
            canceled = true
            unsubscribe()
        }
    }, [])

    return states
}
