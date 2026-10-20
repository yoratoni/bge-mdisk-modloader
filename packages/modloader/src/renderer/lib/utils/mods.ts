import type { ModPak } from "@/main/types/mods"

/**
 * Describes the entries changed in some paks.
 * @param paks The paks, with the number of entries changed in each.
 * @returns The description, e.g. "Resources (2 entries), Text-fr (1 entry)".
 */
export function describePaks(paks: ModPak[]): string {
    return paks.map(pak => `${pak.name} (${pak.entryCount} ${pak.entryCount === 1 ? "entry" : "entries"})`).join(", ")
}
