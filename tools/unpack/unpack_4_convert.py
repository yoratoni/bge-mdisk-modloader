"""Layer 4: converts the entries of layer 3 to common formats, for now the textures to DDS and TGA.

Output, one folder per pak with textures in "workspace/unpacked/4-converted/":
- "tex/<key>.dds": the albedo of every cooked texture, "tex/<key>.<map>.dds" for the other maps of the texture sets
  ("normal", "spec-gloss-occlusion", "height-emissive"), with every mipmap level. The game stores its textures
  bottom-up, the maps are flipped to be top-down like every DDS file (by DXT block, the pixel data isn't re-encoded).
- "tex/<key>.tga": the textures that aren't cooked, the TGA file as stored (bottom-up, as its header says).
- "tex/<key>.json": every field of the texture the DDS or TGA files don't hold, enough to rebuild the entry.
- "converted.json": every converted entry and every entry that couldn't be, with the reason, written last.

A cooked texture is only converted when its fields add up to its size and every map holds at least the mipmap chain
its dimensions call for, anything else is reported instead. The bytes a map holds after its chain (the cooker's own
memory, in a single texture) are kept in the metadata.
"""

import argparse
import json
import shutil
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from tools.constants import (
    CONVERTED_INDEX_FILE_NAME,
    COOKED_MAP_NAMES,
    INDEX_FILE_NAME,
    TEXTURE_FILE_TYPE_TGA,
    TEXTURE_TYPE,
    WORKER_THREADS,
)
from tools.formats.converted_texture import (
    cooked_metadata,
    map_file_name,
    metadata_file_name,
    tga_file_name,
    tga_metadata,
)
from tools.formats.dds import PixelFormat, build_dds, flip_vertically, mipmap_chain_size
from tools.formats.texture import Texture, TextureError, parse_header, parse_texture, parse_tga_texture
from tools.paths import CONVERTED_LAYER_DIR, IDENTIFIED_LAYER_DIR
from tools.utils import select_layer_paks


def split_map_chains(texture: Texture, pixel_formats: list[PixelFormat]) -> tuple[list[bytes], dict[str, str]]:
    """Splits every map of a texture into its mipmap chain and the bytes it holds after it.

    Args:
        texture: The texture.
        pixel_formats: The DDS pixel format of every map.

    Returns:
        The mipmap chain of every map, and the bytes after it as hex by map name, for the maps holding more.

    Raises:
        TextureError: If a map holds less than its mipmap chain.
    """
    header = texture.header
    mipmap_count = texture.layout.mipmap_count
    chains: list[bytes] = []
    padding: dict[str, str] = {}

    for index, (map_data, pixel_format) in enumerate(zip(texture.maps, pixel_formats)):
        chain_size = mipmap_chain_size(pixel_format, header.width, header.height, mipmap_count)

        if len(map_data) < chain_size:
            raise TextureError(
                f"map too small ({COOKED_MAP_NAMES[index]} holds {len(map_data)} bytes, {chain_size} expected for "
                f"{header.width}x{header.height} with {mipmap_count} levels)"
            )

        chains.append(map_data[:chain_size])

        if len(map_data) > chain_size:
            padding[COOKED_MAP_NAMES[index]] = map_data[chain_size:].hex()

    return chains, padding


def write_dds_file(texture: Texture, pixel_format: PixelFormat, chain: bytes, dds_path: Path) -> None:
    """Writes the DDS file of one map, flipped to be top-down.

    Args:
        texture: The texture.
        pixel_format: The DDS pixel format of the map.
        chain: The mipmap chain of the map, bottom-up.
        dds_path: The DDS file to write.
    """
    width, height, mipmap_count = texture.header.width, texture.header.height, texture.layout.mipmap_count
    top_down_chain = flip_vertically(pixel_format, width, height, mipmap_count, chain)
    dds_path.write_bytes(build_dds(pixel_format, width, height, mipmap_count, top_down_chain))


def convert_cooked_texture(data: bytes, output_dir: Path, base_name: str) -> tuple[list[str], dict[str, Any]]:
    """Converts a cooked texture to one DDS file per map.

    Args:
        data: The texture entry.
        output_dir: The folder of the converted files.
        base_name: The name of the converted files without extension (the key of the entry).

    Returns:
        The names of the written files, and the metadata of the texture.

    Raises:
        TextureError: If the entry isn't a cooked texture this layer can convert.
    """
    texture = parse_texture(data)
    pixel_formats = [texture.layout.map_pixel_format(index) for index in range(len(texture.maps))]
    chains, padding = split_map_chains(texture, pixel_formats)
    files: list[str] = []

    for index, (chain, pixel_format) in enumerate(zip(chains, pixel_formats)):
        dds_path = output_dir / map_file_name(base_name, index)
        write_dds_file(texture, pixel_format, chain, dds_path)
        files.append(dds_path.name)

    description = f"{texture.set_type_name} {'+'.join(pixel_format.value for pixel_format in pixel_formats)}"

    if padding:
        description += " padded"

    return files, cooked_metadata(texture, description, padding)


def convert_tga_texture(data: bytes, output_dir: Path, base_name: str) -> tuple[list[str], dict[str, Any]]:
    """Converts a texture that isn't cooked to its TGA file.

    Args:
        data: The texture entry.
        output_dir: The folder of the converted files.
        base_name: The name of the converted files without extension (the key of the entry).

    Returns:
        The names of the written files, and the metadata of the texture.
    """
    header, tga_file = parse_tga_texture(data)
    tga_path = output_dir / tga_file_name(base_name)
    tga_path.write_bytes(tga_file)

    return [tga_path.name], tga_metadata(header)


def convert_texture(source_path: Path, output_dir: Path, base_name: str) -> tuple[list[str], str]:
    """Converts a texture to DDS or TGA files and its metadata.

    Args:
        source_path: The texture entry.
        output_dir: The folder of the converted files.
        base_name: The name of the converted files without extension (the key of the entry).

    Returns:
        The converted files, relative to the pak folder, and a short description of the texture for the statistics.

    Raises:
        TextureError: If the entry isn't a texture this layer can convert.
    """
    data = source_path.read_bytes()

    if parse_header(data).file_type == TEXTURE_FILE_TYPE_TGA:
        files, metadata = convert_tga_texture(data, output_dir, base_name)
    else:
        files, metadata = convert_cooked_texture(data, output_dir, base_name)

    metadata_path = output_dir / metadata_file_name(base_name)
    metadata_path.write_text(json.dumps(metadata, indent=1), encoding="utf-8")
    files.append(metadata_path.name)

    return [f"{TEXTURE_TYPE}/{file}" for file in files], metadata["description"]


def convert_pak(input_dir: Path, output_dir: Path) -> tuple[Counter[str], Counter[str]]:
    """Converts the textures of one pak folder of layer 3, the index is written last, so its presence means the pak
    is complete.

    Args:
        input_dir: The pak folder of layer 3.
        output_dir: The pak folder of this layer, replaced if it exists.

    Returns:
        The number of converted textures by description, and the number of skipped ones by reason.
    """
    identified = json.loads((input_dir / INDEX_FILE_NAME).read_text(encoding="utf-8"))
    textures = [(file, item["file"]) for file, item in identified.items() if item["type"] == TEXTURE_TYPE]

    if output_dir.exists():
        shutil.rmtree(output_dir)

    texture_dir = output_dir / TEXTURE_TYPE
    texture_dir.mkdir(parents=True)

    def convert(texture: tuple[str, str]) -> dict[str, Any]:
        file, identified_file = texture

        try:
            files, description = convert_texture(input_dir / identified_file, texture_dir, file)
            return {"files": files, "description": description}
        except TextureError as error:
            return {"error": str(error)}

    with ThreadPoolExecutor(WORKER_THREADS) as executor:
        results = dict(zip((file for file, _ in textures), executor.map(convert, textures)))

    (output_dir / CONVERTED_INDEX_FILE_NAME).write_text(json.dumps(results, indent=1), encoding="utf-8")

    converted = Counter(result["description"] for result in results.values() if "description" in result)

    # The details of a reason follow its parentheses, they're left out of the statistics
    skipped = Counter(result["error"].split(" (")[0] for result in results.values() if "error" in result)

    return converted, skipped


def main() -> None:
    """Converts every selected pak of layer 3 that isn't converted yet."""
    parser = argparse.ArgumentParser(description="Layer 4: converts the entries of layer 3 to common formats")
    parser.add_argument("--pak", default="*", help='Glob pattern on the pak names, e.g. "Text-*" (default: every pak)')
    parser.add_argument("--force", action="store_true", help="Convert again the paks that are already converted")
    args = parser.parse_args()

    input_dirs = select_layer_paks(
        parser, IDENTIFIED_LAYER_DIR, args.pak, "tools.unpack.unpack_3_identify", marker_file_name=INDEX_FILE_NAME
    )

    for input_dir in input_dirs:
        output_dir = CONVERTED_LAYER_DIR / input_dir.name

        if not (input_dir / TEXTURE_TYPE).is_dir():
            continue

        if (output_dir / CONVERTED_INDEX_FILE_NAME).exists() and not args.force:
            print(f"{input_dir.name}: already converted (--force to convert it again)")
            continue

        print(f"{input_dir.name}: converting", flush=True)
        start_time = time.perf_counter()
        converted, skipped = convert_pak(input_dir, output_dir)

        print(f"  converted {sum(converted.values())}: " + ", ".join(f"{d} {n}" for d, n in converted.most_common()))
        print(f"  skipped {sum(skipped.values())}: " + (", ".join(f"{r} {n}" for r, n in skipped.most_common()) or "-"))
        print(f"  Done in {time.perf_counter() - start_time:.1f} s", flush=True)


if __name__ == "__main__":
    main()
