import { cn } from "@cybearl/cypack/frontend"
import * as SeparatorPrimitive from "@radix-ui/react-separator"
import { type ComponentPropsWithoutRef, type ComponentRef, forwardRef } from "react"

export const Separator = forwardRef<
    ComponentRef<typeof SeparatorPrimitive.Root>,
    ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
    <SeparatorPrimitive.Root
        ref={ref}
        decorative={decorative}
        orientation={orientation}
        className={cn("shrink-0 bg-accent", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
        {...props}
    />
))

Separator.displayName = SeparatorPrimitive.Root.displayName
