import { cn } from "@cybearl/cypack/frontend"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"
import { type ButtonHTMLAttributes, forwardRef, type MouseEvent, useState } from "react"

export const buttonVariants = cva(
    cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-35 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        "transition-all duration-200",
    ),
    {
        variants: {
            variant: {
                default: "bg-primary text-primary-foreground hover:bg-primary-800",
                outline: "bg-transparent text-foreground border border-border-active hover:bg-primary/10",
                "outline-b2": "bg-transparent border-2 border-border-active hover:bg-primary/10",
                ghost: "bg-transparent text-foreground hover:bg-foreground/10",
                link: "bg-transparent px-0! hover:underline underline-offset-4 text-foreground",
                "active-tab": "bg-transparent text-foreground cursor-default",
                "inactive-tab": "bg-transparent text-foreground/50 hover:bg-foreground/10",
            },
            size: {
                default: "h-7 px-2 text-sm",
                xs: "h-6 px-1.5 text-xs",
                sm: "h-7 px-2 text-sm",
                md: "h-8 px-3 py-1.5 text-sm",
                lg: "h-9 px-4 text-lg",
                icon: "size-9",
                "icon-sm": "size-6",
                slim: "h-4 px-0",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    isLoading?: boolean
    disableAsyncLoading?: boolean
    asChild?: boolean
    disabledText?: string
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant,
            size,
            isLoading = false,
            disableAsyncLoading = false,
            asChild = false,
            disabledText,
            onClick,
            ...props
        },
        ref,
    ) => {
        const [isLoadingInternally, setIsLoadingInternally] = useState(false)

        const Comp = asChild ? Slot : "button"

        /**
         * Handle the `onClick` event with support for async functions.
         * @param event The click event object.
         */
        const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
            if (!onClick || isLoading || isLoadingInternally) return

            setIsLoadingInternally(true)

            try {
                await onClick(event)
            } catch (error) {
                console.error("An error occurred on the 'Button' component", error)
            }

            setIsLoadingInternally(false)
        }

        // Handle "asChild" case, pass "onClick" through but don't modify children
        if (asChild) {
            const asChildProps = {
                ...props,
                ...(onClick && { onClick: handleClick }),
            }

            return (
                <Comp
                    className={cn(
                        buttonVariants({
                            className,
                            size,
                            variant,
                        }),
                    )}
                    data-slot="button"
                    {...asChildProps}
                />
            )
        }

        // Regular button handling, if the button is loading, we replace the
        // default props with loading props, note that it takes priority
        // over the disabled state
        if (!disableAsyncLoading && (isLoading || isLoadingInternally)) {
            props["aria-busy"] = true
            props["aria-label"] = "Loading"
            props.title = "Loading"
            props.disabled = true

            // If the button is loading, we replace the children with an animated icon
            props.children = (
                <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center justify-center w-full h-full">
                        <Loader2Icon className="w-6 h-6 animate-spin" />
                    </div>
                    <div className="opacity-0">{props.children}</div>
                </div>
            )
        }

        // If the button is disabled, we keep the children as is in order to keep the same size,
        // we simply set the opacity to 0 for the children and add the disabled text on top of it
        if ((disableAsyncLoading || (!isLoading && !isLoadingInternally)) && props.disabled && disabledText) {
            props["aria-label"] = disabledText
            props.title = disabledText
            props.disabled = true

            props.children = (
                <div className="relative">
                    <div className="opacity-0 pointer-events-none">{props.children}</div>
                    <div className="absolute inset-0 flex items-center justify-center text-base">{disabledText}</div>
                </div>
            )
        }

        return (
            <Comp
                className={cn(
                    buttonVariants({
                        variant,
                        size,
                        className,
                    }),
                )}
                data-slot="button"
                ref={ref}
                onClick={handleClick}
                {...props}
            />
        )
    },
)
Button.displayName = "Button"
