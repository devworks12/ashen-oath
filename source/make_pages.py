# GitHub Pages bundle: full HTML document + web-app metadata + icons + assets
import os, shutil, json, math
from PIL import Image, ImageDraw, ImageFilter
out = 'pages'; shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
body = open('dist/index.html').read()
head = '''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Ashen Oath"><meta name="theme-color" content="#0a0a0c">
<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" href="icons/icon-192.png">
</head><body>'''
open(f'{out}/index.html', 'w').write(head + body + '</body></html>\n')
for d in ('assets', 'fonts'): shutil.copytree(f'dist/{d}', f'{out}/{d}')
json.dump({ 'name': 'Ashen Oath', 'short_name': 'Ashen Oath', 'start_url': './', 'scope': './', 'display': 'fullscreen',
  'orientation': 'landscape', 'background_color': '#0a0a0c', 'theme_color': '#0a0a0c',
  'icons': [{ 'src': 'icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png' }, { 'src': 'icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any maskable' }] },
  open(f'{out}/manifest.webmanifest', 'w'), indent=1)
open(f'{out}/.nojekyll', 'w').write('')
# icon: a blade over an ember-lit cracked ring on near-black
S = 1024; im = Image.new('RGB', (S, S), (10, 10, 12)); d = ImageDraw.Draw(im)
glow = Image.new('L', (S, S), 0); ImageDraw.Draw(glow).ellipse((S*.18, S*.2, S*.82, S*.84), fill=255)
glow = glow.filter(ImageFilter.GaussianBlur(S*.12)); im.paste((120, 52, 18), (0, 0), glow.point(lambda v: int(v*.55)))
d = ImageDraw.Draw(im); gold = (214, 182, 120); c = S/2
r = S*.30; d.ellipse((c-r, c-r, c+r, c+r), outline=gold, width=int(S*.014))
for a in range(0, 360, 90):  # diamond studs on the ring
  x, y = c + r*math.cos(math.radians(a)), c + r*math.sin(math.radians(a)); k = S*.03
  d.polygon([(x, y-k), (x+k, y), (x, y+k), (x-k, y)], fill=(10, 10, 12), outline=gold, width=int(S*.008))
# blade (point down)
bw, top, bot = S*.045, S*.16, S*.80
d.polygon([(c-bw, top+S*.14), (c+bw, top+S*.14), (c+bw*.9, bot-S*.08), (c, bot), (c-bw*.9, bot-S*.08)], fill=(226, 220, 206))
d.line([(c, top+S*.16), (c, bot-S*.1)], fill=(150, 146, 140), width=int(S*.01))
d.rectangle((c-S*.17, top+S*.105, c+S*.17, top+S*.14), fill=gold)            # crossguard
d.rectangle((c-S*.022, top, c+S*.022, top+S*.105), fill=(92, 64, 44))         # grip
d.ellipse((c-S*.04, top-S*.06, c+S*.04, top+S*.02), fill=gold)                # pommel
os.makedirs(f'{out}/icons')
for n, z in (('apple-touch-icon', 180), ('icon-192', 192), ('icon-512', 512)): im.resize((z, z), Image.LANCZOS).save(f'{out}/icons/{n}.png')
print('ok', sum(os.path.getsize(os.path.join(p, f)) for p, _, fs in os.walk(out) for f in fs) // 1024, 'KB')
