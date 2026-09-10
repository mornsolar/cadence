"""Writes the three extension icons: a soft ring on a transparent ground. No warning colours."""
import struct, zlib, math, pathlib

def png(size, pixels):
    raw = b''.join(b'\x00' + bytes(sum(pixels[y], ())) for y in range(size))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

def render(size):
    ink = (94, 118, 112)   # muted teal-grey
    centre = (size - 1) / 2
    outer = size * 0.44
    inner = size * 0.26
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            d = math.hypot(x - centre, y - centre)
            edge = max(0.0, min(1.0, (outer - d) + 0.5))
            hole = max(0.0, min(1.0, (d - inner) + 0.5))
            alpha = int(255 * edge * hole)
            row.append((*ink, alpha))
        rows.append(row)
    return rows

out = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'icons'
out.mkdir(exist_ok=True)
for size in (16, 48, 128):
    (out / f'icon{size}.png').write_bytes(png(size, render(size)))
print('icons written')
