"""Build the OSM viewer and editor from the current templates."""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SRC_DIR = BASE_DIR / 'src'


def build():
    replacements = {
        '/* __TURF_JS__ */': 'vendor/turf.min.js',
    }
    for template, output in [('viewer_template.html', 'index.html'), ('editor_template.html', 'editor.html')]:
        content = (SRC_DIR / template).read_text(encoding='utf-8')
        for marker, source in replacements.items():
            if template == 'viewer_template.html':
                continue
            if content.count(marker) != 1:
                raise ValueError(f'{template}: expected one {marker}')
            content = content.replace(marker, (SRC_DIR / source).read_text(encoding='utf-8'))
        (BASE_DIR / output).write_text(content, encoding='utf-8')
        (BASE_DIR / template).write_text((SRC_DIR / template).read_text(encoding='utf-8'), encoding='utf-8')
        print(f'Built {output}')


if __name__ == '__main__':
    build()
