"""Split downloaded boundaries and existing parcels for on-demand loading."""
import json
import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
source = Path(sys.argv[1])
features = json.loads(source.read_text(encoding='utf-8-sig'))['features']
parcels = json.loads((root / 'src/parcels_by_dong.json').read_text(encoding='utf-8'))
target = root / 'data/regions'
target.mkdir(parents=True, exist_ok=True)
index = []
seen = set()
for feature in features:
    props = feature['properties']
    code = props['adm_cd2']
    assert code.isdigit() and len(code) == 10 and code not in seen
    assert feature['geometry']['type'] in ('Polygon', 'MultiPolygon')
    seen.add(code)
    name = props['adm_nm'].split()[-1]
    local_parcels = parcels.get(name) if props['sgg'] == '11170' else None
    entry = dict(code=code, name=name, fullName=props['adm_nm'], sido=props['sido'], sidoName=props['sidonm'], sgg=props['sgg'], sggName=props['sggnm'], parcels=bool(local_parcels))
    index.append(entry)
    (target / (code + '.json')).write_text(json.dumps(feature, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    if local_parcels:
        (target / (code + '-parcels.json')).write_text(json.dumps(local_parcels, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
(target / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
shutil.copyfile(source.parent / 'LICENSE-DATA', target / 'LICENSE-DATA')
print(f'Prepared {len(index)} regions')
