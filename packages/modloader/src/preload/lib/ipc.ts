import { ipcRenderer } from "electron"
import type { IpcResult } from "@/main/types/ipc"

/**
 * Invokes a `safeHandle`-registered channel and unwraps its `IpcResult`,
 * throwing when the handler reported a failure.
 * @param channel The IPC channel to invoke.
 * @param args The arguments forwarded to the handler.
 * @returns The value returned by the handler.
 */
export async function safeInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
    if (!result.ok) throw new Error(result.error)
    return result.value
}
