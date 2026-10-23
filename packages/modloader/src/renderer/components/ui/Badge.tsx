import { cn } from "@cybearl/cypack/frontend"
import type { ComponentProps } from "react"

export default function Badge({ className, ...props }: ComponentProps<"span">) {
    return (
        <span
            data-slot="badge"
            className={cn(
                "inline-flex items-center border border-border px-1.5 py-0.5 text-xs whitespace-nowrap",
                className,
            )}
            {...props}
        />
    )
}
