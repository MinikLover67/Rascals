# Renders every logo raster from the new SVG mark via headless Chromium,
# then derives all Tauri icon sizes + .ico/.icns with Pillow.
# Usage: python3 scripts/render_icons.py   (run from repo root)
import os, subprocess, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = '/tmp/icons'
os.makedirs(TMP, exist_ok=True)

EXE = os.path.expanduser('~/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome')
from playwright.sync_api import sync_playwright

JOBS = [
    # (svg, out, transparent) — tile renders MUST be transparent outside the
    # rounded corners, or the desktop icon shows white edges (0.1.52 bug).
    ('docs/branding/logo-mark-hero.svg', f'{TMP}/hero.png', True),
    ('docs/branding/logo-mark-white.svg', f'{TMP}/white.png', True),
    ('docs/branding/logo-mark.svg', f'{TMP}/mark.png', True),
    ('docs/branding/logo-full.svg', f'{TMP}/full.png', False),
]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=EXE, headless=True,
                                args=['--no-sandbox', '--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 600, 'height': 600}, device_scale_factor=4)
    for svg, out, transparent in JOBS:
        page.goto(f'file://{ROOT}/{svg}')
        page.locator('svg').screenshot(path=out, omit_background=transparent)
        print('shot', out)
    browser.close()

hero = Image.open(f'{TMP}/hero.png').convert('RGBA')
mark = Image.open(f'{TMP}/mark.png').convert('RGBA')
white = Image.open(f'{TMP}/white.png').convert('RGBA')
full = Image.open(f'{TMP}/full.png').convert('RGBA')
print('rendered:', hero.size, mark.size, white.size, full.size)

def save(img, path, size=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = img if size is None else img.resize((size, size), Image.LANCZOS)
    im.save(path)

icons = f'{ROOT}/src-tauri/icons'
# Square + classic sizes
for name, size in [
    ('32x32.png', 32), ('64x64.png', 64), ('128x128.png', 128), ('128x128@2x.png', 256),
    ('icon.png', 512), ('Square30x30Logo.png', 30), ('Square44x44Logo.png', 44),
    ('Square71x71Logo.png', 71), ('Square89x89Logo.png', 89), ('Square107x107Logo.png', 107),
    ('Square142x142Logo.png', 142), ('Square150x150Logo.png', 150),
    ('Square284x284Logo.png', 284), ('Square310x310Logo.png', 310), ('StoreLogo.png', 50),
]:
    save(hero, f'{icons}/{name}', size)

# Windows .ico (multi-size)
hero.resize((256, 256), Image.LANCZOS).save(
    f'{icons}/icon.ico', format='ICO',
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# macOS .icns — Pillow writes a multi-image icns from a 1024 source
big = hero.resize((1024, 1024), Image.LANCZOS)
try:
    big.save(f'{icons}/icon.icns', format='ICNS',
             append_images=[big.resize((512, 512), Image.LANCZOS),
                            big.resize((256, 256), Image.LANCZOS),
                            big.resize((128, 128), Image.LANCZOS),
                            big.resize((64, 64), Image.LANCZOS),
                            big.resize((32, 32), Image.LANCZOS),
                            big.resize((16, 16), Image.LANCZOS)])
    print('icns ok')
except Exception as e:
    print('ICNS FAILED:', e)

# android / ios subfolders: regenerate every png found there from the source
for sub in ('android', 'ios'):
    d = f'{icons}/{sub}'
    if not os.path.isdir(d):
        continue
    for dirpath, _, files in os.walk(d):
        for fn in files:
            if not fn.endswith('.png'):
                continue
            p = os.path.join(dirpath, fn)
            w, h = Image.open(p).size
            if w == h:
                hero.resize((w, h), Image.LANCZOS).convert('RGBA').save(p)
            else:
                # non-square (splash-ish): paste mark centered on dark bg
                canvas = Image.new('RGBA', (w, h), (10, 10, 14, 255))
                s = min(w, h)
                m = hero.resize((s, s), Image.LANCZOS)
                canvas.alpha_composite(m, ((w - s) // 2, (h - s) // 2))
                canvas.convert('RGB').save(p)
            print('regen', os.path.relpath(p, ROOT), (w, h))

# branding PNG + web favicon preview
save(hero, f'{ROOT}/docs/branding/logo-full.png')  # keep name; new mark tile
print('DONE')
