import { cn } from "@cybearl/cypack/frontend"
import { type ComponentProps, forwardRef } from "react"

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(({ className, type, ...props }, ref) => {
    return (
        <input
            type={type}
            className={cn(
                "flex h-8 w-full border border-border focus:border-border-active bg-background px-3 py-2 text-base",
                "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
                "placeholder:text-foreground/50 focus-visible:outline-none disabled:default disabled:opacity-50 md:text-sm",
                className,
            )}
            ref={ref}
            {...props}
        />
    )
})

Input.displayName = "Input"
