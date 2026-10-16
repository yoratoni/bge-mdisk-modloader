"""DDS files, written around pixel data as is (DXT1, DXT5 or RGBA8), with every mipmap level.

DDS files are top-down while the game stores its textures bottom-up, `flip_vertically` turns one into the other without
decoding the blocks, so the pixel data is never re-encoded.
"""

from enum import Enum

import numpy as np

from tools.constants import (
    DDS_CAPS_MIPMAPS,
    DDS_CAPS_TEXTURE,
    DDS_FLAG_LINEAR_SIZE,
    DDS_FLAG_PITCH,
    DDS_FLAGS,
    DDS_FOURCC_DXT1,
    DDS_FOURCC_DXT5,
    DDS_HEADER,
    DDS_HEADER_SIZE,
    DDS_MAGIC,
    DDS_PIXEL_FORMAT_FOURCC,
    DDS_PIXEL_FORMAT_RGBA,
    DDS_PIXEL_FORMAT_SIZE,
    DDS_RGBA8_MASKS,
    DXT1_BLOCK_SIZE,
    DXT5_ALPHA_INDICES_OFFSET,
    DXT5_ALPHA_INDICES_SIZE,
    DXT5_ALPHA_ROW_BITS,
    DXT5_BLOCK_SIZE,
    DXT_BLOCK_PIXELS,
    DXT_COLOR_BLOCK_SIZE,
    DXT_COLOR_INDICES_OFFSET,
    RGBA8_PIXEL_SIZE,
)


class PixelFormat(Enum):
    """The pixel formats a DDS file can hold here."""

    DXT1 = "dxt1"
    DXT5 = "dxt5"
    RGBA8 = "rgba8"


def level_dimensions(width: int, height: int, level: int) -> tuple[int, int]:
    """Returns the dimensions of a mipmap level, every level half the size of the previous one.

    Args:
        width: The width of the first level.
        height: The height of the first level.
        level: The index of the level.

    Returns:
        The width and the height of the level.
    """
    return max(1, width >> level), max(1, height >> level)


def level_size(pixel_format: PixelFormat, width: int, height: int) -> int:
    """Returns the size of one mipmap level.

    Args:
        pixel_format: The pixel format.
        width: The width of the level.
        height: The height of the level.

    Returns:
        The size in bytes, DXT levels are made of 4x4 blocks (a level smaller than a block takes a whole one).
    """
    if pixel_format == PixelFormat.RGBA8:
        return width * height * RGBA8_PIXEL_SIZE

    block_size = DXT5_BLOCK_SIZE if pixel_format == PixelFormat.DXT5 else DXT1_BLOCK_SIZE
    block_columns = max(1, (width + DXT_BLOCK_PIXELS - 1) // DXT_BLOCK_PIXELS)
    block_rows = max(1, (height + DXT_BLOCK_PIXELS - 1) // DXT_BLOCK_PIXELS)

    return block_columns * block_rows * block_size


def mipmap_chain_size(pixel_format: PixelFormat, width: int, height: int, mipmap_count: int) -> int:
    """Returns the size of a mipmap chain.

    Args:
        pixel_format: The pixel format.
        width: The width of the first level.
        height: The height of the first level.
        mipmap_count: The number of levels.

    Returns:
        The size in bytes.
    """
    return sum(
        level_size(pixel_format, *level_dimensions(width, height, level)) for level in range(mipmap_count)
    )


def flip_alpha_indices(blocks: np.ndarray, pixel_rows: int) -> None:
    """Flips the pixel rows of the alpha indices of DXT5 blocks, in place.

    Args:
        blocks: The blocks, the last axis holding the bytes of a block.
        pixel_rows: The number of pixel rows used in a block, the first ones (4, or less in a level smaller than a
            block).
    """
    index_bytes = blocks[..., DXT5_ALPHA_INDICES_OFFSET : DXT5_ALPHA_INDICES_OFFSET + DXT5_ALPHA_INDICES_SIZE]
    row_mask = np.uint64((1 << DXT5_ALPHA_ROW_BITS) - 1)
    indices = np.zeros(blocks.shape[:-1], np.uint64)

    for byte in range(DXT5_ALPHA_INDICES_SIZE):
        indices |= index_bytes[..., byte].astype(np.uint64) << np.uint64(8 * byte)

    rows = [(indices >> np.uint64(DXT5_ALPHA_ROW_BITS * row)) & row_mask for row in range(DXT_BLOCK_PIXELS)]
    rows[:pixel_rows] = rows[:pixel_rows][::-1]
    flipped_indices = np.zeros_like(indices)

    for row, row_indices in enumerate(rows):
        flipped_indices |= row_indices << np.uint64(DXT5_ALPHA_ROW_BITS * row)

    for byte in range(DXT5_ALPHA_INDICES_SIZE):
        index_bytes[..., byte] = (flipped_indices >> np.uint64(8 * byte)) & np.uint64(0xFF)


def flip_level(pixel_format: PixelFormat, width: int, height: int, data: bytes) -> bytes:
    """Flips one mipmap level vertically.

    DXT levels are flipped by block: the block rows are reversed, then the pixel rows inside every block. When the
    height isn't a multiple of 4 (only in the small levels of textures whose size isn't a power of two), the padding
    rows of the last block row end up at the top, which shifts the level by up to 3 pixel rows. The flip is still its
    own inverse, so flipping twice gives back the exact data.

    Args:
        pixel_format: The pixel format.
        width: The width of the level.
        height: The height of the level.
        data: The pixel data of the level.

    Returns:
        The flipped pixel data.
    """
    pixels = np.frombuffer(data, np.uint8)

    if pixel_format == PixelFormat.RGBA8:
        return pixels.reshape(height, width * RGBA8_PIXEL_SIZE)[::-1].tobytes()

    block_size = DXT5_BLOCK_SIZE if pixel_format == PixelFormat.DXT5 else DXT1_BLOCK_SIZE
    block_rows = max(1, (height + DXT_BLOCK_PIXELS - 1) // DXT_BLOCK_PIXELS)
    blocks = pixels.reshape(block_rows, -1, block_size)[::-1].copy()

    # A level smaller than a block only uses its first pixel rows, the others are left in place
    pixel_rows = min(height, DXT_BLOCK_PIXELS)

    color_indices_start = block_size - DXT_COLOR_BLOCK_SIZE + DXT_COLOR_INDICES_OFFSET
    color_indices = slice(color_indices_start, color_indices_start + pixel_rows)
    blocks[..., color_indices] = blocks[..., color_indices][..., ::-1].copy()

    if pixel_format == PixelFormat.DXT5:
        flip_alpha_indices(blocks, pixel_rows)

    return blocks.tobytes()


def flip_vertically(pixel_format: PixelFormat, width: int, height: int, mipmap_count: int, data: bytes) -> bytes:
    """Flips every mipmap level of a chain vertically (see `flip_level`).

    Args:
        pixel_format: The pixel format.
        width: The width of the first level.
        height: The height of the first level.
        mipmap_count: The number of levels.
        data: The pixel data, every level after the previous one.

    Returns:
        The flipped pixel data.
    """
    levels: list[bytes] = []
    position = 0

    for level in range(mipmap_count):
        level_width, level_height = level_dimensions(width, height, level)
        size = level_size(pixel_format, level_width, level_height)
        levels.append(flip_level(pixel_format, level_width, level_height, data[position : position + size]))
        position += size

    return b"".join(levels)


def build_dds(pixel_format: PixelFormat, width: int, height: int, mipmap_count: int, data: bytes) -> bytes:
    """Builds a DDS file.

    Args:
        pixel_format: The pixel format of the data.
        width: The width of the first level.
        height: The height of the first level.
        mipmap_count: The number of levels in the data.
        data: The pixel data, top-down, every level after the previous one.

    Returns:
        The DDS file.
    """
    first_level_size = level_size(pixel_format, width, height)

    if pixel_format == PixelFormat.RGBA8:
        flags = DDS_FLAGS | DDS_FLAG_PITCH
        pitch_or_linear_size = width * RGBA8_PIXEL_SIZE
        pixel_format_fields = (DDS_PIXEL_FORMAT_RGBA, b"\0\0\0\0", RGBA8_PIXEL_SIZE * 8, *DDS_RGBA8_MASKS)
    else:
        flags = DDS_FLAGS | DDS_FLAG_LINEAR_SIZE
        pitch_or_linear_size = first_level_size
        fourcc = DDS_FOURCC_DXT5 if pixel_format == PixelFormat.DXT5 else DDS_FOURCC_DXT1
        pixel_format_fields = (DDS_PIXEL_FORMAT_FOURCC, fourcc, 0, 0, 0, 0, 0)

    caps = DDS_CAPS_TEXTURE | (DDS_CAPS_MIPMAPS if mipmap_count > 1 else 0)

    header = DDS_HEADER.pack(
        DDS_MAGIC,
        DDS_HEADER_SIZE,
        flags,
        height,
        width,
        pitch_or_linear_size,
        0,
        mipmap_count,
        DDS_PIXEL_FORMAT_SIZE,
        *pixel_format_fields,
        caps,
        0,
        0,
        0,
        0,
    )

    return header + data
