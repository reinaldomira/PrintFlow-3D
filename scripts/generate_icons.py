import zlib
import struct
import math
import os

def create_png(width, height, draw_func):
    pixels = bytearray()
    for y in range(height):
        pixels.append(0) # filter byte: none
        for x in range(width):
            r, g, b, a = draw_func(x, y, width, height)
            pixels.extend((int(r), int(g), int(b), int(a)))
            
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    compressed = zlib.compress(bytes(pixels), level=6)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', compressed) + chunk(b'IEND', b'')

def render_icon(x, y, w, h, is_maskable=False):
    # Normalized coords (-1 to 1)
    nx = (x / w) * 2.0 - 1.0
    ny = (y / h) * 2.0 - 1.0
    
    # Background: dark zinc gradient
    grad = (y / h)
    bg_r = 9 + int(15 * grad)
    bg_g = 9 + int(15 * grad)
    bg_b = 11 + int(15 * grad)

    # For non-maskable, rounded corners
    if not is_maskable:
        # Corner radius check
        corner_r = 0.22
        cx = abs(nx) - (1.0 - corner_r)
        cy = abs(ny) - (1.0 - corner_r)
        if cx > 0 and cy > 0:
            dist = math.hypot(cx, cy)
            if dist > corner_r:
                return (0, 0, 0, 0)
    
    # Outer border
    dist_edge = max(abs(nx), abs(ny))
    if not is_maskable and dist_edge > 0.96:
        return (39, 39, 42, 255) # zinc-800 border

    # Scale content
    scale = 0.85 if is_maskable else 1.0
    sx = nx / scale
    sy = (ny + 0.12) / scale

    # 3D Isometric Cube definition
    # Top face: diamond from (0, -0.45) to (0.35, -0.25) to (0, -0.05) to (-0.35, -0.25)
    # Check if point is inside isometric top face
    # Left face: (-0.35, -0.25) to (0, -0.05) to (0, 0.40) to (-0.35, 0.20)
    # Right face: (0, -0.05) to (0.35, -0.25) to (0.35, 0.20) to (0, 0.40)

    # Transform to isometric coordinates:
    # u = sx / 0.35, v = (sy + 0.25) / 0.20
    # Top face: |u| + |v| <= 1 where center is (0, -0.25)
    top_center_y = -0.25
    u_top = abs(sx) / 0.38
    v_top = abs(sy - top_center_y) / 0.20
    if u_top + v_top <= 1.0 and sy <= -0.05:
        # Inside top face: bright emerald gradient
        factor = (sx + 0.38) / 0.76
        r = int(52 + (16 - 52) * factor)
        g = int(211 + (185 - 211) * factor)
        b = int(153 + (129 - 153) * factor)
        return (r, g, b, 255)

    # Left face
    # -0.38 <= sx <= 0, and y between top edge and bottom edge
    # Top edge: y = -0.05 - (sx / -0.38) * 0.20 => y = -0.05 + sx * 0.526
    # Bottom edge: top edge + 0.42
    if -0.38 <= sx <= 0:
        top_edge = -0.05 + sx * 0.526
        bottom_edge = top_edge + 0.44
        if top_edge <= sy <= bottom_edge:
            # Layer lines effect
            layer_factor = int((sy - top_edge) * 50) % 4
            if layer_factor == 0:
                return (16, 185, 129, 255) # emerald-500
            else:
                return (4, 120, 87, 255)   # emerald-700

    # Right face
    # 0 <= sx <= 0.38
    if 0 < sx <= 0.38:
        top_edge = -0.05 - sx * 0.526
        bottom_edge = top_edge + 0.44
        if top_edge <= sy <= bottom_edge:
            layer_factor = int((sy - top_edge) * 50) % 4
            if layer_factor == 0:
                return (52, 211, 153, 255) # emerald-400
            else:
                return (6, 95, 70, 255)    # emerald-800

    # Extruder Nozzle
    if -0.08 <= sx <= 0.08 and -0.70 <= sy <= -0.50:
        # Trapezoid nozzle
        trap_top = -0.70
        trap_bot = -0.50
        prog = (sy - trap_top) / (trap_bot - trap_top)
        w_nozzle = 0.08 - 0.06 * prog
        if abs(sx) <= w_nozzle:
            return (244, 244, 245, 255) # white / metallic

    # Filament line
    if abs(sx) <= 0.02 and -0.85 <= sy < -0.70:
        return (52, 211, 153, 255) # bright emerald filament

    # Glow around nozzle point
    dist_tip = math.hypot(sx, sy - (-0.48))
    if dist_tip < 0.03:
        return (110, 231, 183, 255)

    # Bottom letters "PF" stylized shape if in area
    # Or clean background
    return (bg_r, bg_g, bg_b, 255)

os.makedirs('./public', exist_ok=True)

with open('./public/pwa-192x192.png', 'wb') as f:
    f.write(create_png(192, 192, lambda x,y,w,h: render_icon(x, y, w, h, False)))

with open('./public/pwa-512x512.png', 'wb') as f:
    f.write(create_png(512, 512, lambda x,y,w,h: render_icon(x, y, w, h, False)))

with open('./public/pwa-maskable-512x512.png', 'wb') as f:
    f.write(create_png(512, 512, lambda x,y,w,h: render_icon(x, y, w, h, True)))

with open('./public/apple-touch-icon.png', 'wb') as f:
    f.write(create_png(180, 180, lambda x,y,w,h: render_icon(x, y, w, h, False)))

with open('./public/favicon.ico', 'wb') as f:
    # 32x32 PNG inside favicon or standard 32x32
    f.write(create_png(32, 32, lambda x,y,w,h: render_icon(x, y, w, h, False)))

print('Successfully generated all PWA icons!')
