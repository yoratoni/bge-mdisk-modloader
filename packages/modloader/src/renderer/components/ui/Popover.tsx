import { cn } from "@cybearl/cypack/frontend"
import { Popover as PopoverPrimitive } from "radix-ui"
import type { ComponentProps } from "react"

export function Popover({ ...props }: ComponentProps<typeof PopoverPrimitive.Root>) {
    return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

export function PopoverTrigger({ ...props }: ComponentProps<typeof PopoverPrimitive.Trigger>) {
    return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

export function PopoverContent({
    className,
    align = "start",
    sideOffset = 4,
    ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
                data-slot="popover-content"
                align={align}
                sideOffset={sideOffset}
                className={cn(
                    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                    "data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                    "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
                    "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-sm max-w-sm border",
                    "bg-popover px-3 py-2 text-xs text-popover-foreground outline-none",
                    className,
                )}
                {...props}
            />
        </PopoverPrimitive.Portal>
    )
}
