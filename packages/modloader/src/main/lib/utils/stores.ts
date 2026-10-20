import path from "node:path"
import STORE_CONFIG from "@main/config/store"
import { app } from "electron"

/**
 * Resolves the absolute path to the directory holding every persisted store file.
 * @returns The absolute store directory path.
 */
export function getStoreDir(): string {
    return path.join(app.getPath("appData"), STORE_CONFIG.dirName)
}

/**
 * Resolves the absolute path to one store file.
 * @param fileName The store's file name.
 * @returns The absolute store file path.
 */
export function getStorePath(fileName: string): string {
    return path.join(getStoreDir(), fileName)
}
