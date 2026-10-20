import { cn } from "@cybearl/cypack/frontend"
import { DynamicIcon, type IconName } from "lucide-react/dynamic"
import { toast as sonnerToast } from "sonner"

type ToastProps = {
    id: string | number
    backgroundColor: string
    icon: IconName
    title: string
    description?: string
}

/**
 * A fully custom toast that still maintains the animations and interactions.
 * @param icon The Lucide icon shown before the title.
 * @param backgroundColor The Tailwind class tinting the toast.
 * @param title The message.
 * @param description The details under the message, if any.
 */
function Toast({ icon, backgroundColor, title, description }: ToastProps) {
    return (
        <div className="relative w-full p-4 bg-black border md:max-w-91 border-border">
            <div className={cn("absolute inset-0", backgroundColor)} />

            <div className="relative flex items-center justify-center w-full gap-4">
                <DynamicIcon name={icon} className="size-0 min-w-6 min-h-6" />
                <p className="text-base text-foreground">{title}</p>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
        </div>
    )
}

/**
 * Toast notification methods.
 */
const toast = {
    success: (title: string, description?: string) => {
        sonnerToast.custom(id => (
            <Toast
                id={id}
                icon="circle-check-big"
                backgroundColor="bg-success/15"
                title={title}
                description={description}
            />
        ))
    },
    warning: (title: string, description?: string) => {
        sonnerToast.custom(id => (
            <Toast
                id={id}
                icon="circle-alert"
                backgroundColor="bg-warning-300/15"
                title={title}
                description={description}
            />
        ))
    },
    error: (title: string, description?: string) => {
        sonnerToast.custom(id => (
            <Toast id={id} icon="circle-x" backgroundColor="bg-danger/15" title={title} description={description} />
        ))
    },
    info: (title: string, description?: string) => {
        sonnerToast.custom(id => (
            <Toast id={id} icon="info" backgroundColor="bg-info/20" title={title} description={description} />
        ))
    },
}

export default toast
