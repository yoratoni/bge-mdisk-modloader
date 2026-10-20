import { cn } from "@cybearl/cypack/frontend"
import { useMemo } from "react"

type EmptyProps = {
    title: string
    size?: "sm" | "md" | "lg"
    className?: string
}

export default function Empty({ title, size = "md", className }: EmptyProps) {
    /**
     * Get the proper TailwindCSS padding classes based on the size prop.
     */
    const padding = useMemo(() => {
        switch (size) {
            case "sm":
                return "px-4 py-2"
            case "lg":
                return "p-6"
            default:
                return "p-4"
        }
    }, [size])

    return (
        <div className={cn("bg-accent/20 border border-foreground", padding, className)}>
            <p>{title}</p>
        </div>
    )
}
