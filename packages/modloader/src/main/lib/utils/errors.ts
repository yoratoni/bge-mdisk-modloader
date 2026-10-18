/**
 * Reduces an unknown thrown value to a displayable message, so callers can pass a
 * raw `catch` binding without narrowing it first.
 * @param error The thrown value, typically the argument of a `catch` clause.
 * @returns The message to surface.
 */
export function convertErrorToMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
