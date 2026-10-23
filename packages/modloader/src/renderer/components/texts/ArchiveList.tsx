import Code from "@renderer/components/ui/Code"
import { Fragment } from "react"
import type { ModArchive } from "@/main/types/mods"

type ArchiveListProps = {
    /**
     * The archives, with the number of files replaced in each, or their file names alone.
     */
    archives: (ModArchive | string)[]
}

/**
 * Lists archives of the game inline, their file names as code.
 * @param archives The archives, with the number of files replaced in each, or their file names alone.
 * @returns The list, e.g. "1 file in `Resources.pak`, 2 files in `Text-fr.pak`".
 */
export default function ArchiveList({ archives }: ArchiveListProps) {
    return archives.map((archive, index) => {
        const name = typeof archive === "string" ? archive : archive.name

        return (
            <Fragment key={name}>
                {index > 0 && ", "}
                {typeof archive !== "string" &&
                    `${archive.entryCount} ${archive.entryCount === 1 ? "file" : "files"} in `}
                <Code className="ml-0.5">{name}</Code>
            </Fragment>
        )
    })
}
