import { cn } from "@cybearl/cypack/frontend"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"
import type { ComponentProps } from "react"

export function DropdownMenu({ ...props }: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
    return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

export function DropdownMenuTrigger({ ...props }: ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
    return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

export function DropdownMenuContent({
    className,
    align = "end",
    sideOffset = 4,
    ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
    return (
        <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content
                data-slot="dropdown-menu-content"
                align={align}
                sideOffset={sideOffset}
                className={cn(
                    "bg-popover text-foreground border border-border shadow-md p-1 min-w-60 z-50",
                    "overflow-x-hidden overflow-y-auto max-h-(--radix-dropdown-menu-content-available-height)",
                    "origin-(--radix-dropdown-menu-content-transform-origin) duration-100",
                    "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
                    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
                    "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
                    className,
                )}
                {...props}
            />
        </DropdownMenuPrimitive.Portal>
    )
}

export function DropdownMenuItem({
    className,
    variant = "default",
    ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & {
    variant?: "default" | "destructive"
}) {
    return (
        <DropdownMenuPrimitive.Item
            data-slot="dropdown-menu-item"
            data-variant={variant}
            className={cn(
                "relative flex items-center gap-2.5 px-2.5 py-2 text-sm text-foreground",
                "cursor-default outline-hidden select-none focus:bg-foreground/10",
                "data-disabled:pointer-events-none data-disabled:opacity-50",
                "data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10",
                "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            {...props}
        />
    )
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
    return (
        <DropdownMenuPrimitive.Separator
            data-slot="dropdown-menu-separator"
            className={cn("bg-border -mx-1 my-1 h-px pointer-events-none", className)}
            {...props}
        />
    )
}
