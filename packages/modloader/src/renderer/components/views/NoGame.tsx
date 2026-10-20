import { Button } from "@renderer/components/ui/Button"
import { FolderPlusIcon } from "lucide-react"

type NoGameProps = {
    onAdd: () => Promise<void>
}

export default function NoGame({ onAdd }: NoGameProps) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <h3>Beyond Good &amp; Evil wasn't found</h3>

            <p className="max-w-lg text-sm text-muted-foreground">
                MDisk looks in the Steam libraries and in what the GOG, Ubisoft Connect and disc installers registered.
                If your copy is somewhere else, pick its folder.
            </p>

            <Button size="md" onClick={onAdd}>
                <FolderPlusIcon />
                Pick its folder
            </Button>
        </div>
    )
}
