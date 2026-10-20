import { cn } from "@cybearl/cypack/frontend"
import { OverlayScrollbarsComponent } from "overlayscrollbars-react"
import type { ReactNode } from "react"

type ScrollbarProps = {
    className?: string
    children?: ReactNode
    showBar?: boolean
}

export default function Scrollbar({ className, children, showBar = false }: ScrollbarProps) {
    return (
        <OverlayScrollbarsComponent
            className={cn(
                "w-full h-full overflow-auto",
                !showBar && "[&::-webkit-scrollbar]:hidden [scrollbar-width:none]",

                className,
            )}
            defer
            options={{
                scrollbars: {
                    theme: "scrollbar-main",
                    autoHide: "never",
                    clickScroll: true,
                },
            }}
            onDragStart={e => e.preventDefault()}
        >
            {children ?? <div className="w-full h-full" />}
        </OverlayScrollbarsComponent>
    )
}
