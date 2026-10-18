import { convertErrorToMessage } from "@main/lib/utils/errors"
import { type IpcMainInvokeEvent, ipcMain } from "electron"
import type { IpcResult } from "@/main/types/ipc"

/**
 * Registers an IPC handler that catches its own errors and returns an
 * `IpcResult`, so `ipcMain.handle` never rejects.
 * @param channel The IPC channel to register.
 * @param fn The handler body.
 */
export function safeHandle<Args extends unknown[], T>(
    channel: string,
    fn: (event: IpcMainInvokeEvent, ...args: Args) => Promise<T> | T,
): void {
    ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<T>> => {
        try {
            return {
                ok: true,
                value: await fn(event, ...(args as Args)),
            }
        } catch (error) {
            const message = convertErrorToMessage(error)
            console.error(`[ipc] ${channel} failed:`, message)

            return {
                ok: false,
                error: message,
            }
        }
    })
}
