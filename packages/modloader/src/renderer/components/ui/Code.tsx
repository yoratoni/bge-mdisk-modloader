import { cn } from "@cybearl/cypack/frontend"
import type { ComponentProps } from "react"

export default function Code({ className, ...props }: ComponentProps<"code">) {
    return (
        <code
            data-slot="code"
            className={cn(
                "rounded-sm border border-border bg-foreground/8 px-1 py-px font-mono text-[0.9em] text-foreground",
                className,
            )}
            {...props}
        />
    )
}
