import { execFile } from "node:child_process"
import { promisify } from "node:util"
import REGISTRY_CONSTANTS from "@main/lib/constants/registry"

/**
 * The promisified version of `execFile`.
 */
const execFileAsync = promisify(execFile)

/**
 * The values of one registry key, by name.
 */
export type RegistryValues = Record<string, string>

/**
 * Runs `reg query` (Windows only) and parses its output into the values of every key it lists.
 * @param args The arguments after `query`.
 * @returns The values of every key listed, by key, empty when nothing matches (reg.exe then exits with 1).
 */
async function queryRegistry(args: string[]): Promise<Map<string, RegistryValues>> {
    let stdout: string

    try {
        const command = [REGISTRY_CONSTANTS.queryCommand, ...args]
        stdout = (await execFileAsync(REGISTRY_CONSTANTS.executable, command, { windowsHide: true })).stdout
    } catch {
        return new Map()
    }

    const keys = new Map<string, RegistryValues>()
    let currentValues: RegistryValues | null = null

    for (const line of stdout.split(REGISTRY_CONSTANTS.lineBreak)) {
        if (line.startsWith(REGISTRY_CONSTANTS.keyLinePrefix)) {
            currentValues = {}
            keys.set(line.trim(), currentValues)
            continue
        }

        const match = REGISTRY_CONSTANTS.valueLine.exec(line)
        if (match && currentValues) currentValues[match[1]] = match[3]
    }

    return keys
}

/**
 * Reads one value of a registry key.
 * @param key The key (e.g. "HKCU\Software\Valve\Steam").
 * @param value The value name.
 * @returns The data, `null` when the key or the value doesn't exist.
 */
export async function readRegistryValue(key: string, value: string): Promise<string | null> {
    const keys = await queryRegistry([key, REGISTRY_CONSTANTS.queryFlags.value, value])

    for (const values of keys.values()) {
        if (value in values) return values[value]
    }

    return null
}

/**
 * Finds the subkeys of a key holding a value whose data contains a term, with all their values.
 * @param key The key to search under, recursively.
 * @param term The term searched in the data of the values, without case.
 * @returns The values of every matching subkey, by subkey.
 */
export async function findRegistryKeys(key: string, term: string): Promise<Map<string, RegistryValues>> {
    const matches = await queryRegistry([
        key,
        REGISTRY_CONSTANTS.queryFlags.subkeys,
        REGISTRY_CONSTANTS.queryFlags.find,
        term,
        REGISTRY_CONSTANTS.queryFlags.data,
    ])
    const keys = new Map<string, RegistryValues>()

    // The search only lists the values that matched, the keys are read again for all of theirs
    for (const matchingKey of matches.keys()) {
        const values = (await queryRegistry([matchingKey])).get(matchingKey)
        if (values) keys.set(matchingKey, values)
    }

    return keys
}
