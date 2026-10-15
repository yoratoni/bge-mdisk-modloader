BG&E MDISK Mod Loader
=====================

A mod loader for Beyond Good & Evil - 20th Anniversary Edition.

Work in progress: this build only checks that the loader starts with the game,
it doesn't load any mod yet.

https://github.com/yoratoni/bge-mdisk-modloader

Installation
------------
1. Open the game folder, the one containing "bge.exe" (on Steam: right-click
   the game, Manage, Browse local files).
2. Copy every file of this ZIP into that folder, next to "bge.exe" (not in a
   subfolder). The "licenses" folder isn't needed by the game.
3. Launch the game normally.

Some antivirus software flags "dinput8.dll" (Ultimate ASI Loader), because
loading a DLL from the game folder in place of a system one is also a technique
malware uses. It's open source and is the standard loader for PC game fixes.

Linux and Steam Deck
--------------------
On Linux (Proton), add this to the game's launch options on Steam
(right-click the game, Properties, Launch Options):

    WINEDLLOVERRIDES="dinput8=n,b" %command%

Files
-----
MDiskModLoader.asi     The mod loader itself
MDiskModLoader.ini     Its configuration (optional, every setting has a default)
dinput8.dll            Ultimate ASI Loader, loads the mod loader when the game starts
README.txt             This file, not needed by the game
licenses/              The licenses of the mod loader and of every component it includes

Uninstallation
--------------
Delete "MDiskModLoader.asi", "MDiskModLoader.ini", "MDiskModLoader.log",
this "README.txt" and the "licenses" folder from the game folder. Delete
"dinput8.dll" too, unless another mod in that folder also relies on Ultimate
ASI Loader.

Troubleshooting
---------------
The mod loader writes "MDiskModLoader.log" next to "bge.exe" every time the
game starts:
- No log file: the mod loader wasn't loaded, check that the files are next to
  "bge.exe", and on Linux that the launch option above is set.
- "Ready" at the end of the log, but something looks wrong: open an issue on
  GitHub with your log.

License
-------
Copyright (c) 2026 Adrien Bibollet, released under the MIT License (see
"licenses/MDiskModLoader.txt").
