import { DynamicIcon, type IconName } from "lucide-react/dynamic"
import type { ReactNode } from "react"

type NoteProps = {
    icon: IconName
    content: ReactNode
}

export default function Note({ icon, content }: NoteProps) {
    return (
        <div className="flex items-center gap-2 rounded border border-border-active bg-foreground/5 px-3 py-2 text-sm">
            <DynamicIcon name={icon} className="min-w-4 min-h-4 sm:min-w-5 sm:min-h-5" />
            <span>{content}</span>
        </div>
    )
}
