import { cn } from "@cybearl/cypack/frontend"
import CONSTANTS from "@main/lib/constants"
import WindowButton from "@renderer/components/ui/WindowButton"
import useWindowStates from "@renderer/hooks/useWindowStates"
import type { CSSProperties } from "react"

type TitleBarProps = {
    title: string
}

export default function TitleBar({ title }: TitleBarProps) {
    const states = useWindowStates()

    return (
        <div
            className={cn(
                "z-10 flex shrink-0 items-center justify-between gap-8 select-none bg-title-bar pl-3",
                states?.isFocused ? "text-foreground" : "text-foreground-muted",
            )}
            style={
                {
                    height: CONSTANTS.titleBarHeight,
                    WebkitAppRegion: "drag",
                } as CSSProperties
            }
            onDoubleClick={() => window.api.windows.toggleMaximize()}
        >
            <span title={title} className="truncate text-sm">
                {title}
            </span>

            <div className="flex h-full" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
                <WindowButton variant="minimize" onClick={() => window.api.windows.minimize()} />
                <WindowButton variant="maximize" onClick={() => window.api.windows.toggleMaximize()} />
                <WindowButton variant="close" onClick={() => window.api.windows.close()} />
            </div>
        </div>
    )
}
