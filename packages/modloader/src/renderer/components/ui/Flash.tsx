import { cn } from "@cybearl/cypack/frontend"

type FlashProps = {
    value: string
    customKey?: string
    className?: string
}

export default function Flash({ value, customKey, className }: FlashProps) {
    return (
        <span key={customKey ?? value} className={cn("animate-flash", className)}>
            {value}
        </span>
    )
}
