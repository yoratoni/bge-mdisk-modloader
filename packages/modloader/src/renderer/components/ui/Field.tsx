import { cn } from "@cybearl/cypack/frontend"
import { Label } from "@renderer/components/ui/Label"
import { Separator } from "@renderer/components/ui/Separator"
import { cva, type VariantProps } from "class-variance-authority"
import { type ComponentProps, type ReactNode, useMemo } from "react"

export function FieldSet({ className, ...props }: ComponentProps<"fieldset">) {
    return (
        <fieldset
            data-slot="field-set"
            className={cn(
                "flex flex-col gap-6",
                "has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
                className,
            )}
            {...props}
        />
    )
}

export function FieldLegend({
    className,
    variant = "legend",
    ...props
}: ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
    return (
        <legend
            data-slot="field-legend"
            data-variant={variant}
            className={cn(
                "mb-3 font-medium",
                "data-[variant=legend]:text-base",
                "data-[variant=label]:text-sm",
                className,
            )}
            {...props}
        />
    )
}

export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="field-group"
            className={cn(
                "group/field-group @container/field-group flex w-full flex-col gap-4 data-[slot=checkbox-group]:gap-5",
                "*:data-[slot=field-group]:gap-6",
                className,
            )}
            {...props}
        />
    )
}

const fieldVariants = cva("group/field data-[invalid=true]:text-destructive flex w-full gap-2 mt-1", {
    variants: {
        orientation: {
            vertical: ["flex-col *:w-full [&>.sr-only]:w-auto"],
            horizontal: [
                "flex-row items-center",
                "*:data-[slot=field-label]:flex-auto",
                "has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px has-[>[data-slot=field-content]]:items-start",
            ],
            responsive: [
                "@md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto flex-col *:w-full [&>.sr-only]:w-auto",
                "@md/field-group:*:data-[slot=field-label]:flex-auto",
                "@md/field-group:has-[>[data-slot=field-content]]:items-start",
                "@md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
            ],
        },
    },
    defaultVariants: {
        orientation: "vertical",
    },
})

export function Field({
    className,
    orientation = "vertical",
    ...props
}: ComponentProps<"fieldset"> & VariantProps<typeof fieldVariants>) {
    return (
        <fieldset
            data-slot="field"
            data-orientation={orientation}
            className={cn(fieldVariants({ orientation }), className)}
            {...props}
        />
    )
}

export function FieldContent({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="field-content"
            className={cn("group/field-content flex flex-1 flex-col gap-1.5 leading-snug", className)}
            {...props}
        />
    )
}

export function FieldLabel({ className, ...props }: ComponentProps<typeof Label>) {
    return (
        <Label
            data-slot="field-label"
            className={cn(
                "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50",
                "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:border",
                "*:data-[slot=field]:p-4",
                "has-data-[state=checked]:bg-foreground/5 has-data-[state=checked]:border-foreground",
                className,
            )}
            {...props}
        />
    )
}

export function FieldTitle({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="field-label"
            className={cn(
                "flex w-fit items-center gap-2 text-sm font-medium leading-snug group-data-[disabled=true]/field:opacity-50",
                className,
            )}
            {...props}
        />
    )
}

export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
    return (
        <p
            data-slot="field-description"
            className={cn(
                "text-muted-foreground text-sm font-normal leading-normal group-has-data-[orientation=horizontal]/field:text-balance",
                "nth-last-2:-mt-1 last:mt-0 [[data-variant=legend]+&]:-mt-1.5",
                "[&>a:hover]:text-foreground [&>a]:underline [&>a]:underline-offset-4",
                className,
            )}
            {...props}
        />
    )
}

export function FieldSeparator({
    children,
    className,
    ...props
}: ComponentProps<"div"> & {
    children?: ReactNode
}) {
    return (
        <div
            data-slot="field-separator"
            data-content={!!children}
            className={cn("relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2", className)}
            {...props}
        >
            <Separator className="absolute inset-0 top-1/2" />
            {children && (
                <span
                    className="relative block px-2 mx-auto bg-background text-muted-foreground w-fit"
                    data-slot="field-separator-content"
                >
                    {children}
                </span>
            )}
        </div>
    )
}

export function FieldError({
    className,
    children,
    errors,
    ...props
}: ComponentProps<"div"> & {
    errors?: Array<{ message?: string } | undefined>
}) {
    /**
     * Get the error message content depending on the context.
     * @returns The error message content to display.
     */
    const content = useMemo(() => {
        if (children) return children
        if (!errors) return null

        if (errors?.length === 1 && errors[0]?.message) {
            return errors[0].message
        }

        return (
            <ul className="flex flex-col gap-1 ml-4 list-disc">
                {errors.map((error, index) => error?.message && <li key={index}>{error.message}</li>)}
            </ul>
        )
    }, [children, errors])

    if (!content) {
        return null
    }

    return (
        <div
            role="alert"
            data-slot="field-error"
            className={cn("text-destructive text-sm font-normal", className)}
            {...props}
        >
            {content}
        </div>
    )
}
