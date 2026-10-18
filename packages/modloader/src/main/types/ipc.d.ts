/**
 * The envelope every fallible IPC handler wraps its return value in, so the
 * handler never rejects and the renderer side can decide how to react.
 */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string }
