import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('research', Path(__file__).resolve().parent.parent / 'scripts/research_github.py')
research = importlib.util.module_from_spec(spec)
spec.loader.exec_module(research)


class ResearchTests(unittest.TestCase):
    def test_repository_urls_are_exact_github_repositories(self):
        self.assertEqual(research.repository_from_url('https://github.com/morluto/rea.git'), 'morluto/rea')
        self.assertIsNone(research.repository_from_url('https://github.com.evil.invalid/a/b'))
        self.assertIsNone(research.repository_from_url('https://github.com/a/b/tree/main'))

    def test_documents_are_pinned_and_missing_license_is_not_approval(self):
        endpoints = []
        def api(endpoint):
            endpoints.append(endpoint)
            if endpoint == 'repos/a/b':
                return {'default_branch': 'main', 'full_name': 'a/b', 'stargazers_count': 10000, 'archived': False, 'pushed_at': '2026-01-01', 'license': None}
            if '/commits/' in endpoint:
                return {'sha': 'a' * 40}
            if '/readme?' in endpoint:
                return {'encoding': 'base64', 'content': base64.b64encode(b'# Test').decode(), 'path': 'README.md'}
            raise research.ResearchError('not found')
        with tempfile.TemporaryDirectory() as folder:
            result = research.collect_repository('a/b', Path(folder), api)
            self.assertTrue(result['over10k'])
            self.assertEqual(result['evidenceStatus'], 'fetched-not-reviewed')
            self.assertEqual(result['missingDocuments'], ['license'])
            self.assertTrue(all('?ref=' + 'a' * 40 in p for p in endpoints if '/readme?' in p or '/license?' in p))
            self.assertEqual((Path(folder) / 'a--b--readme.txt').read_text(), '# Test')
            record = json.loads((Path(folder) / 'a--b--readme.json').read_text())
            self.assertEqual(len(record['sha256']), 64)

    def test_search_reports_partial_scope(self):
        with tempfile.TemporaryDirectory() as folder:
            result = research.collect_search('captcha', 'captcha stars:>=10000', Path(folder), lambda _: {'total_count': 100, 'incomplete_results': True, 'items': []})
            self.assertTrue(result['incompleteResults'])
            self.assertFalse(result['isExhaustive'])


if __name__ == '__main__':
    unittest.main()
