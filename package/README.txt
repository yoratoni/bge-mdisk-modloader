BG&E MDISK Mod Loader, in-game toolbox
======================================

The in-game part of the BG&E MDISK Mod Loader, for Beyond Good & Evil - 20th
Anniversary Edition. It's meant for mod makers: it logs the build of the game
it runs in and, with "TraceLoads = 1" in "MDiskModLoader.ini", records every
file the game loads, with its type and the file that referenced it.

Playing mods doesn't need it: the mod loader app installs them, download it
from the same release.

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
MDiskModLoader.asi     The toolbox itself
MDiskModLoader.ini     Its configuration (optional, every setting has a default)
dinput8.dll            Ultimate ASI Loader, loads the toolbox when the game starts
README.txt             This file, not needed by the game
licenses/              The licenses of the toolbox and of every component it includes

Load traces
-----------
With "TraceLoads = 1" in the [Debug] section of "MDiskModLoader.ini", the
toolbox writes "MDiskModLoader.loads.tsv" next to "bge.exe" while playing. The
research tools of the repository read it to identify the game's files (see the
README on GitHub).

Uninstallation
--------------
Delete "MDiskModLoader.asi", "MDiskModLoader.ini", "MDiskModLoader.log",
"MDiskModLoader.loads.tsv", this "README.txt" and the "licenses" folder from
the game folder. Delete "dinput8.dll" too, unless another mod in that folder
also relies on Ultimate ASI Loader.

Troubleshooting
---------------
The toolbox writes "MDiskModLoader.log" next to "bge.exe" every time the game
starts:
- No log file: the toolbox wasn't loaded, check that the files are next to
  "bge.exe", and on Linux that the launch option above is set.
- "Ready" at the end of the log, but something looks wrong: open an issue on
  GitHub with your log.

License
-------
Copyright (c) 2026 Adrien Bibollet, released under the MIT License (see
"licenses/MDiskModLoader.txt").
