import ModRow from "@renderer/components/rows/Mod"
import { Button } from "@renderer/components/ui/Button"
import Scrollbar from "@renderer/components/ui/Scrollbar"
import Skeleton from "@renderer/components/ui/Skeleton"
import useMods from "@renderer/hooks/useMods"
import GAMES_UI_CONSTANTS from "@renderer/lib/constants/games"
import { PackagePlusIcon, PlayIcon, RotateCcwIcon } from "lucide-react"
import type { Game } from "@/main/types/games"

type ModsProps = {
    game: Game
}

export default function Mods({ game }: ModsProps) {
    const { mods, isLoading, add, remove, setEnabled, apply, restore } = useMods()
    const isSupported = game.edition === "anniversary"

    return (
        <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3">
                <h4>Mods</h4>

                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="md" disabled={!isSupported} onClick={restore}>
                        <RotateCcwIcon />
                        Restore the game
                    </Button>

                    <Button variant="outline" size="md" onClick={add}>
                        <PackagePlusIcon />
                        Add a mod
                    </Button>

                    <Button size="md" disabled={!isSupported} onClick={apply}>
                        <PlayIcon />
                        Apply
                    </Button>
                </div>
            </div>

            {!isSupported && (
                <p className="shrink-0 border-b border-border px-4 py-2 text-sm text-warning">
                    Mods can only be applied to the {GAMES_UI_CONSTANTS.editionNames.anniversary} for now.
                </p>
            )}

            <Scrollbar className="min-h-0 flex-1" showBar>
                {isLoading && <Skeleton className="m-4 h-16" />}

                {!isLoading && !mods.length && (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                        No mod installed yet, add one from its folder (a "mod.json" next to its "paks" folder).
                    </p>
                )}

                {mods.map(mod => (
                    <ModRow key={mod.id} mod={mod} gameEdition={game.edition} onToggle={setEnabled} onRemove={remove} />
                ))}
            </Scrollbar>
        </div>
    )
}
