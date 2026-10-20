/**
 * All constants related to the user interface.
 */
const UI_CONSTANTS = {
    /**
     * The SVG path of each title bar control glyph, drawn on a 10x10 grid.
     */
    windowGlyphPaths: {
        minimize: "M0 5h10",
        maximize: "M0.5 0.5h9v9h-9z",
        close: "M0 0l10 10M10 0l-10 10",
    },
} as const

export default UI_CONSTANTS
