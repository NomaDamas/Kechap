// Fetch discovery evidence only; never auto-approve a candidate or its license.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const catalog = JSON.parse(await readFile(new URL('../catalog/providers.json', import.meta.url)));
const output = new URL('../.local/evidence/', import.meta.url);
await mkdir(output, {recursive: true});
let failed = false;
for (const provider of catalog.providers) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)\/?$/.exec(provider.sourceUrl);
  if (!match) continue;
  const url = `https://api.github.com/repos/${match[1]}/${match[2]}`;
  try {
    const response = await fetch(url, {headers: {Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? {Authorization: `Bearer ${process.env.GITHUB_TOKEN}`} : {})}, signal: AbortSignal.timeout(15000), redirect: 'error'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.text(); const repo = JSON.parse(raw);
    const evidence = {provider: provider.id, url, fetchedAt: new Date().toISOString(), sha256: createHash('sha256').update(raw).digest('hex'), stars: repo.stargazers_count, over10k: repo.stargazers_count >= 10000, archived: repo.archived, pushedAt: repo.pushed_at, licenseCandidate: repo.license?.spdx_id ?? null, status: 'discovery-only', raw: repo};
    await writeFile(new URL(`${provider.id}.json`, output), JSON.stringify(evidence, null, 2) + '\n');
    console.log(`${provider.id}: evidence saved; manual approval still required`);
  } catch { console.error(`${provider.id}: fetch failed; existing catalog unchanged`); failed = true; }
}
if (failed) process.exitCode = 1;
