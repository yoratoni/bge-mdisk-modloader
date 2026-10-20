import { cn } from "@cybearl/cypack/frontend"
import UI_CONSTANTS from "@renderer/lib/constants/ui"

type WindowButtonProps = {
    variant: keyof typeof UI_CONSTANTS.windowGlyphPaths
    onClick: () => void
}

export default function WindowButton({ variant, onClick }: WindowButtonProps) {
    return (
        <button
            aria-label={variant}
            onClick={onClick}
            className={cn(
                "flex h-full w-12 items-center justify-center",
                variant === "close"
                    ? "hover:bg-destructive hover:text-destructive-foreground"
                    : "hover:bg-foreground/10",
            )}
        >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true">
                <path d={UI_CONSTANTS.windowGlyphPaths[variant]} />
            </svg>
        </button>
    )
}
