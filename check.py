"""Run with python check.py after changing templates or the build."""
import hashlib
import json
from pathlib import Path
from build import build

root = Path(__file__).resolve().parent
build()
for name in ('index.html', 'editor.html'):
    content = (root / name).read_text(encoding='utf-8')
    assert 'kakao' not in content.lower(), name
    assert '__KAKAO_KEY__' not in content, name
    assert 'getSitePassword' not in content, name
    assert 'ghLoadBtn' not in content and 'ghSaveBtn' not in content, name
    assert ('regions.js' if name == 'editor.html' else 'viewer.js') in content and 'sidoSelect' in content, name
    assert (root / name).stat().st_size < 1_000_000, name
    assert 'map.js' in content and 'leaflet@1.9.4' in content, name
    if name == 'editor.html':
        assert 'window.addEventListener(\'load\', bootApp)' in content, name
    else:
        assert 'drawStartBtn' not in content and 'units.js' not in content, name
before = {name: hashlib.sha256((root / name).read_bytes()).digest() for name in ('index.html','editor.html')}
build()
assert all(hashlib.sha256((root / name).read_bytes()).digest() == digest for name, digest in before.items())
for path in root.rglob('*.json'):
    json.loads(path.read_text(encoding='utf-8'))
regions = json.loads((root / 'data/regions/index.json').read_text(encoding='utf-8'))
assert len({entry['code'] for entry in regions}) == len(regions)
for entry in regions:
    feature = json.loads((root / 'data/regions' / (entry['code'] + '.json')).read_text(encoding='utf-8'))
    assert feature['properties']['adm_cd2'] == entry['code']
    assert feature['geometry']['type'] in ('Polygon', 'MultiPolygon')
    if entry['parcels']:
        assert entry['sgg'] == '11170'
        assert (root / 'data/regions' / (entry['code'] + '-parcels.json')).is_file()
print('PASS: reproducible build, OSM dependencies, no Kakao calls, valid JSON')
