#!/usr/bin/env python3
# Assemble the brag GIF/MP4/poster from the captured frames with holds on
# the key beats so the demo reads at a human pace (~12 s at 12 fps).
import glob, os, subprocess
from PIL import Image

SRC = sorted(glob.glob('/tmp/brag/*.png'))
OUT = '/home/z/my-project/Rascals/docs'
TMP = '/tmp/brag-asm'
os.makedirs(TMP, exist_ok=True)
assert len(SRC) >= 25, f'only {len(SRC)} frames'

# holds per frame index (0-based); key beats breathe, transitions are quick
HOLDS = {
    0: 3, 1: 4,                                   # name typed
    2: 2, 3: 2,                                   # create click
    4: 6, 5: 7, 6: 3,                             # invite card + code
    7: 2,                                         # escape
    8: 4, 9: 5,                                   # chat open, history
}
DEFAULT = 2
seq = []
for i, f in enumerate(SRC):
    seq += [f] * HOLDS.get(i, DEFAULT)
# closing hold on the final look
seq += [SRC[-1]] * 6
print('frames total:', len(seq))

W, H = 960, 600
for n, f in enumerate(seq):
    im = Image.open(f).convert('RGB').resize((W, H), Image.LANCZOS)
    im.save(f'{TMP}/{n:05d}.png')
print('scaled + held')

# MP4 (h264, yuv420p)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '12',
                '-i', f'{TMP}/%05d.png', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                '-crf', '20', '-movflags', '+faststart', f'{OUT}/brag.mp4'], check=True)

# GIF: two-pass palette for clean colors
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '12',
                '-i', f'{TMP}/%05d.png', '-vf', 'palettegen=max_colors=128',
                f'{TMP}/palette.png'], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '12',
                '-i', f'{TMP}/%05d.png', '-i', f'{TMP}/palette.png',
                '-lavfi', 'paletteuse=dither=bayer:bayer_scale=4',
                f'{OUT}/brag.gif'], check=True)

# poster: the chat-with-new-accent beat (near the end, before final hold)
poster_src = SRC[-4]
Image.open(poster_src).convert('RGB').resize((1200, 750), Image.LANCZOS).save(
    f'{OUT}/branding/brag-poster.jpg', quality=88)

gif_mb = os.path.getsize(f'{OUT}/brag.gif') / 1e6
mp4_mb = os.path.getsize(f'{OUT}/brag.mp4') / 1e6
dur = len(seq) / 12
print(f'brag.gif  {gif_mb:.1f} MB')
print(f'brag.mp4  {mp4_mb:.1f} MB')
print(f'duration  {dur:.1f} s @ 12 fps')
