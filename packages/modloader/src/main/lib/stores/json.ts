import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { getStoreDir, getStorePath } from "@main/lib/utils/stores"

/**
 * The wiring a `JsonStore` needs to own one file on disk.
 */
export type JsonStoreOptions<T extends object> = {
    fileName: string
    defaults: T
    normalize: (partial: Partial<T>) => T
}

/**
 * A persistent JSON-backed store, cached in memory after the first read and
 * updated through a serialized write lock so concurrent callers cannot race on
 * the temp file or clobber each other's read-modify-write.
 */
export class JsonStore<T extends object> {
    /**
     * The file name, defaults and normalizer this instance was built with.
     */
    private _options: JsonStoreOptions<T>

    /**
     * The in-memory cache, lazily loaded on first access so repeated reads do
     * not hit the disk.
     */
    private _cache: T | null = null

    /**
     * The write chain, every update tacks onto this promise so writes run one
     * at a time and each sees the result of the previous one.
     */
    private _updateLock: Promise<unknown> = Promise.resolve()

    /**
     * A per-process counter used to give each write a unique temp file name.
     */
    private _writeCounter = 0

    /**
     * Creates the store, nothing reaches disk until the first read or write.
     * @param options The file name, defaults and normalizer to own the file with.
     */
    constructor(options: JsonStoreOptions<T>) {
        this._options = options
    }

    /**
     * Reads and parses the store from disk, falling back to the defaults when
     * the file is absent or unreadable/corrupt.
     * @returns The loaded value.
     */
    private async _readFromDisk(): Promise<T> {
        try {
            const raw = await readFile(getStorePath(this._options.fileName), "utf-8")
            return this._options.normalize(JSON.parse(raw) as Partial<T>)
        } catch {
            return structuredClone(this._options.defaults)
        }
    }

    /**
     * Persists the store to disk atomically, writes to a temp file then
     * renames, so a crash mid-write cannot corrupt the existing file.
     * @param value The value to persist.
     */
    private async _save(value: T): Promise<void> {
        const target = getStorePath(this._options.fileName)
        const temp = `${target}.${process.pid}.${this._writeCounter++}.tmp`

        await mkdir(getStoreDir(), { recursive: true })
        await writeFile(temp, JSON.stringify(value, null, 4), "utf-8")

        try {
            await rename(temp, target)
        } catch (error) {
            // Leave no orphaned temp file behind if the rename fails
            await rm(temp, { force: true })
            throw error
        }
    }

    /**
     * Returns the current value, loading it from disk on first access.
     * @returns The cached value.
     */
    async get(): Promise<T> {
        if (!this._cache) this._cache = await this._readFromDisk()
        return this._cache
    }

    /**
     * Reads the cache without touching the disk, for the synchronous preload
     * bridge, callers must have awaited `get` at least once beforehand or they
     * get the defaults.
     * @returns The cached value, or the defaults when nothing is loaded yet.
     */
    getCached(): T {
        return this._cache ?? this._options.defaults
    }

    /**
     * Applies a mutation to a copy of the current value, persists it, and
     * updates the in-memory cache.
     * @param mutator A function that mutates the draft in place, or returns a
     * replacement value.
     * @returns The updated value.
     */
    update(mutator: (value: T) => T | undefined): Promise<T> {
        const run = this._updateLock.then(async () => {
            const current = await this.get()

            const draft = structuredClone(current)
            const result = mutator(draft) ?? draft

            await this._save(result)

            this._cache = result

            return result
        })

        // Keep the chain alive even if this update fails
        this._updateLock = run.catch(() => undefined)

        return run
    }
}
