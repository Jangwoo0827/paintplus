"""build/icon.png -> android launcher icons (legacy + adaptive foreground)."""
from PIL import Image, ImageDraw
import os
root = os.path.join(os.path.dirname(__file__), '..')
src = Image.open(os.path.join(root, 'build', 'icon.png')).convert('RGBA')
res = os.path.join(root, 'android', 'app', 'src', 'main', 'res')
sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for d, s in sizes.items():
    out = os.path.join(res, 'mipmap-' + d)
    ic = src.resize((s, s), Image.LANCZOS)
    ic.save(os.path.join(out, 'ic_launcher.png'))
    # round: circular mask
    m = Image.new('L', (s * 4, s * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, s * 4 - 1, s * 4 - 1), fill=255)
    m = m.resize((s, s), Image.LANCZOS)
    r = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    r.paste(src.resize((s, s), Image.LANCZOS), (0, 0), m)
    r.save(os.path.join(out, 'ic_launcher_round.png'))
    # adaptive foreground: 108dp canvas, glyph in 66dp safe zone
    f = s * 108 // 48
    fg = Image.new('RGBA', (f, f), (0, 0, 0, 0))
    g = int(f * 0.72)
    fg.paste(src.resize((g, g), Image.LANCZOS), ((f - g) // 2, (f - g) // 2))
    fg.save(os.path.join(out, 'ic_launcher_foreground.png'))
open(os.path.join(res, 'values', 'ic_launcher_background.xml'), 'w', encoding='utf-8').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#5B3FD0</color>\n</resources>\n')
print('icons written')
