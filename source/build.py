import glob
page=open('src/page.html').read()
js='\n'.join(open(f).read() for f in sorted(glob.glob('src/[0-9]*.js')))
imap='''<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"}}</script>'''
out=page+'\n'+imap+'\n<script type="module">\n'+js+'\n</script>\n'
import os; os.makedirs('dist',exist_ok=True)
open('dist/index.html','w').write(out)
# local test harness: full doc
open('dist/test.html','w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>'+out+'</body></html>')
print(len(out))
