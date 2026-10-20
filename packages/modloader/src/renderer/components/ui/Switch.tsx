import { cn } from "@cybearl/cypack/frontend"
import { cva, type VariantProps } from "class-variance-authority"
import { Switch as SwitchPrimitive } from "radix-ui"
import type * as React from "react"

const switchVariants = cva(
    "peer relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50",
    {
        variants: {
            size: {
                default: "h-4.5 w-8",
                sm: "h-3.5 w-6",
            },
        },
        defaultVariants: {
            size: "default",
        },
    },
)

const thumbVariants = cva(
    "pointer-events-none block rounded-full ring-0 transition-transform data-[state=checked]:bg-primary-foreground data-[state=unchecked]:bg-foreground data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0",
    {
        variants: {
            size: {
                default: "size-4",
                sm: "size-3",
            },
        },
        defaultVariants: {
            size: "default",
        },
    },
)

type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root> & VariantProps<typeof switchVariants>

function Switch({ className, size, ...props }: SwitchProps) {
    return (
        <SwitchPrimitive.Root data-slot="switch" className={cn(switchVariants({ size, className }))} {...props}>
            <SwitchPrimitive.Thumb data-slot="switch-thumb" className={cn(thumbVariants({ size }))} />
        </SwitchPrimitive.Root>
    )
}

export { Switch }
