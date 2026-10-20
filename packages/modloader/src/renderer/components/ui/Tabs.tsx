import { cn } from "@cybearl/cypack/frontend"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"
import type { ComponentProps } from "react"

export function Tabs({ className, orientation = "horizontal", ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
    return (
        <TabsPrimitive.Root
            data-slot="tabs"
            data-orientation={orientation}
            orientation={orientation}
            className={cn("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className)}
            {...props}
        />
    )
}

export const tabsListVariants = cva(
    "p-0.75 group-data-[orientation=horizontal]/tabs:h-9 group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center gap-0 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
    {
        variants: {
            variant: {
                default: "bg-transparent",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
)

export function TabsList({
    className,
    variant = "default",
    ...props
}: ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
    return (
        <TabsPrimitive.List
            data-slot="tabs-list"
            data-variant={variant}
            className={cn(tabsListVariants({ variant }), className)}
            {...props}
        />
    )
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
    return <TabsPrimitive.Trigger asChild data-slot="tabs-trigger" className={className} {...props} />
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
    return (
        <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 outline-none", className)} {...props} />
    )
}
