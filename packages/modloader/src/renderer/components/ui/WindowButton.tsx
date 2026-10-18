import { cn } from "@cybearl/cypack/frontend"

/**
 * The SVG path of each title bar control glyph, drawn on a 10x10 grid.
 */
const GLYPH_PATHS = {
    minimize: "M0 5h10",
    maximize: "M0.5 0.5h9v9h-9z",
    close: "M0 0l10 10M10 0l-10 10",
} as const

type WindowButtonProps = {
    variant: keyof typeof GLYPH_PATHS
    onClick: () => void
}

export default function WindowButton({ variant, onClick }: WindowButtonProps) {
    return (
        <button
            aria-label={variant}
            onClick={onClick}
            className={cn(
                "flex h-full w-12 items-center justify-center",
                variant === "close" ? "hover:bg-control-close-hover" : "hover:bg-control-hover",
            )}
        >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true">
                <path d={GLYPH_PATHS[variant]} />
            </svg>
        </button>
    )
}
