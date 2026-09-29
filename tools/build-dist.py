# Assemble public/: the game files plus only the three.js addons the game imports (and their deps).
# public/ is the Worker's static asset directory (wrangler.jsonc → assets.directory). Do not edit it.
import re, os, shutil, glob
root = 'vendor/three/jsm'
out = 'public'
if os.path.isdir(out):
    shutil.rmtree(out)
os.makedirs(out)
need = set()
for f in glob.glob('src/**/*.js', recursive=True):
    need |= {m for m in re.findall(r"three/addons/([A-Za-z0-9_./-]+\.js)", open(f).read())}
need, seen = list(need), set()
while need:
    f = need.pop()
    if f in seen: continue
    seen.add(f)
    for m in re.findall(r"from\s+['\"](\.[^'\"]+)['\"]", open(os.path.join(root, f)).read()):
        need.append(os.path.normpath(os.path.join(os.path.dirname(f), m)))
for f in seen:
    d = os.path.join(out, 'vendor/three/jsm', f); os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copy(os.path.join(root, f), d)
os.makedirs(os.path.join(out, 'vendor/three/build'), exist_ok=True)
for f in ['three.module.js', 'three.core.js']: shutil.copy('vendor/three/build/' + f, os.path.join(out, 'vendor/three/build', f))
for d in ['src', 'styles', 'assets']: shutil.copytree(d, os.path.join(out, d))
shutil.copy('index.html', os.path.join(out, 'index.html'))
# Same revalidation the dev server sends. Workers already default to this; the file keeps the policy explicit.
open(os.path.join(out, '_headers'), 'w').write('/*\n  Cache-Control: public, max-age=0, must-revalidate\n')
print('public ready:', len(seen), 'addon files')
