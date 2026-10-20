import VDF_CONSTANTS from "@main/lib/constants/vdf"

/**
 * A value of Valve's `KeyValues` text format (VDF), a string or a nested object.
 */
export type VdfValue = string | VdfObject

/**
 * An object of Valve's `KeyValues` text format (VDF).
 */
export type VdfObject = { [key: string]: VdfValue }

/**
 * A token of the VDF text, a string (quoted or not) or a brace.
 */
type VdfToken = { type: "string"; value: string } | { type: "open" } | { type: "close" }

/**
 * Splits a VDF text into its tokens, skipping whitespace and `//` comments.
 * @param text The VDF text.
 * @returns The tokens, in order.
 */
function tokenizeVdf(text: string): VdfToken[] {
    const tokens: VdfToken[] = []
    let position = 0

    while (position < text.length) {
        const character = text[position]

        if (VDF_CONSTANTS.whitespace.test(character)) {
            position++
        } else if (text.startsWith(VDF_CONSTANTS.commentMarker, position)) {
            const lineEnd = text.indexOf("\n", position)
            position = lineEnd === -1 ? text.length : lineEnd
        } else if (character === "{" || character === "}") {
            tokens.push({ type: character === "{" ? "open" : "close" })
            position++
        } else if (character === '"') {
            let value = ""
            position++

            while (position < text.length && text[position] !== '"') {
                if (text[position] === "\\" && position + 1 < text.length) {
                    value += VDF_CONSTANTS.escapes[text[position + 1]] ?? text[position + 1]
                    position += 2
                } else {
                    value += text[position++]
                }
            }

            tokens.push({ type: "string", value })
            position++
        } else {
            let value = ""

            while (position < text.length && !VDF_CONSTANTS.unquotedEnd.test(text[position])) value += text[position++]

            tokens.push({ type: "string", value })
        }
    }

    return tokens
}

/**
 * Parses a VDF text, like Steam's "libraryfolders.vdf" and its app manifests.
 * @param text The VDF text.
 * @returns The root object, keyed as in the text.
 */
export function parseVdf(text: string): VdfObject {
    const tokens = tokenizeVdf(text)
    let position = 0

    /**
     * Parses the key-value pairs up to the closing brace of the current object (or the end of the text).
     * @returns The object.
     */
    const parseObject = (): VdfObject => {
        const object: VdfObject = {}

        while (position < tokens.length) {
            const token = tokens[position++]

            if (token.type === "close") return object
            if (token.type === "open") throw new Error("A VDF object has no key.")

            const value = tokens[position++]

            if (value?.type === "open") object[token.value] = parseObject()
            else if (value?.type === "string") object[token.value] = value.value
            else throw new Error(`The VDF key "${token.value}" has no value.`)
        }

        return object
    }

    return parseObject()
}

/**
 * Reads a value of a VDF object, the keys compared without case like Steam does.
 * @param object The object.
 * @param key The key.
 * @returns The value, `undefined` if the object has none under that key.
 */
export function getVdfValue(object: VdfObject, key: string): VdfValue | undefined {
    const matchingKey = Object.keys(object).find(objectKey => objectKey.toLowerCase() === key.toLowerCase())
    return matchingKey === undefined ? undefined : object[matchingKey]
}
