#!/usr/bin/env node
/*
 * Builds one small static page per prediction, p/<id>/index.html, so that
 * Telegram, WhatsApp and other apps show the prediction's own title and
 * details when its link is shared. Those apps do not run JavaScript, so the
 * normal page (?p=<id>) always looks like the home page to them.
 *
 * Each page carries Open Graph tags and sends visitors on to the normal page
 * (?p=<id>) with JavaScript only. There is deliberately no <meta refresh> and
 * the canonical URL is the share page itself: link-preview bots may follow
 * either of those to the home page and show its generic preview instead.
 *
 * Usage:
 *   node scripts/build-share-pages.mjs                 # reads the database (js/config.js)
 *   node scripts/build-share-pages.mjs data.json       # reads predictions_view rows from a file
 *
 * Pages of predictions that no longer exist are removed.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://margitelab.github.io/wikiprev/';
const IMAGE_URL = SITE_URL + 'img/anteprima.png';
const OUT_DIR = join(ROOT, 'p');

function readConfig() {
    const text = readFileSync(join(ROOT, 'js', 'config.js'), 'utf8');
    const url = /supabaseUrl:\s*'([^']*)'/.exec(text);
    const key = /supabaseAnonKey:\s*'([^']*)'/.exec(text);
    if (!url || !key || !url[1] || !key[1]) throw new Error('js/config.js has no Supabase URL or key');
    return { url: url[1], key: key[1] };
}

async function loadRows(file) {
    if (file) return JSON.parse(readFileSync(file, 'utf8'));
    const { url, key } = readConfig();
    const res = await fetch(url + '/rest/v1/predictions_view?select=*&order=created_at', {
        headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    if (!res.ok) throw new Error('Database request failed: HTTP ' + res.status);
    return res.json();
}

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function itDate(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
}

function clip(text, max) {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean;
}

/* Only ids that are safe as a folder name and in a URL. */
function safeId(id) {
    return /^[A-Za-z0-9-]{1,80}$/.test(String(id)) ? String(id) : null;
}

function page(row) {
    const id = safeId(row.id);
    const target = `${SITE_URL}?p=${encodeURIComponent(id)}`;
    const shareUrl = `${SITE_URL}p/${id}/`;
    const facts = [
        row.due_on ? 'Da verificare entro il ' + itDate(row.due_on) : '',
        row.person_name ? 'Chi: ' + row.person_name : '',
        row.outlet_name ? 'Fonte: ' + row.outlet_name : ''
    ].filter(Boolean).join(' · ');
    const tags = Array.isArray(row.tags) ? row.tags.map(t => t.label).join(', ') : '';
    const description = clip([facts, tags ? 'Tag: ' + tags : ''].filter(Boolean).join(' · '), 300);
    const title = clip(row.statement, 200);

    return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)} - Wikiprev</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${esc(shareUrl)}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Wikiprev">
    <meta property="og:locale" content="it_IT">
    <meta property="og:url" content="${esc(shareUrl)}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:image" content="${esc(IMAGE_URL)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Wikiprev, archivio di previsioni">
    <meta name="twitter:card" content="summary_large_image">
    <script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
    <p><strong>${esc(title)}</strong></p>
    <p>${esc(description)}</p>
    <p><a href="${esc(target)}">Apri la previsione su Wikiprev</a></p>
</body>
</html>
`;
}

const rows = await loadRows(process.argv[2]);
const keep = new Set();
for (const row of rows) {
    const id = safeId(row.id);
    if (!id || !row.statement) continue;
    mkdirSync(join(OUT_DIR, id), { recursive: true });
    writeFileSync(join(OUT_DIR, id, 'index.html'), page(row));
    keep.add(id);
}
let removed = 0;
if (existsSync(OUT_DIR)) {
    for (const name of readdirSync(OUT_DIR)) {
        if (!keep.has(name)) { rmSync(join(OUT_DIR, name), { recursive: true, force: true }); removed++; }
    }
}
console.log(`Share pages: ${keep.size} written, ${removed} removed.`);
