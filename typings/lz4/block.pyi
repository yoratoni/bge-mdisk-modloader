# Type stubs for "lz4.block" (python-lz4 4.4), only the parameters the tools use

from typing import Literal

class LZ4BlockError(Exception): ...

def compress(
    source: bytes | bytearray | memoryview,
    mode: Literal["default", "fast", "high_compression"] = "default",
    acceleration: int = 1,
    compression: int = 9,
    store_size: bool = True,
) -> bytes: ...
def decompress(
    source: bytes | bytearray | memoryview,
    uncompressed_size: int = -1,
) -> bytes: ...
