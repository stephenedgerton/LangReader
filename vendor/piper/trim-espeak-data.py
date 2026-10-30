# Rewrite piper_phonemize's Emscripten preload package so it holds only the espeak-ng files Italian needs.
import re, json, sys
src, out = sys.argv[1], sys.argv[2]
KEEP = {'intonations', 'phondata', 'phonindex', 'phontab', 'it_dict', 'lang/roa/it'}
js = open(src + '/piper_phonemize.js').read()
data = open(src + '/piper_phonemize.data', 'rb').read()
m = re.search(r'loadPackage\((\{.*?\})\)\}', js)
meta = json.loads(m.group(1))
files, blob = [], bytearray()
for f in meta['files']:
    if f['filename'].removeprefix('/espeak-ng-data/') in KEEP:
        chunk = data[f['start']:f['end']]
        files.append({'filename': f['filename'], 'start': len(blob), 'end': len(blob) + len(chunk)})
        blob += chunk
assert len(files) == len(KEEP), files
new = json.dumps({'files': files, 'remote_package_size': len(blob)}, separators=(',', ':'))
js = js[:m.start(1)] + new + js[m.end(1):]
js = js.replace(str(meta['remote_package_size']), str(len(blob)))
open(out + '/piper_phonemize.js', 'w').write(js)
open(out + '/piper_phonemize.data', 'wb').write(blob)
print(len(blob), [f['filename'] for f in files])
