"""Installs the paks rebuilt in "workspace/repacked/" into the game folder, or restores the game's originals.

The first time a pak is installed, the game's original is copied to "workspace/backups/" (mirroring the game folder
layout), "--restore" copies it back. Steam's "Verify integrity of game files" also restores every original.
"""

import argparse
import shutil
from pathlib import Path

from tools.paths import BACKUPS_DIR, PAKS_RELATIVE_DIR, REPACKED_DIR
from tools.utils import add_game_argument, check_game_dir, format_size, patch_record_path


def install_pak(pak_path: Path, game_dir: Path) -> None:
    """Installs one rebuilt pak, backing up the game's original first.

    Args:
        pak_path: The rebuilt pak.
        game_dir: The game folder.
    """
    game_pak_path = game_dir / PAKS_RELATIVE_DIR / pak_path.name
    backup_path = BACKUPS_DIR / PAKS_RELATIVE_DIR / pak_path.name

    # Only the first install backs up, later ones would back up a pak installed by this script
    if not backup_path.exists():
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(game_pak_path, backup_path)
        print(f"{pak_path.name}: original backed up ({format_size(backup_path.stat().st_size)})", flush=True)

    shutil.copy2(pak_path, game_pak_path)
    print(f"{pak_path.name}: installed ({format_size(pak_path.stat().st_size)})", flush=True)


def restore_pak(backup_path: Path, game_dir: Path) -> None:
    """Restores the game's original of one pak and deletes its backup.

    Args:
        backup_path: The backup of the original pak.
        game_dir: The game folder.
    """
    shutil.copy2(backup_path, game_dir / PAKS_RELATIVE_DIR / backup_path.name)
    backup_path.unlink()
    print(f"{backup_path.name}: original restored", flush=True)


def main() -> None:
    """Installs or restores every selected pak."""
    parser = argparse.ArgumentParser(description="Installs the rebuilt paks into the game, or restores the originals")
    parser.add_argument("--pak", default="*", help='Glob pattern on the pak names, e.g. "Text-*" (default: every pak)')
    parser.add_argument("--restore", action="store_true", help="Restore the game's originals instead of installing")
    add_game_argument(parser)
    args = parser.parse_args()
    game_dir = check_game_dir(parser, args.game)

    if args.restore:
        backup_paths = sorted((BACKUPS_DIR / PAKS_RELATIVE_DIR).glob(f"{args.pak}.pak"))

        if not backup_paths:
            parser.error(f"no backed up pak matches {args.pak!r}, nothing to restore")

        for backup_path in backup_paths:
            restore_pak(backup_path, game_dir)
    else:
        pak_paths = sorted(REPACKED_DIR.glob(f"{args.pak}.pak"))

        if not pak_paths:
            parser.error(
                f"no rebuilt pak matches {args.pak!r} in {REPACKED_DIR} (run tools.repack.repack_3_bpak --keep first)"
            )

        for pak_path in pak_paths:
            # Installing over a patched pak would back it up as the game's original
            if patch_record_path(PAKS_RELATIVE_DIR / pak_path.name).exists():
                print(f"{pak_path.name}: left as is, patched by tools.patch_paks (restore it with --restore there)")
                continue

            install_pak(pak_path, game_dir)


if __name__ == "__main__":
    main()
