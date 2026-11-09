#!/usr/bin/env node
/*
 * Builds one small static page per prediction, p/<id>/index.html, plus a
 * preview image, p/<id>/anteprima.jpg, so that Telegram, WhatsApp and other
 * apps show the prediction itself when its link is shared. Those apps do not
 * run JavaScript, so the normal page (?p=<id>) always looks like the home
 * page to them.
 *
 * Each page carries Open Graph tags and sends visitors on to the normal page
 * (?p=<id>) with JavaScript only. There is deliberately no <meta refresh> and
 * the canonical URL is the share page itself: link-preview bots may follow
 * either of those to the home page and show its generic preview instead.
 *
 * Images are drawn with Playwright (Chromium). They are redrawn only when the
 * prediction's text, due date, tags or expired/open state change. Without
 * Playwright the pages fall back to the generic site image.
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
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://margitelab.github.io/wikiprev/';
const GENERIC_IMAGE_URL = SITE_URL + 'img/anteprima.png?v=2';
const OUT_DIR = join(ROOT, 'p');
const IMAGE_TEMPLATE_VERSION = 1;   // bump to redraw every image

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

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function facts(row) {
    const expired = row.due_on && String(row.due_on) < todayIso();
    return {
        title: clip(row.statement, 200),
        person: clip(row.person_name, 80),
        outlet: clip(row.outlet_name, 80),
        due: row.due_on ? itDate(row.due_on) : '',
        expired: Boolean(expired),
        tags: Array.isArray(row.tags) ? row.tags.map(t => clip(t.label, 40)).slice(0, 6) : []
    };
}

function imageHash(f) {
    return createHash('sha256')
        .update(JSON.stringify([IMAGE_TEMPLATE_VERSION, f.title, f.person, f.due, f.expired, f.tags]))
        .digest('hex').slice(0, 12);
}

/* ---------- Preview image ---------- */

function imageHtml(f) {
    const status = f.due
        ? (f.expired ? `Scaduta il ${f.due}` : `Da verificare entro il ${f.due}`)
        : '';
    return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><style>
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; overflow: hidden; color: #fff;
  font-family: 'DejaVu Sans', 'Noto Sans', 'Liberation Sans', Arial, sans-serif;
  background: linear-gradient(135deg, #2c3e50 0%, #2f5f86 60%, #3498db 100%);
  display: flex; flex-direction: column; padding: 56px 70px 52px; gap: 28px; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: bold; }
.brand small { font-weight: normal; font-size: 22px; color: #cfe3f2; }
.status { font-size: 24px; font-weight: bold; padding: 10px 22px; border-radius: 40px; white-space: nowrap; }
.status.expired { background: #fdedec; color: #c0392b; }
.status.open { background: #fef5e7; color: #b9770e; }
.title-box { flex: 1; display: flex; align-items: center; min-height: 0; }
h1 { font-size: 64px; line-height: 1.18; letter-spacing: -0.5px; }
.bottom { display: flex; flex-direction: column; gap: 16px; }
.who { font-size: 28px; color: #e8f1f8; }
.tags { display: flex; gap: 12px; flex-wrap: wrap; }
.tag { font-size: 22px; padding: 6px 18px; border-radius: 30px; background: rgba(255,255,255,.18); }
</style></head><body>
<div class="top">
  <div class="brand">
    <svg width="44" height="44" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="rgba(255,255,255,.15)"/>
      <path d="M19 13h26M19 51h26" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
      <path d="M23 13h18L32 32l9 19H23l9-19z" fill="none" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M26 21h12l-6 9z" fill="#fff"/><path d="M32 40l6 9H26z" fill="#7fc4f2"/></svg>
    <span>Wikiprev <small>· Archivio di previsioni</small></span>
  </div>
  ${status ? `<div class="status ${f.expired ? 'expired' : 'open'}">${esc(status)}</div>` : ''}
</div>
<div class="title-box"><h1 id="t">${esc(f.title)}</h1></div>
<div class="bottom">
  ${f.person || f.outlet ? `<div class="who">${esc([f.person, f.outlet ? 'Fonte: ' + f.outlet : ''].filter(Boolean).join(' · '))}</div>` : ''}
  ${f.tags.length ? `<div class="tags">${f.tags.map(t => `<span class="tag"># ${esc(t)}</span>`).join('')}</div>` : ''}
</div>
<script>
  // Shrink the title until it fits its box.
  const t = document.getElementById('t'), box = t.parentElement;
  let size = 64;
  while ((t.scrollHeight > box.clientHeight || t.scrollWidth > box.clientWidth) && size > 30) {
    size -= 2; t.style.fontSize = size + 'px';
  }
</script>
</body></html>`;
}

function loadPlaywright() {
    try {
        return createRequire(import.meta.url)('playwright');
    } catch (e) {
        return null;
    }
}

/* ---------- Share page ---------- */

function page(row, f, imageUrl) {
    const id = safeId(row.id);
    const target = `${SITE_URL}?p=${encodeURIComponent(id)}`;
    const shareUrl = `${SITE_URL}p/${id}/`;
    const description = clip([
        f.due ? (f.expired ? 'Scaduta il ' : 'Da verificare entro il ') + f.due : '',
        f.person ? 'Chi: ' + f.person : '',
        f.outlet ? 'Fonte: ' + f.outlet : '',
        f.tags.length ? 'Tag: ' + f.tags.join(', ') : ''
    ].filter(Boolean).join(' · '), 300);

    return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(f.title)} - Wikiprev</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${esc(shareUrl)}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Wikiprev">
    <meta property="og:locale" content="it_IT">
    <meta property="og:url" content="${esc(shareUrl)}">
    <meta property="og:title" content="${esc(f.title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:image" content="${esc(imageUrl)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${esc(f.title)}">
    <meta name="twitter:card" content="summary_large_image">
    <script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
    <p><strong>${esc(f.title)}</strong></p>
    <p>${esc(description)}</p>
    <p><a href="${esc(target)}">Apri la previsione su Wikiprev</a></p>
</body>
</html>
`;
}

/* ---------- Main ---------- */

const rows = await loadRows(process.argv[2]);
const playwright = loadPlaywright();
let browser = null;
if (playwright) {
    browser = await playwright.chromium.launch();
} else {
    console.warn('Playwright not available: pages will use the generic image for new predictions.');
}
const imagePage = browser ? await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 }) : null;

const keep = new Set();
let drawn = 0;
for (const row of rows) {
    const id = safeId(row.id);
    if (!id || !row.statement) continue;
    const dir = join(OUT_DIR, id);
    mkdirSync(dir, { recursive: true });
    const f = facts(row);
    const hash = imageHash(f);
    const imageFile = join(dir, 'anteprima.jpg');
    const hashFile = join(dir, 'anteprima.hash');
    const upToDate = existsSync(imageFile) && existsSync(hashFile) && readFileSync(hashFile, 'utf8').trim() === hash;
    if (!upToDate && imagePage) {
        await imagePage.setContent(imageHtml(f), { waitUntil: 'load' });
        await imagePage.screenshot({ path: imageFile, type: 'jpeg', quality: 85 });
        writeFileSync(hashFile, hash + '\n');
        drawn++;
    }
    const imageUrl = existsSync(imageFile)
        ? `${SITE_URL}p/${id}/anteprima.jpg?v=${readFileSync(hashFile, 'utf8').trim()}`
        : GENERIC_IMAGE_URL;
    writeFileSync(join(dir, 'index.html'), page(row, f, imageUrl));
    keep.add(id);
}
if (browser) await browser.close();

let removed = 0;
if (existsSync(OUT_DIR)) {
    for (const name of readdirSync(OUT_DIR)) {
        if (!keep.has(name)) { rmSync(join(OUT_DIR, name), { recursive: true, force: true }); removed++; }
    }
}
console.log(`Share pages: ${keep.size} written, ${drawn} images drawn, ${removed} removed.`);
