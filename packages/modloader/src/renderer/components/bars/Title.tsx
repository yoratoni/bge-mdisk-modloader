import { cn } from "@cybearl/cypack/frontend"
import WINDOWS_CONSTANTS from "@main/lib/constants/windows"
import WindowButton from "@renderer/components/ui/WindowButton"
import useWindowStates from "@renderer/hooks/useWindowStates"
import type { CSSProperties } from "react"
import iconUrl from "../../../../resources/icon.svg"

type TitleBarProps = {
    title: string
}

export default function TitleBar({ title }: TitleBarProps) {
    const states = useWindowStates()

    return (
        <div
            className={cn(
                "z-10 flex shrink-0 items-center justify-between gap-8 select-none bg-card pl-3",
                states?.isFocused ? "text-foreground" : "text-muted-foreground",
            )}
            style={
                {
                    height: WINDOWS_CONSTANTS.titleBarHeight,
                    WebkitAppRegion: "drag",
                } as CSSProperties
            }
            onDoubleClick={() => window.api.windows.toggleMaximize()}
        >
            <div className="flex min-w-0 items-center gap-2">
                <img src={iconUrl} alt="" className="size-4 shrink-0" />
                <span title={title} className="truncate text-sm">
                    {title}
                </span>
            </div>

            <div className="flex h-full" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
                <WindowButton variant="minimize" onClick={() => window.api.windows.minimize()} />
                <WindowButton variant="maximize" onClick={() => window.api.windows.toggleMaximize()} />
                <WindowButton variant="close" onClick={() => window.api.windows.close()} />
            </div>
        </div>
    )
}
