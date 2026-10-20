import { cn } from "@cybearl/cypack/frontend"
import type { ComponentProps } from "react"

export default function Skeleton({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="skeleton"
            aria-hidden="true"
            className={cn(
                "relative overflow-hidden rounded-sm bg-foreground/8 h-4",
                "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
                "after:bg-linear-to-r after:from-transparent after:via-foreground/10 after:to-transparent",
                "motion-reduce:after:hidden",
                className,
            )}
            {...props}
        />
    )
}
