# Making mods
A mod replaces whole files of the game: entries of the paks in the 20th Anniversary Edition, files of
`sally_clean.bf` in the original edition. It holds the new files as the repository's tools unpack them, and the mod
loader app patches them into the game.

## Layout
A mod is a folder holding a `mod.json`, and one folder per edition it supports:
```text
my-mod/
  mod.json
  paks/                 the 20th Anniversary Edition
    Resources/          one folder per pak, named like the pak without ".pak"
      09001331          an entry, named after its key (8 hex digits) or its name
      09001331.extra    optional, the entry's new extra bytes (the original ones are kept otherwise)
  bf/                   the original edition, sally_clean.bf
    61000001            a file for every build, named after its key
    gog/
      fd10631a          a file for the GOG build only
    steam/
      fd10631a          the same file, for the Steam build only
```

The fields of `mod.json`:
| Field         | Required | Content                                 |
|---------------|----------|-----------------------------------------|
| `name`        | Yes      | The name shown in the app               |
| `version`     | No       | Free text, shown as `v<version>`        |
| `author`      | No       | Shown as `by <author>`                  |
| `description` | No       | A sentence or two, shown under the name |

```json
{
    "name": "MDISK logo",
    "version": "1.0.0",
    "author": "yoratoni",
    "description": "Paints MDISK in magenta on the French main menu logo."
}
```

A mod can hold both editions, each install gets its own part. The app refuses a folder without a `mod.json` naming the
mod, or without any file to replace.

## The tools
The files of a mod come from the Python tools of the repository, set up once (Python 3.11 or newer, `.venv/bin/python`
instead of `.venv/Scripts/python` on Linux):
```bash
git clone https://github.com/yoratoni/bge-mdisk-modloader
cd bge-mdisk-modloader
python -m venv .venv
.venv/Scripts/python -m pip install -r tools/requirements.txt
cp mdisk.example.toml mdisk.toml
```

`mdisk.toml` holds the folder of the 20th Anniversary Edition (`game_dir`), and optionally where the workspace goes
(`workspace_dir`, about 45 GiB once every pak is unpacked). The [README](../README.md#research-tools) lists every tool.

## 20th Anniversary Edition
Copy the paks into the workspace, then unpack the ones to change, layer 1 (the entries as stored) then layer 2
(decompressed):
```bash
.venv/Scripts/python -m tools.copy_game
.venv/Scripts/python -m tools.unpack.unpack_1_bpak --pak "Text-*"
.venv/Scripts/python -m tools.unpack.unpack_2_lz4 --pak "Text-*"
```

Layer 2 holds every entry the way a mod does: `workspace/unpacked/2-lz4/Text-fr/entries/4900fdca`, once edited, goes
in the mod as `paks/Text-fr/4900fdca`, with its `.extra` file if that changes too. Layer 3
(`tools.unpack.unpack_3_identify`) sorts the entries by type, which helps finding the one to change, and the
[research notes](RESEARCH.md#entry-types) describe what's known of each type. The main menu logo, for instance, has
one texture per language: `09001331` (French), `0900133a` (English).

Textures convert to DDS files in layer 4, top-down, one per map: `<key>.dds` is the albedo, the others are
`<key>.normal.dds`, `<key>.spec-gloss-occlusion.dds` and `<key>.height-emissive.dds`. An edited texture goes back into
layer 2, and the mod takes it from there:
```bash
.venv/Scripts/python -m tools.unpack.unpack_3_identify --pak Resources
.venv/Scripts/python -m tools.unpack.unpack_4_convert --pak Resources

# Once workspace/unpacked/4-converted/Resources/tex/09001331.dds is edited
.venv/Scripts/python -m tools.repack.repack_1_convert --pak Resources

# The edited entry is now workspace/unpacked/2-lz4/Resources/entries/09001331
```

The DDS files stay DXT1 or DXT5 (the format of the albedo decides the alpha), every map of a texture keeps the size of
its albedo, the size and the mipmap count are free. A texture whose size changes also changes `texParamTable`, which
then goes in the mod too (`paks/Resources/texParamTable`). The repack step edits layer 2 in place,
`tools.unpack.unpack_1_bpak --pak Resources --force` then layer 2 again bring back the game's version.

## Original edition
The BIG file unpacks in one step, from any build, its compressed files decompressed:
```bash
.venv/Scripts/python -m tools.unpack.unpack_big "<game folder>/sally_clean.bf" --name steam
```

Every file lands in `workspace/unpacked/big/steam/files/`, named after its key, the way a mod holds it.
`workspace/unpacked/big/steam/index.json` gives the name, the folder and the sizes of every key (the folders only
exist in the Steam build). `--filter` unpacks the files whose key, name or path match a glob pattern, e.g. `"*.txg"`.

The Steam build (a 2019 rebuild) and the GOG build (the 2003 data) share 8,920 keys, and 8,193 of these files are
identical (textures, sounds, most of the rest). The binarized worlds and their text (`fd` and `ff` keys) differ. A
file identical in both builds goes in `bf/`. A file that differs is unpacked from both builds and changed in each, the
two versions going in `bf/steam/` and `bf/gog/`. Comparing a key between the two unpacked folders tells which case it
is. Other builds (discs, other regions) aren't known yet: the app only gives them the files of `bf/`.

The menu text has a copy in every binarized world (`ROOT/Bin/*.bin`), one file per world and language, the language in
the key: `fd1...` French, `fd2...` English, `fd3...` German, `fd5...` Italian, 91 worlds each. A text change goes in
all 91.

## Testing
1. Click "Add a mod" in the app and pick the mod's folder.
2. Switch the mod on, click "Apply", and launch the game.
3. Click "Restore the game" once done.

The app copies a mod when it's added, so after editing its files, remove the mod and add it again before applying (or
edit the copy in the app's data folder, `%APPDATA%\mdisk-modloader\mods\<mod>` on Windows).

## Limits
- A mod replaces existing files only, it can't add new ones (new keys).
- A file is replaced whole: two mods replacing the same file don't merge, the one switched on last wins.
- The replaced files are stored uncompressed, a patched archive grows by their full size, and `sally_clean.bf` can't
  grow past 4 GiB.
- What can change inside a file depends on its format, documented in the [research notes](RESEARCH.md) as far as it's
  known. Same-length text edits and texture edits are tested in game, on both editions for the text.
