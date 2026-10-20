/**
 * The full shape of the persisted application configuration file.
 */
export type AppConfig = {
    /**
     * The version of the file's layout, to migrate older files.
     */
    version: number

    /**
     * The install the mods go into, `null` until one is picked (or found, the first one is picked then).
     */
    selectedGamePath: string | null

    /**
     * The installs added by hand, the ones no launcher knows about.
     */
    manualGamePaths: string[]

    /**
     * The enabled mods by folder name, in the order they're applied (a later mod wins over an earlier one replacing
     * the same entry).
     */
    enabledMods: string[]
}
