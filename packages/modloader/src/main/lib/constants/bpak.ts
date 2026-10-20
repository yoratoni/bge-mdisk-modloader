/**
 * All constants related to the BPAK archives of the 20th Anniversary Edition ("Data/Paks/*.pak", see the research
 * notes of the repository).
 */
const BPAK_CONSTANTS = {
    /**
     * The magic starting every pak.
     */
    magic: "BPAK",

    /**
     * The size of the header: the magic, three unknown uint32, the entry count and the size of the table of contents,
     * the entry offsets are relative to its end.
     */
    headerSize: 0x18,

    /**
     * Every slot (and the table of contents) starts on a boundary of this many bytes.
     */
    alignment: 16,

    /**
     * The byte padding the slots up to the next boundary, a space.
     */
    paddingByte: 0x20,

    /**
     * The flag of a named entry in the table of contents, which stores its name.
     */
    flagNamed: 0,

    /**
     * The flag of a keyed entry in the table of contents, which stores a 32-bit Jade key.
     */
    flagKeyed: 1,

    /**
     * The size of the fields following the identifier of an entry: size, packed size (0 when stored raw), extra size,
     * unknown (kept as is), then the offset as a uint64.
     */
    entryFieldsSize: 24,
} as const

export default BPAK_CONSTANTS
