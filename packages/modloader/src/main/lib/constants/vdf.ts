/**
 * All constants related to Valve's KeyValues text format (VDF), the format of Steam's library list and manifests.
 */
const VDF_CONSTANTS = {
    /**
     * The start of a comment, which runs to the end of its line.
     */
    commentMarker: "//",

    /**
     * The characters separating the tokens.
     */
    whitespace: /\s/,

    /**
     * The characters ending an unquoted string (whitespace, a brace or a quote).
     */
    unquotedEnd: /[\s{}"]/,

    /**
     * The escape sequences of quoted strings, by the character after the backslash.
     */
    escapes: {
        n: "\n",
        t: "\t",
        "\\": "\\",
        '"': '"',
    } as Record<string, string>,
} as const

export default VDF_CONSTANTS
