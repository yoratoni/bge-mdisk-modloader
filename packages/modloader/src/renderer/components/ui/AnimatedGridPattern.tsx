import { cn } from "@cybearl/cypack/frontend"
import { motion } from "motion/react"
import { type ComponentPropsWithoutRef, useCallback, useEffect, useId, useRef, useState } from "react"

export interface AnimatedGridPatternProps extends ComponentPropsWithoutRef<"svg"> {
    width?: number
    height?: number
    x?: number
    y?: number
    strokeDasharray?: number
    numSquares?: number
    maxOpacity?: number
    duration?: number
    repeatDelay?: number
}

type Square = {
    id: number
    pos: [number, number]
    iteration: number
}

export function AnimatedGridPattern({
    width = 40,
    height = 40,
    x = -1,
    y = -1,
    strokeDasharray = 0,
    numSquares = 50,
    className,
    maxOpacity = 0.5,
    duration = 4,
    repeatDelay = 0.5,
    ...props
}: AnimatedGridPatternProps) {
    const id = useId()
    const containerRef = useRef<SVGSVGElement | null>(null)
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
    const [squares, setSquares] = useState<Array<Square>>([])

    /**
     * Get a random position for a square within the grid.
     * @returns A tuple containing the X and Y coordinates of the square's position.
     */
    const getPos = useCallback((): [number, number] => {
        return [
            Math.floor((Math.random() * dimensions.width) / width),
            Math.floor((Math.random() * dimensions.height) / height),
        ]
    }, [dimensions.height, dimensions.width, height, width])

    /**
     * Generate an array of squares with random positions.
     * @param count The number of squares to generate.
     * @returns An array of squares.
     */
    const generateSquares = useCallback(
        (count: number) => {
            return Array.from({ length: count }, (_, i) => ({
                id: i,
                pos: getPos(),
                iteration: 0,
            }))
        },
        [getPos],
    )

    /**
     * Update the position of a square.
     * @param squareId The ID of the square to update.
     */
    const updateSquarePosition = useCallback(
        (squareId: number) => {
            setSquares(currentSquares => {
                const current = currentSquares[squareId]
                if (!current || current.id !== squareId) return currentSquares

                const nextSquares = currentSquares.slice()
                nextSquares[squareId] = {
                    ...current,
                    pos: getPos(),
                    iteration: current.iteration + 1,
                }

                return nextSquares
            })
        },
        [getPos],
    )

    // Initialize squares when dimensions are available
    useEffect(() => {
        if (dimensions.width && dimensions.height) {
            setSquares(generateSquares(numSquares))
        }
    }, [dimensions.width, dimensions.height, generateSquares, numSquares])

    // Update square positions on resize
    useEffect(() => {
        if (!containerRef.current) return

        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                setDimensions(currentDimensions => {
                    if (
                        currentDimensions.width === entry.contentRect.width &&
                        currentDimensions.height === entry.contentRect.height
                    ) {
                        return currentDimensions
                    }

                    return {
                        width: entry.contentRect.width,
                        height: entry.contentRect.height,
                    }
                })
            }
        })

        resizeObserver.observe(containerRef.current)

        return () => {
            resizeObserver.disconnect()
        }
    }, [])

    return (
        <svg
            ref={containerRef}
            aria-hidden="true"
            className={cn(
                "pointer-events-none absolute inset-0 h-full w-full fill-gray-400/30 stroke-gray-400/30",
                className,
            )}
            {...props}
        >
            <defs>
                <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse" x={x} y={y}>
                    <path d={`M.5 ${height}V.5H${width}`} fill="none" strokeDasharray={strokeDasharray} />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${id})`} />
            <svg x={x} y={y} className="overflow-visible">
                <title>Animated grid pattern with squares that fade in and out at random positions</title>
                {squares.map(({ pos: [squareX, squareY], id, iteration }, index) => (
                    <motion.rect
                        initial={{ opacity: 0 }}
                        animate={{ opacity: maxOpacity }}
                        transition={{
                            duration,
                            repeat: 1,
                            delay: index * 0.1,
                            repeatType: "reverse",
                            repeatDelay,
                        }}
                        onAnimationComplete={() => updateSquarePosition(id)}
                        key={`${id}-${iteration}`}
                        width={width - 1}
                        height={height - 1}
                        x={squareX * width + 1}
                        y={squareY * height + 1}
                        fill="currentColor"
                        strokeWidth="0"
                    />
                ))}
            </svg>
        </svg>
    )
}
