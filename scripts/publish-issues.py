"""Preview or publish roadmap issue bodies; skips exact existing titles."""
import argparse
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--publish', action='store_true')
parser.add_argument('--repo', default='NomaDamas/Kechap')
args = parser.parse_args()
files = sorted((Path(__file__).resolve().parent.parent / '.github/planned-issues').glob('*.md'))
if not args.publish:
    for path in files:
        print(path.read_text().splitlines()[0].removeprefix('# '))
    print(f'{len(files)} issues. No remote changes. Use --publish to create missing titles.')
else:
    existing = json.loads(subprocess.check_output(['gh', 'issue', 'list', '--repo', args.repo, '--state', 'all', '--limit', '1000', '--json', 'title']))
    titles = {issue['title'] for issue in existing}
    for path in files:
        title = path.read_text().splitlines()[0].removeprefix('# ')
        if title in titles:
            print(f'Skip existing: {title}')
            continue
        subprocess.run(['gh', 'issue', 'create', '--repo', args.repo, '--title', title, '--body-file', str(path)], check=True)
        titles.add(title)
