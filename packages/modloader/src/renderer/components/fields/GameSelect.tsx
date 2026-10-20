import { Button } from "@renderer/components/ui/Button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@renderer/components/ui/Select"
import GAMES_UI_CONSTANTS from "@renderer/lib/constants/games"
import { FolderPlusIcon, RotateCwIcon } from "lucide-react"
import type { Game } from "@/main/types/games"

type GameSelectProps = {
    games: Game[]
    selectedGame: Game | null
    isDetecting: boolean
    onSelect: (gamePath: string) => Promise<void>
    onAdd: () => Promise<void>
    onDetect: () => Promise<void>
}

export default function GameSelect({ games, selectedGame, isDetecting, onSelect, onAdd, onDetect }: GameSelectProps) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <Select value={selectedGame?.path ?? ""} onValueChange={onSelect} disabled={isDetecting || !games.length}>
                <SelectTrigger className="w-80" aria-label="Game">
                    <SelectValue placeholder={isDetecting ? "Looking for the game..." : "No install found"} />
                </SelectTrigger>

                <SelectContent>
                    {games.map(game => (
                        <SelectItem key={game.path} value={game.path}>
                            {GAMES_UI_CONSTANTS.editionNames[game.edition]}
                            <span className="text-muted-foreground">{GAMES_UI_CONSTANTS.sourceNames[game.source]}</span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Button variant="ghost" size="icon-sm" title="Look for the game again" onClick={onDetect}>
                <RotateCwIcon />
            </Button>

            <Button variant="outline" size="md" onClick={onAdd}>
                <FolderPlusIcon />
                Add a folder
            </Button>

            {selectedGame && (
                <span title={selectedGame.path} className="min-w-0 truncate text-xs text-muted-foreground">
                    {selectedGame.path}
                </span>
            )}
        </div>
    )
}
