"""Generate Dailo app icons from the sidebar brand mark (css/styles.css `.brand-mark`).

The mark lives on a 30-unit tile: a ring centered at (21, 15) with outer radius 11 and a
smaller ring centered at (9, 15) with outer radius 4; both strokes are 2 units wide, white
at 92% over the primary blue (#0619FE). PNG icons use a full-bleed blue square with the
whole mark scaled into the maskable safe zone, so one design works for iOS, Android and
browsers.

Usage (from the repository root): python3 tools/generate-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

BLUE = (6, 25, 254)
# rgba(255,255,255,.92) composited over BLUE.
RING = tuple(round(0.92 * 255 + 0.08 * channel) for channel in BLUE)
SUPERSAMPLE = 4
OUT = Path(__file__).resolve().parent.parent / 'icons'

# Rings (center x, center y, outer radius) in brand-mark units; the mark's bounding circle
# is centered at (18.5, 15) with radius 13.5 units.
RINGS = ((21, 15, 11), (9, 15, 4))
MARK_CENTER = (18.5, 15)
MARK_RADIUS = 13.5


def render(size, mark_fraction):
    """Full-bleed blue square with the mark fitted into a circle of size * mark_fraction."""
    canvas = size * SUPERSAMPLE
    unit = canvas * mark_fraction / MARK_RADIUS
    offset_x = canvas / 2 - MARK_CENTER[0] * unit
    offset_y = canvas / 2 - MARK_CENTER[1] * unit
    image = Image.new('RGB', (canvas, canvas), BLUE)
    draw = ImageDraw.Draw(image)
    stroke = round(2 * unit)
    for index, (cx, cy, radius) in enumerate(RINGS):
        box = [offset_x + (cx - radius) * unit, offset_y + (cy - radius) * unit,
               offset_x + (cx + radius) * unit, offset_y + (cy + radius) * unit]
        # The small ring is drawn last with a blue fill, covering the large ring where they overlap.
        draw.ellipse(box, fill=BLUE if index else None, outline=RING, width=stroke)
    return image.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    # 0.38 keeps the mark inside the 40% maskable safe-zone radius (also used for iOS, which rounds
    # the corners itself); plain "any" icons get a little less padding.
    for name, size, fraction in (('apple-touch-icon.png', 180, 0.38), ('icon-192.png', 192, 0.42),
                                 ('icon-512.png', 512, 0.42), ('icon-maskable-512.png', 512, 0.38)):
        render(size, fraction).save(OUT / name, optimize=True)
        print(f'icons/{name}: {size}x{size}')


if __name__ == '__main__':
    main()
