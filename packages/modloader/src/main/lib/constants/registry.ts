/**
 * All constants related to reading the Windows registry through "reg.exe".
 */
const REGISTRY_CONSTANTS = {
    /**
     * The executable querying the registry, shipped with Windows.
     */
    executable: "reg.exe",

    /**
     * The subcommand reading keys and values.
     */
    queryCommand: "query",

    /**
     * The flags of the query: one value by name, every subkey, a search term, searched in the data of the values.
     */
    queryFlags: {
        value: "/v",
        subkeys: "/s",
        find: "/f",
        data: "/d",
    },

    /**
     * The start of a line of `reg query` naming a key, the values of the key following it.
     */
    keyLinePrefix: "HKEY_",

    /**
     * A line of `reg query` naming a value: four spaces, the name, its type, then the data.
     */
    valueLine: /^ {4}(.+?) {4}(REG_\w+) {4}(.*)$/,

    /**
     * The line breaks of the output of `reg query`.
     */
    lineBreak: /\r?\n/,
} as const

export default REGISTRY_CONSTANTS
