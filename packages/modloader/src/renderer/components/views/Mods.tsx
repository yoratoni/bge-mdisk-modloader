import ModRow from "@renderer/components/rows/Mod"
import { Button } from "@renderer/components/ui/Button"
import Scrollbar from "@renderer/components/ui/Scrollbar"
import Skeleton from "@renderer/components/ui/Skeleton"
import useMods from "@renderer/hooks/useMods"
import { PackagePlusIcon, PlayIcon, RotateCcwIcon } from "lucide-react"
import type { Game } from "@/main/types/games"

type ModsProps = {
    game: Game
}

export default function Mods({ game }: ModsProps) {
    const { mods, isLoading, add, remove, setEnabled, apply, restore } = useMods()

    return (
        <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3">
                <h4>Mods</h4>

                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="md" onClick={restore}>
                        <RotateCcwIcon />
                        Restore the game
                    </Button>

                    <Button variant="outline" size="md" onClick={add}>
                        <PackagePlusIcon />
                        Add a mod
                    </Button>

                    <Button size="md" onClick={apply}>
                        <PlayIcon />
                        Apply
                    </Button>
                </div>
            </div>

            <Scrollbar className="min-h-0 flex-1" showBar>
                {isLoading && <Skeleton className="m-4 h-16" />}

                {!isLoading && !mods.length && (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                        No mod installed yet, add one from its folder (a "mod.json" next to its "paks" or "bf" folder).
                    </p>
                )}

                {mods.map(mod => (
                    <ModRow key={mod.id} mod={mod} game={game} onToggle={setEnabled} onRemove={remove} />
                ))}
            </Scrollbar>
        </div>
    )
}
