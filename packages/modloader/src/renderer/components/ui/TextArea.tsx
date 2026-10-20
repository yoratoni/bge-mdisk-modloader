import { cn } from "@cybearl/cypack/frontend"
import type { ComponentProps } from "react"

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
    return (
        <textarea
            data-slot="textarea"
            className={cn(
                "border-input focus-visible:border-foreground aria-invalid:border-destructive disabled:bg-input/50 border",
                "bg-transparent px-2.5 py-2 text-base transition-colors md:text-sm flex field-sizing-content min-h-16 w-full",
                "outline-none placeholder:text-muted-foreground disabled:cursor-default disabled:opacity-50",
                className,
            )}
            {...props}
        />
    )
}
