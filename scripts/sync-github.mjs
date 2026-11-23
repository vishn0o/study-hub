#!/usr/bin/env node
/* Regenerates sitemap.xml with a current <lastmod> for the GitHub Pages site.
   Run by .github/workflows/sync-sitemap.yml; no network access required.
   <lastmod> comes from the last git commit touching each page (today as fallback). */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DOMAIN = process.env.SITE_DOMAIN || 'https://YOURDOMAIN.github.io/study-hub/'; // TODO: replace with your domain

function lastModified(file) {
  try {
    const out = execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%cs', '--', file],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) return out;
  } catch { /* not a git repo or no history yet */ }
  return new Date().toISOString().slice(0, 10);
}

const pages = ['index.html', '404.html'].filter(p => existsSync(path.join(ROOT, p)));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${DOMAIN}${p}</loc>
    <lastmod>${lastModified(p)}</lastmod>
    <changefreq>monthly</changefreq>
    ${p === 'index.html' ? '<priority>1.0</priority>' : '<priority>0.5</priority>'}
  </url>`).join('\n')}
</urlset>
`;

writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
console.log('sitemap.xml regenerated:', pages.map(p => `${p} @ ${lastModified(p)}`).join(', '));
