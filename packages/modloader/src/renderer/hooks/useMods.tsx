import ArchiveList from "@renderer/components/texts/ArchiveList"
import toast from "@renderer/components/ui/Toast"
import MODS_UI_CONSTANTS from "@renderer/lib/constants/mods"
import { convertErrorToMessage } from "@renderer/lib/utils/errors"
import { useCallback, useEffect, useState } from "react"
import type { Mod } from "@/main/types/mods"

/**
 * Lists the installed mods on mount, and exposes the actions installing, switching and removing them, applying them
 * to the picked install and putting it back to its original.
 * @returns The mods, whether the first listing runs, and the actions.
 */
export default function useMods() {
    const [mods, setMods] = useState<Mod[]>([])
    const [isLoading, setIsLoading] = useState(true)

    /**
     * Lists the installed mods again.
     */
    const refresh = useCallback(async () => {
        try {
            setMods(await window.api.mods.list())
        } catch (error) {
            toast.error(MODS_UI_CONSTANTS.messages.listFailed, convertErrorToMessage(error))
        } finally {
            setIsLoading(false)
        }
    }, [])

    /**
     * Installs a mod from a folder the user picks.
     */
    const add = useCallback(async () => {
        try {
            const result = await window.api.mods.add()

            if (result.ok) setMods(result.mods)
            else if (result.reason === "invalid") toast.error(MODS_UI_CONSTANTS.messages.invalidMod, result.details)
            else if (result.reason === "already-installed") {
                toast.error(
                    MODS_UI_CONSTANTS.messages.alreadyInstalled,
                    MODS_UI_CONSTANTS.messages.alreadyInstalledDetails,
                )
            }
        } catch (error) {
            toast.error(MODS_UI_CONSTANTS.messages.addFailed, convertErrorToMessage(error))
        }
    }, [])

    /**
     * Uninstalls a mod.
     * @param id The name of the mod.
     */
    const remove = useCallback(async (id: string) => {
        try {
            setMods(await window.api.mods.remove(id))
        } catch (error) {
            toast.error(MODS_UI_CONSTANTS.messages.removeFailed, convertErrorToMessage(error))
        }
    }, [])

    /**
     * Enables or disables a mod.
     * @param id The name of the mod.
     * @param isEnabled Whether the mod is enabled.
     */
    const setEnabled = useCallback(async (id: string, isEnabled: boolean) => {
        try {
            setMods(await window.api.mods.setEnabled(id, isEnabled))
        } catch (error) {
            toast.error(MODS_UI_CONSTANTS.messages.toggleFailed, convertErrorToMessage(error))
        }
    }, [])

    /**
     * Applies the enabled mods to the picked install.
     */
    const apply = useCallback(async () => {
        try {
            const result = await window.api.mods.apply()

            if (!result.patchedArchives.length && !result.restoredArchives.length) {
                toast.info(MODS_UI_CONSTANTS.messages.nothingToApply)
                return
            }

            toast.success(
                MODS_UI_CONSTANTS.messages.applied,
                <>
                    {result.patchedArchives.length > 0 && (
                        <span>
                            Replaced <ArchiveList archives={result.patchedArchives} />.{" "}
                        </span>
                    )}
                    {result.restoredArchives.length > 0 && (
                        <span>
                            Put back <ArchiveList archives={result.restoredArchives} />.
                        </span>
                    )}
                </>,
            )
        } catch (error) {
            toast.error(MODS_UI_CONSTANTS.messages.applyFailed, convertErrorToMessage(error))
        }
    }, [])

    /**
     * Puts the picked install back to its original.
     */
    const restore = useCallback(async () => {
        try {
            const result = await window.api.mods.restore()

            if (result.restoredArchives.length) {
                toast.success(
                    MODS_UI_CONSTANTS.messages.restored,
                    <>
                        Put back <ArchiveList archives={result.restoredArchives} />.
                    </>,
                )
            } else {
                toast.info(MODS_UI_CONSTANTS.messages.nothingToRestore)
            }
        } catch (error) {
            toast.error(MODS_UI_CONSTANTS.messages.restoreFailed, convertErrorToMessage(error))
        }
    }, [])

    // List the mods once, when the window opens
    useEffect(() => {
        refresh()
    }, [refresh])

    return {
        mods,
        isLoading,
        add,
        remove,
        setEnabled,
        apply,
        restore,
    }
}
