import { cn } from "@cybearl/cypack/frontend"
import ArchiveList from "@renderer/components/texts/ArchiveList"
import Badge from "@renderer/components/ui/Badge"
import { Button } from "@renderer/components/ui/Button"
import { Switch } from "@renderer/components/ui/Switch"
import { describeGameTarget, describePartTarget, isPartForGame } from "@renderer/lib/utils/mods"
import { Trash2Icon, TriangleAlertIcon } from "lucide-react"
import type { Game } from "@/main/types/games"
import type { Mod } from "@/main/types/mods"

type ModRowProps = {
    mod: Mod
    game: Game
    onToggle: (id: string, isEnabled: boolean) => Promise<void>
    onRemove: (id: string) => Promise<void>
}

export default function ModRow({ mod, game, onToggle, onRemove }: ModRowProps) {
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

                {mod.parts.map(part => (
                    <div
                        key={`${part.edition}-${part.build}`}
                        className={cn(
                            "flex items-center gap-2 text-xs text-muted-foreground",
                            !isPartForGame(part, game) && "opacity-50",
                        )}
                    >
                        <Badge>{describePartTarget(part)}</Badge>
                        <span>
                            Replaces <ArchiveList archives={part.archives} />
                        </span>
                    </div>
                ))}

                {!mod.parts.some(part => isPartForGame(part, game)) && (
                    <p className="flex items-center gap-1.5 text-xs text-warning">
                        <TriangleAlertIcon className="size-3.5 shrink-0" />
                        <span className="pb-1">
                            Nothing for the {describeGameTarget(game)}, skipped on this install
                        </span>
                    </p>
                )}
            </div>

            <Button variant="ghost" size="icon-sm" title={`Remove ${mod.name}`} onClick={() => onRemove(mod.id)}>
                <Trash2Icon />
            </Button>
        </div>
    )
}
