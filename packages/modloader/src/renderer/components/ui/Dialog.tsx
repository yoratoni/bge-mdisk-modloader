import { cn } from "@cybearl/cypack/frontend"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import Scrollbar from "@renderer/components/ui/Scrollbar"
import { XIcon } from "lucide-react"
import type { ComponentProps } from "react"

export function Dialog({ ...props }: ComponentProps<typeof DialogPrimitive.Root>) {
    return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

export function DialogTrigger({ ...props }: ComponentProps<typeof DialogPrimitive.Trigger>) {
    return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

export function DialogPortal({ ...props }: ComponentProps<typeof DialogPrimitive.Portal>) {
    return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

export function DialogClose({ ...props }: ComponentProps<typeof DialogPrimitive.Close>) {
    return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
    return (
        <DialogPrimitive.Overlay
            className={cn(
                "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                "data-[state=open]:fade-in-0 fixed inset-0 z-50 backdrop-blur-sm bg-background/50",
                className,
            )}
            data-slot="dialog-overlay"
            {...props}
        />
    )
}

export function DialogContent({
    className,
    children,
    showOverlay = true,
    showCloseButton = true,
    ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
    showOverlay?: boolean
    showCloseButton?: boolean
}) {
    return (
        <DialogPortal data-slot="dialog-portal">
            {showOverlay && <DialogOverlay />}
            <DialogPrimitive.Content
                className={cn(
                    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                    "data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed",
                    "top-[50%] left-[50%] z-50 flex flex-col w-full max-w-[calc(100%-2rem)] max-h-[80svh]",
                    "translate-x-[-50%] translate-y-[-50%] border border-border-active duration-200 sm:max-w-lg",
                    "backdrop-blur-xs bg-background/80 overflow-hidden",
                    className,
                )}
                data-slot="dialog-content"
                {...props}
            >
                <Scrollbar className="flex-1 min-h-0" showBar>
                    <div className="grid gap-4 p-6">{children}</div>
                </Scrollbar>
                {showCloseButton && (
                    <DialogPrimitive.Close
                        className={cn(
                            "data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-3 right-3",
                            "opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden disabled:pointer-events-none",
                            "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
                        )}
                        data-slot="dialog-close"
                    >
                        <XIcon />
                        <span className="sr-only">Close</span>
                    </DialogPrimitive.Close>
                )}
            </DialogPrimitive.Content>
        </DialogPortal>
    )
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
            data-slot="dialog-header"
            {...props}
        />
    )
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
            data-slot="dialog-footer"
            {...props}
        />
    )
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
    return (
        <DialogPrimitive.Title
            className={cn("text-lg font-medium leading-none", className)}
            data-slot="dialog-title"
            {...props}
        />
    )
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
    return (
        <DialogPrimitive.Description
            className={cn("text-sm text-muted-foreground", className)}
            data-slot="dialog-description"
            {...props}
        />
    )
}
