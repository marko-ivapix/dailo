"""Generate Dailo app icons from the sidebar brand mark (css/styles.css `.brand-mark`).

The mark lives on a 30-unit tile: a ring centered at (21, 15) with outer radius 11 and a
smaller ring centered at (9, 15) with outer radius 4; both strokes are 2 units wide, white
at 92% over the primary blue (#0619FE). PNG icons use a full-bleed blue square with the
whole mark scaled into the maskable safe zone, so one design works for iOS, Android and
browsers.

Usage (from the repository root): python3 tools/generate-icons.py
With --native it writes the Capacitor app assets instead (V2.0-b): the iOS App Store icon and launch
images, the Android launcher icons (legacy, round, adaptive foreground), launch images and the white
notification icon `ic_stat_dailo`.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

BLUE = (6, 25, 254)
# rgba(255,255,255,.92) composited over BLUE.
RING = tuple(round(0.92 * 255 + 0.08 * channel) for channel in BLUE)
SUPERSAMPLE = 4
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'icons'
DARK = (15, 17, 20)
WHITE = (255, 255, 255)

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


def draw_mark(draw, canvas, mark_fraction, ring, inner_fill):
    """Draws the two rings centered on a square canvas; inner_fill covers the overlap inside the small ring."""
    unit = canvas * mark_fraction / MARK_RADIUS
    offset_x = canvas / 2 - MARK_CENTER[0] * unit
    offset_y = canvas / 2 - MARK_CENTER[1] * unit
    stroke = round(2 * unit)
    for index, (cx, cy, radius) in enumerate(RINGS):
        box = [offset_x + (cx - radius) * unit, offset_y + (cy - radius) * unit,
               offset_x + (cx + radius) * unit, offset_y + (cy + radius) * unit]
        draw.ellipse(box, fill=inner_fill if index else None, outline=ring, width=stroke)


def foreground(size, mark_fraction):
    """Adaptive-icon foreground: the mark on transparency (the background layer is the blue color)."""
    canvas = size * SUPERSAMPLE
    image = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(image), canvas, mark_fraction, RING + (255,), BLUE + (255,))
    return image.resize((size, size), Image.LANCZOS)


def silhouette(size, mark_fraction):
    """Android notification icon: white rings on transparency, the overlap cut out."""
    canvas = size * SUPERSAMPLE
    image = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(image), canvas, mark_fraction, WHITE + (255,), (0, 0, 0, 0))
    alpha = image.resize((size, size), Image.LANCZOS).getchannel('A')
    result = Image.new('RGBA', (size, size), WHITE + (0,))
    result.putalpha(alpha)
    return result


def masked(image, radius_fraction):
    """Rounds the corners of a square image (0.5 gives a circle) with an antialiased alpha mask."""
    size = image.width
    mask = Image.new('L', (size * SUPERSAMPLE, size * SUPERSAMPLE), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size * SUPERSAMPLE - 1, size * SUPERSAMPLE - 1],
                                           radius=round(size * SUPERSAMPLE * radius_fraction), fill=255)
    result = image.convert('RGBA')
    result.putalpha(mask.resize((size, size), Image.LANCZOS))
    return result


def splash(width, height, tile):
    """Launch image: the rounded blue tile with the mark in the middle of a dark screen."""
    image = Image.new('RGB', (width, height), DARK)
    badge = masked(render(tile, 0.38), 0.22)
    image.paste(badge, ((width - tile) // 2, (height - tile) // 2), badge)
    return image


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)
    print(f'{path.relative_to(ROOT)}: {image.width}x{image.height}')


def native():
    ios = ROOT / 'ios/App/App/Assets.xcassets'
    save(render(1024, 0.38), ios / 'AppIcon.appiconset/AppIcon-512@2x.png')
    for name in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
        save(splash(2732, 2732, 600), ios / 'Splash.imageset' / name)
    res = ROOT / 'android/app/src/main/res'
    splash_sizes = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
    for density, scale in (('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)):
        launcher = round(48 * scale)
        save(render(launcher, 0.38), res / f'mipmap-{density}/ic_launcher.png')
        save(masked(render(launcher, 0.38), 0.5), res / f'mipmap-{density}/ic_launcher_round.png')
        # The adaptive safe zone is a circle of 66/108; the mark stays within it.
        save(foreground(round(108 * scale), 0.28), res / f'mipmap-{density}/ic_launcher_foreground.png')
        save(silhouette(round(24 * scale), 0.46), res / f'drawable-{density}/ic_stat_dailo.png')
        width, height = splash_sizes[density]
        save(splash(width, height, round(min(width, height) * 0.25)), res / f'drawable-port-{density}/splash.png')
        save(splash(height, width, round(min(width, height) * 0.25)), res / f'drawable-land-{density}/splash.png')
    save(splash(480, 320, 80), res / 'drawable/splash.png')


def main():
    if '--native' in sys.argv[1:]:
        native()
        return
    OUT.mkdir(exist_ok=True)
    # 0.38 keeps the mark inside the 40% maskable safe-zone radius (also used for iOS, which rounds
    # the corners itself); plain "any" icons get a little less padding.
    for name, size, fraction in (('apple-touch-icon.png', 180, 0.38), ('icon-192.png', 192, 0.42),
                                 ('icon-512.png', 512, 0.42), ('icon-maskable-512.png', 512, 0.38)):
        render(size, fraction).save(OUT / name, optimize=True)
        print(f'icons/{name}: {size}x{size}')


if __name__ == '__main__':
    main()
