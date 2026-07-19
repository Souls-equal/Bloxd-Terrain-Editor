"""
Low-level .bloxdschem (Avro-based) binary writer.
Reverse engineered from the real Bloxd.io <-> Minecraft schematic converter
(Quentin-X/M2B, src/bloxd.js), which uses `avsc` to write records with this
schema (schema0 / version 0 header):

record Schematic {
    fixed(4) headers = 0x00 0x00 0x00 0x00
    string   name
    int      x, y, z
    int      sizeX, sizeY, sizeZ
    array<record{ int x, y, z; bytes blocks }> chunks
}

`blocks` bytes payload = run-length-encoded block ids using PLAIN
(non-zigzag) unsigned LEB128 pairs: (amount, blockId), repeated, covering
all 32768 cells of a 32x32x32 chunk, in index order local_x*1024 + local_y*32 + local_z.
"""

import struct


def _uvarint(n: int) -> bytes:
    """Unsigned LEB128 varint (also the low-level encoding avro zigzag values use)."""
    out = bytearray()
    n = int(n)
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            break
    return bytes(out)


def avro_int(n: int) -> bytes:
    """Avro zigzag-encoded int/long."""
    n = int(n)
    zz = (n << 1) if n >= 0 else ((-n << 1) - 1)
    return _uvarint(zz)


def avro_string(s: str) -> bytes:
    b = s.encode("utf-8")
    return avro_int(len(b)) + b


def avro_bytes(b: bytes) -> bytes:
    return avro_int(len(b)) + b


def rle_encode_blocks(block_ids) -> bytes:
    """
    block_ids: flat sequence (list or 1D numpy array) of exactly 32768 ints,
    in local_x*1024 + local_y*32 + local_z order.
    Returns the RLE (amount, id) LEB128-pair encoded bytes, matching
    the JS `write()` RLE loop in bloxd.js exactly (including its off-by-one
    "process index len==length" quirk which flushes the final run).
    """
    out = bytearray()
    n = len(block_ids)
    if n == 0:
        return bytes(out)
    curr_id = int(block_ids[0])
    curr_amt = 1
    for i in range(1, n + 1):
        bid = int(block_ids[i]) if i < n else None
        if bid == curr_id:
            curr_amt += 1
        else:
            out += _uvarint(curr_amt)
            out += _uvarint(curr_id)
            curr_amt = 1
            curr_id = bid
    return bytes(out)


class BloxdSchemWriter:
    """
    Streaming writer for a single .bloxdschem file (schema0 / version 0).
    Chunks are written in Avro "array of blocks" style so we never need to
    hold the full chunk list in memory: call add_chunk() repeatedly, then
    finish().
    """

    def __init__(self, f, name: str, size_x: int, size_y: int, size_z: int,
                 pos=(0, 0, 0)):
        self.f = f
        self._chunk_count = 0
        self._buffer = bytearray()
        self._flush_every = 512  # chunks per avro array "block"

        # header
        self.f.write(b"\x00\x00\x00\x00")
        self.f.write(avro_string(name))
        self.f.write(avro_int(pos[0]))
        self.f.write(avro_int(pos[1]))
        self.f.write(avro_int(pos[2]))
        self.f.write(avro_int(size_x))
        self.f.write(avro_int(size_y))
        self.f.write(avro_int(size_z))

    def add_chunk(self, cx: int, cy: int, cz: int, rle_bytes: bytes):
        self._buffer += avro_int(cx)
        self._buffer += avro_int(cy)
        self._buffer += avro_int(cz)
        self._buffer += avro_bytes(rle_bytes)
        self._chunk_count += 1
        if self._chunk_count >= self._flush_every:
            self._flush_block()

    def _flush_block(self):
        if self._chunk_count == 0:
            return
        self.f.write(avro_int(self._chunk_count))
        self.f.write(bytes(self._buffer))
        self._buffer = bytearray()
        self._chunk_count = 0

    def finish(self):
        self._flush_block()
        # terminating empty block for the array
        self.f.write(avro_int(0))
