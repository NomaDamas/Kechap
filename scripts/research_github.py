"""Collect public GitHub evidence with existing gh authentication; never approve adapters."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
QUERIES = {
    'awesome-captcha': 'awesome captcha in:name,description,readme',
    'human-verification': 'human verification in:name,description',
    'captcha-mcp': 'captcha mcp in:name,description,readme',
    'provider-sdk': 'captcha provider sdk in:description,readme',
    'proof-of-personhood': 'proof of personhood in:name,description',
    'popular-captcha': 'captcha stars:>=10000',
}


class ResearchError(Exception):
    pass


def github_api(endpoint):
    # gh reads the saved credential itself. No token is exposed to argv or logs.
    try:
        result = subprocess.run(
            ['gh', 'api', '--hostname', 'github.com', endpoint],
            capture_output=True, text=True, timeout=30, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ResearchError('GitHub API client unavailable or timed out') from exc
    if result.returncode:
        # Do not echo arbitrary stderr or auth data from a client configuration.
        raise ResearchError('GitHub request failed; network, permissions or rate limit need checking')
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ResearchError('GitHub response was not JSON') from exc


def repository_from_url(url):
    match = re.fullmatch(r'https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/?', url)
    return '/'.join(match.groups()).removesuffix('.git') if match else None


def save_evidence(output, name, endpoint, data):
    raw = json.dumps(data, ensure_ascii=False, sort_keys=True).encode()
    record = {
        'url': 'https://api.github.com/' + endpoint,
        'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'sha256': hashlib.sha256(raw).hexdigest(),
        'hashFormat': 'UTF-8 JSON with sorted keys, ensure_ascii=False, default separators',
        'data': data,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / (name + '.json')).write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    return record


def collect_repository(repo, output, api=github_api):
    metadata_endpoint = 'repos/' + repo
    metadata = api(metadata_endpoint)
    prefix = repo.replace('/', '--')
    save_evidence(output, prefix + '--metadata', metadata_endpoint, metadata)
    commit_endpoint = metadata_endpoint + '/commits/' + metadata['default_branch']
    commit = api(commit_endpoint)
    revision = commit['sha']
    save_evidence(output, prefix + '--revision', commit_endpoint, commit)
    result = {
        'repository': metadata['full_name'], 'revision': revision,
        'stars': metadata['stargazers_count'], 'over10k': metadata['stargazers_count'] >= 10000,
        'archived': metadata['archived'], 'pushedAt': metadata['pushed_at'],
        'licenseCandidate': metadata.get('license'), 'evidenceStatus': 'fetched-not-reviewed',
        'documents': {}, 'missingDocuments': [],
    }
    for document in ['readme', 'license']:
        endpoint = metadata_endpoint + '/' + document + '?ref=' + revision
        try:
            data = api(endpoint)
            record = save_evidence(output, prefix + '--' + document, endpoint, data)
            # Retain original JSON even when this endpoint omits file contents.
            if data.get('encoding') == 'base64' and isinstance(data.get('content'), str):
                decoded = base64.b64decode(data['content'], validate=False)
                (output / (prefix + '--' + document + '.txt')).write_bytes(decoded)
            result['documents'][document] = {'url': record['url'], 'sha256': record['sha256'], 'path': data.get('path')}
        except (ResearchError, ValueError):
            result['missingDocuments'].append(document)
    save_evidence(output, prefix + '--summary', metadata_endpoint, result)
    return result


def collect_search(name, query, output, api=github_api):
    from urllib.parse import urlencode
    endpoint = 'search/repositories?' + urlencode({'q': query, 'sort': 'stars', 'order': 'desc', 'per_page': 30})
    result = api(endpoint)
    save_evidence(output, 'search--' + name, endpoint, result)
    return {
        'query': query, 'totalCount': result['total_count'],
        'incompleteResults': result.get('incomplete_results', False),
        'sampleLimit': 30, 'isExhaustive': False,
        'repositories': [{'name': p['full_name'], 'url': p['html_url'], 'stars': p['stargazers_count'], 'description': p.get('description')} for p in result['items']],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.local/research')
    parser.add_argument('--plan', action='store_true', help='List intended research without network calls')
    args = parser.parse_args()
    catalog = json.loads((ROOT / 'catalog/providers.json').read_text())
    repositories = sorted({r for p in catalog['providers'] if (r := repository_from_url(p['sourceUrl']))} | {'morluto/rea'})
    if args.plan:
        print(json.dumps({'repositories': repositories, 'searches': QUERIES, 'output': str(args.output), 'catalogAutoApproval': False}, indent=2))
        return 0
    try:
        github_api('rate_limit')
    except ResearchError as exc:
        print(str(exc) + '. No research or catalog approval claimed.', file=sys.stderr)
        return 1
    report = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'status': 'discovery-only', 'repositories': [], 'searches': {}, 'failures': []}
    for repo in repositories:
        try:
            report['repositories'].append(collect_repository(repo, args.output))
            print(repo + ': evidence saved; manual review required')
        except (ResearchError, KeyError) as exc:
            report['failures'].append({'repository': repo, 'error': str(exc)})
            print(repo + ': incomplete evidence', file=sys.stderr)
    for name, query in QUERIES.items():
        try:
            report['searches'][name] = collect_search(name, query, args.output)
        except (ResearchError, KeyError) as exc:
            report['failures'].append({'search': name, 'error': str(exc)})
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('Discovery report written. Stars are popularity, not proof of security or adoption.')
    return 1 if report['failures'] else 0


if __name__ == '__main__':
    sys.exit(main())
