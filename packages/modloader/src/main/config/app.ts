import STORE_CONFIG from "@main/config/store"
import type { AppConfig } from "@/main/types/store"

/**
 * The default configuration used when no config file exists yet,
 * or when the existing one is missing fields.
 */
const DEFAULT_APP_CONFIG: AppConfig = {
    version: STORE_CONFIG.configVersion,
    selectedGamePath: null,
    manualGamePaths: [],
    enabledMods: [],
}

export default DEFAULT_APP_CONFIG
