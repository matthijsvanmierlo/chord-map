#!/usr/bin/env python3
"""Regenerate the precache list and cache VERSION in sw.js from the files on disk.
Run after changing any app file:  python3 scripts/update-sw.py
"""
import hashlib, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
INCLUDE = ['index.html', 'manifest.webmanifest', 'css', 'js', 'assets', 'vendor']
SKIP_SUFFIX = {'.py', '.sh', '.md'}

files = []
for entry in INCLUDE:
    p = ROOT / entry
    items = [p] if p.is_file() else sorted(x for x in p.rglob('*') if x.is_file())
    for f in items:
        if f.suffix in SKIP_SUFFIX or f.name == 'manifest.json':
            continue
        files.append(f)

h = hashlib.sha256()
for f in files:
    h.update(str(f.relative_to(ROOT)).encode())
    h.update(f.read_bytes())
version = h.hexdigest()[:12]
paths = ['./'] + ['./' + str(f.relative_to(ROOT)).replace('\\', '/') for f in files]

sw = (ROOT / 'sw.js').read_text()
block = "const VERSION = '%s';\nconst PRECACHE = [\n%s\n];\n// <<PRECACHE-END>>" % (
    version, ',\n'.join(f"  '{p}'" for p in paths))
sw = re.sub(r"const VERSION = .*?// <<PRECACHE-END>>", lambda m: block, sw, flags=re.S)
(ROOT / 'sw.js').write_text(sw)
print(f'sw.js: {len(paths)} files, version {version}')
