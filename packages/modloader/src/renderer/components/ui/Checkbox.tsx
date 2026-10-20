import { cn } from "@cybearl/cypack/frontend"
import { cva, type VariantProps } from "class-variance-authority"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import type { ComponentProps } from "react"

export const checkboxVariants = cva(
    "border-foreground data-checked:bg-primary data-checked:text-primary-foreground data-checked:border-primary aria-invalid:aria-checked:border-primary aria-invalid:border-destructive focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 flex items-center justify-center border transition-colors group-has-disabled/field:opacity-50 focus-visible:ring-3 aria-invalid:ring-3 peer relative shrink-0 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-default disabled:opacity-50",
    {
        variants: {
            size: {
                sm: "size-3.5",
                md: "size-4",
                lg: "size-5",
            },
        },
        defaultVariants: {
            size: "md",
        },
    },
)

const indicatorSizeVariants: Record<NonNullable<VariantProps<typeof checkboxVariants>["size"]>, string> = {
    sm: "[&>svg]:size-3.5",
    md: "[&>svg]:size-4",
    lg: "[&>svg]:size-5",
}

type CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root> & VariantProps<typeof checkboxVariants>

export function Checkbox({ className, size = "md", ...props }: CheckboxProps) {
    return (
        <CheckboxPrimitive.Root data-slot="checkbox" className={cn(checkboxVariants({ size, className }))} {...props}>
            <CheckboxPrimitive.Indicator
                data-slot="checkbox-indicator"
                className={cn("grid place-content-center text-current transition-none", indicatorSizeVariants[size!])}
            >
                <CheckIcon />
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    )
}
