import DEFAULT_APP_CONFIG from "@main/config/app"
import STORE_CONFIG from "@main/config/store"
import { JsonStore } from "@main/lib/stores/json"
import type { AppConfig } from "@/main/types/store"

/**
 * Merges a possibly partial or outdated on-disk config with the defaults so the
 * rest of the app can rely on every field being present.
 * @param partial The raw parsed config, which may be missing fields.
 * @returns A complete `AppConfig`.
 */
function normalizeConfig(partial: Partial<AppConfig>): AppConfig {
    return {
        version: STORE_CONFIG.configVersion,
        selectedGamePath: partial.selectedGamePath ?? DEFAULT_APP_CONFIG.selectedGamePath,
        manualGamePaths: Array.isArray(partial.manualGamePaths)
            ? partial.manualGamePaths
            : DEFAULT_APP_CONFIG.manualGamePaths,
        enabledMods: Array.isArray(partial.enabledMods) ? partial.enabledMods : DEFAULT_APP_CONFIG.enabledMods,
    }
}

/**
 * The single app-wide config store, holding the picked install, the ones added by hand and the enabled mods.
 */
export const configStore = new JsonStore<AppConfig>({
    fileName: STORE_CONFIG.configFileName,
    defaults: DEFAULT_APP_CONFIG,
    normalize: normalizeConfig,
})
