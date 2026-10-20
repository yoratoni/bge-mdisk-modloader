import { cn } from "@cybearl/cypack/frontend"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Select as SelectPrimitive } from "radix-ui"
import type { ComponentProps } from "react"

export function Select({ ...props }: ComponentProps<typeof SelectPrimitive.Root>) {
    return <SelectPrimitive.Root data-slot="select" {...props} />
}

export function SelectGroup({ className, ...props }: ComponentProps<typeof SelectPrimitive.Group>) {
    return <SelectPrimitive.Group data-slot="select-group" className={cn("scroll-my-1 p-1", className)} {...props} />
}

export function SelectValue({ ...props }: ComponentProps<typeof SelectPrimitive.Value>) {
    return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

export function SelectTrigger({
    className,
    size = "default",
    children,
    ...props
}: ComponentProps<typeof SelectPrimitive.Trigger> & {
    size?: "xs" | "sm" | "default"
}) {
    return (
        <SelectPrimitive.Trigger
            data-slot="select-trigger"
            data-size={size}
            className={cn(
                "border border-border bg-transparent text-foreground data-placeholder:text-muted-foreground text-sm gap-1.5",
                "pr-2 pl-2.5 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=xs]:h-6 flex w-fit items-center",
                "justify-between whitespace-nowrap outline-none select-none disabled:default disabled:opacity-50",
                "*:data-[slot=select-value]:gap-1.5 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex",
                "*:data-[slot=select-value]:items-center [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",
                "[&_svg]:shrink-0",
                className,
            )}
            {...props}
        >
            {children}
            <SelectPrimitive.Icon asChild>
                <ChevronDownIcon className="pointer-events-none text-foreground size-4" />
            </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
    )
}

export function SelectContent({
    className,
    children,
    position = "popper",
    align = "center",
    ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
    return (
        <SelectPrimitive.Portal>
            <SelectPrimitive.Content
                data-slot="select-content"
                className={cn(
                    "bg-popover text-foreground border border-border data-open:animate-in data-closed:animate-out",
                    "data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95",
                    "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
                    "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[side=bottom]:translate-y-1",
                    "data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1 min-w-36",
                    "duration-100 relative z-50 max-h-(--radix-select-content-available-height)",
                    "origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto",
                    className,
                )}
                position={position}
                align={align}
                {...props}
            >
                <SelectScrollUpButton />
                <SelectPrimitive.Viewport className="h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)">
                    {children}
                </SelectPrimitive.Viewport>
                <SelectScrollDownButton />
            </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
    )
}

export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
    return (
        <SelectPrimitive.Label
            data-slot="select-label"
            className={cn("text-muted-foreground px-1.5 py-1 text-xs", className)}
            {...props}
        />
    )
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
    return (
        <SelectPrimitive.Item
            data-slot="select-item"
            className={cn(
                "focus:bg-foreground/10 text-foreground gap-1.5 py-1 pr-8 pl-1.5 text-sm [&_svg:not([class*='size-'])]:size-4",
                "*:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2 relative flex w-full cursor-default",
                "items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50",
                "[&_svg]:pointer-events-none [&_svg]:shrink-0",
                className,
            )}
            {...props}
        >
            <span className="absolute flex items-center justify-center pointer-events-none right-2 size-4">
                <SelectPrimitive.ItemIndicator>
                    <CheckIcon className="pointer-events-none" />
                </SelectPrimitive.ItemIndicator>
            </span>
            <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        </SelectPrimitive.Item>
    )
}

export function SelectSeparator({ className, ...props }: ComponentProps<typeof SelectPrimitive.Separator>) {
    return (
        <SelectPrimitive.Separator
            data-slot="select-separator"
            className={cn("bg-border -mx-1 my-1 h-px pointer-events-none", className)}
            {...props}
        />
    )
}

export function SelectScrollUpButton({ className, ...props }: ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
    return (
        <SelectPrimitive.ScrollUpButton
            data-slot="select-scroll-up-button"
            className={cn(
                "bg-popover z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            {...props}
        >
            <ChevronUpIcon />
        </SelectPrimitive.ScrollUpButton>
    )
}

export function SelectScrollDownButton({
    className,
    ...props
}: ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
    return (
        <SelectPrimitive.ScrollDownButton
            data-slot="select-scroll-down-button"
            className={cn(
                "bg-popover z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            {...props}
        >
            <ChevronDownIcon />
        </SelectPrimitive.ScrollDownButton>
    )
}
