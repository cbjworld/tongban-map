"""Validate public files and create a local release archive; never upload."""
import json
import re
import zipfile
from pathlib import Path
from build import build

root = Path(__file__).resolve().parent
build()
names = [
    'index.html', 'editor.html', 'map.js', 'regions.js', 'viewer.js',
    'local-work.js', 'autosave.js', 'check-autosave.cjs',
    'vworld.js', 'check-vworld.cjs',
    'address-search.js', 'check-address.cjs',
    'data-format.js', 'units.js', 'parcels.js', 'README.md', 'LICENSE',
    'THIRD_PARTY_NOTICES.md', 'PUBLIC_RELEASE_CHECKLIST.md', 'DATA_SOURCES.md',
    'build.py', 'check.py', 'prepare_regions.py', 'release.py', 'package.json',
    'check-delete-point.cjs', 'check-regions.cjs', 'check-release.cjs', '.gitignore',
]
files = [root / name for name in names]
for directory in ['data', 'licenses', 'src', '.github']:
    files.extend(path for path in (root / directory).rglob('*') if path.is_file())
secret = re.compile(r'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)')
private_keys = {'COT_LEADER_NAME', 'BAN_LEADER_NAMES', 'COT_TEL_NO'}

def check_private(value, path):
    if isinstance(value, dict):
        for key, entry in value.items():
            if key in private_keys and entry:
                raise ValueError(f'Nonempty personal-data field: {path.name}: {key}')
            check_private(entry, path)
    elif isinstance(value, list):
        for entry in value:
            check_private(entry, path)

for path in files:
    text = path.read_text(encoding='utf-8-sig')
    if secret.search(text):
        raise ValueError(f'Possible secret: {path.name}')
    if path.suffix == '.json':
        check_private(json.loads(text), path)
archive = root.parent / 'tongban-map-beta.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
    for path in sorted(files):
        output.write(path, 'tongban-map/' + path.relative_to(root).as_posix())
print(f'PASS: {len(files)} public files, no matched credential patterns or nonempty known personal-data fields')
print(f'Created {archive.name} ({archive.stat().st_size:,} bytes); not uploaded')
