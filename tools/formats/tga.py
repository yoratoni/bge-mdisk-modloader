"""TGA files, only checked and measured: the game stores them as is, so an edited TGA must look like the originals,
uncompressed true color (24 or 32 bits) with a bottom-left origin.
"""

from tools.constants import TGA_BIT_DEPTHS, TGA_HEADER, TGA_IMAGE_TYPE_TRUE_COLOR, TGA_TOP_LEFT_ORIGIN


class TgaError(ValueError):
    """A TGA file the game's textures can't be made of."""


def read_tga_size(data: bytes) -> tuple[int, int]:
    """Checks a TGA file and returns its dimensions.

    Args:
        data: The TGA file.

    Returns:
        The width and the height.

    Raises:
        TgaError: If the file isn't an uncompressed true color TGA with a bottom-left origin, or if it holds fewer
            pixels than its dimensions call for.
    """
    if len(data) < TGA_HEADER.size:
        raise TgaError("too short for a TGA header")

    id_length, color_map_type, image_type, _, _, _, _, _, width, height, bit_depth, descriptor = TGA_HEADER.unpack_from(
        data
    )

    if color_map_type != 0 or image_type != TGA_IMAGE_TYPE_TRUE_COLOR or bit_depth not in TGA_BIT_DEPTHS:
        raise TgaError(
            f"image type {image_type} with {bit_depth} bits, save it as uncompressed (no RLE) 24 or 32-bit true color"
        )

    if descriptor & TGA_TOP_LEFT_ORIGIN:
        raise TgaError("top-left origin, save it with a bottom-left origin")

    pixel_data_size = width * height * bit_depth // 8

    if len(data) < TGA_HEADER.size + id_length + pixel_data_size:
        raise TgaError(f"holds fewer pixels than its {width}x{height} dimensions")

    return width, height
