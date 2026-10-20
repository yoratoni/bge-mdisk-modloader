import { Button } from "@renderer/components/ui/Button"
import { Switch } from "@renderer/components/ui/Switch"
import GAMES_UI_CONSTANTS from "@renderer/lib/constants/games"
import { describePaks } from "@renderer/lib/utils/mods"
import { Trash2Icon } from "lucide-react"
import type { GameEdition } from "@/main/types/games"
import type { Mod } from "@/main/types/mods"

type ModRowProps = {
    mod: Mod
    gameEdition: GameEdition
    onToggle: (id: string, isEnabled: boolean) => Promise<void>
    onRemove: (id: string) => Promise<void>
}

export default function ModRow({ mod, gameEdition, onToggle, onRemove }: ModRowProps) {
    return (
        <div className="flex items-start gap-4 border-b border-border px-4 py-3">
            <Switch
                className="mt-1"
                checked={mod.isEnabled}
                aria-label={`Enable ${mod.name}`}
                onCheckedChange={isEnabled => onToggle(mod.id, isEnabled)}
            />

            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline gap-2">
                    <span className="font-medium">{mod.name}</span>
                    {mod.version && <span className="text-xs text-muted-foreground">v{mod.version}</span>}
                    {mod.author && <span className="text-xs text-muted-foreground">by {mod.author}</span>}
                </div>

                {mod.description && <p className="text-sm text-muted-foreground">{mod.description}</p>}

                <p className="text-xs text-muted-foreground">{describePaks(mod.paks)}</p>

                {mod.edition !== gameEdition && (
                    <p className="text-xs text-warning">
                        Made for the {GAMES_UI_CONSTANTS.editionNames[mod.edition]}, skipped on this install
                    </p>
                )}
            </div>

            <Button variant="ghost" size="icon-sm" title={`Remove ${mod.name}`} onClick={() => onRemove(mod.id)}>
                <Trash2Icon />
            </Button>
        </div>
    )
}
