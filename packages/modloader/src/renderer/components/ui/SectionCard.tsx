import type { ReactNode } from "react"

type SectionCardProps = {
    eyebrow?: string
    title: string
    content: ReactNode
    variant?: "stat" | "info"
}

export default function SectionCard({ eyebrow, title, content, variant = "info" }: SectionCardProps) {
    if (variant === "stat") {
        return (
            <div className="flex-1 border p-4 flex flex-col gap-2 bg-black/20">
                {eyebrow && <span className="text-xs tracking-[0.4em] uppercase text-muted-foreground">{eyebrow}</span>}
                <h4 className="text-sm sm:text-base font-medium text-muted-foreground">{title}</h4>
                <p className="text-xl sm:text-2xl">{content}</p>
            </div>
        )
    }

    return (
        <div className="flex-1 border p-4 flex flex-col gap-2 bg-black/20">
            {eyebrow && <span className="text-xs tracking-[0.4em] uppercase text-muted-foreground">{eyebrow}</span>}
            <h3 className="text-lg font-medium">{title}</h3>
            <p className="text-sm text-muted-foreground">{content}</p>
        </div>
    )
}
