import type { MDiskApi } from "@preload/index"

declare global {
    /**
     * Augments `window` with the `api` surface exposed by the preload script.
     */
    interface Window {
        api: MDiskApi
    }
}
