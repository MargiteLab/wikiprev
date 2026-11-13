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
 *
 * The script also writes two RSS feeds for feed readers:
 *   feed/nuove.xml    predictions as they are added
 *   feed/scadute.xml  predictions as their due date passes
 * Their text depends only on the predictions, never on the time of the run,
 * so nothing is committed when nothing changed.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://margitelab.github.io/wikiprev/';
const GENERIC_IMAGE_URL = SITE_URL + 'img/anteprima.png?v=3';
const OUT_DIR = join(ROOT, 'p');
const FEED_DIR = join(ROOT, 'feed');
const FEED_MAX_ITEMS = 50;
const IMAGE_TEMPLATE_VERSION = 4;   // bump to redraw every image

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

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
    'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function longDate(dmy) {
    const [d, m, y] = dmy.split('/');
    return `${Number(d)} ${MONTHS[Number(m) - 1] || m} ${y}`;
}

/* Fonts and the hourglass picture are embedded in the image page, so the
   result does not depend on the fonts installed where the script runs. */
let assetCss = null;
function assets() {
    if (assetCss !== null) return assetCss;
    const dir = join(ROOT, 'scripts');
    const b64 = file => readFileSync(join(dir, file)).toString('base64');
    const face = (family, file, weight, style) =>
        `@font-face { font-family: '${family}'; font-weight: ${weight}; font-style: ${style};
  src: url(data:font/woff2;base64,${b64('fonts/' + file)}) format('woff2'); }`;
    assetCss = [
        face('Libre Caslon Text', 'libre-caslon-text-latin-400-normal.woff2', 400, 'normal'),
        face('Libre Caslon Text', 'libre-caslon-text-latin-400-italic.woff2', 400, 'italic'),
        face('Libre Caslon Text', 'libre-caslon-text-latin-700-normal.woff2', 700, 'normal'),
        face('Source Serif 4', 'source-serif-4-latin-400-normal.woff2', 400, 'normal'),
        face('Source Serif 4', 'source-serif-4-latin-600-normal.woff2', 600, 'normal'),
        `.art { background-image: url(data:image/jpeg;base64,${b64('share-art.jpg')}); }`
    ].join('\n');
    return assetCss;
}

function imageHtml(f) {
    const badge = f.due ? (f.expired ? 'Scaduta' : 'In attesa') : '';
    const when = f.due ? (f.expired ? 'il ' : 'entro il ') + longDate(f.due) : '';
    return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><style>
${assets()}
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; overflow: hidden; position: relative;
  background: #f4ede2; color: #1f1b16;
  font-family: 'Source Serif 4', 'DejaVu Serif', Georgia, serif; }
.art { position: absolute; right: 0; top: 0; width: 320px; height: 630px; background-size: cover; }
.bar { position: absolute; left: 0; right: 0; bottom: 0; height: 16px; background: #c4432b; }
.content { position: absolute; left: 64px; top: 44px; bottom: 56px; width: 820px;
  display: flex; flex-direction: column; gap: 22px; }
.brand { display: flex; align-items: baseline; gap: 18px; padding-bottom: 16px; border-bottom: 2px solid #1f1b16; }
.logo { font-family: 'Libre Caslon Text', Georgia, serif; font-weight: 700; font-size: 44px; letter-spacing: 1px; }
.logo span { color: #c4432b; }
.tagline { font-family: 'Libre Caslon Text', Georgia, serif; font-style: italic; font-size: 26px; color: #5b5047; }
/* Text in the lower part is large on purpose: phones show the image small. */
.status { display: flex; align-items: center; gap: 18px; font-size: 36px; }
.badge { font-size: 28px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase;
  padding: 6px 22px; border-radius: 40px; color: #fff; }
.badge.expired { background: #c4432b; }
.badge.open { background: #e2a020; color: #1f1b16; }
.title-box { flex: 1; min-height: 0; display: flex; align-items: center; }
h1 { font-family: 'Libre Caslon Text', Georgia, serif; font-weight: 400; font-size: 62px; line-height: 1.18; }
.who { font-size: 38px; line-height: 1.25; }
.who b { font-weight: 600; }
.who span { color: #5b5047; }
</style></head><body>
<div class="art"></div>
<div class="content">
  <div class="brand"><div class="logo">WIKI<span>PREV</span></div><div class="tagline">L'archivio pubblico delle previsioni</div></div>
  ${badge ? `<div class="status"><span class="badge ${f.expired ? 'expired' : 'open'}">${badge}</span><span>${esc(when)}</span></div>` : ''}
  <div class="title-box"><h1 id="t">${esc(f.title)}</h1></div>
  ${f.person || f.outlet ? `<div class="who">${f.person ? `<b>${esc(f.person)}</b>` : ''}${f.person && f.outlet ? ' · ' : ''}${f.outlet ? `<span>${esc(f.outlet)}</span>` : ''}</div>` : ''}
</div>
<div class="bar"></div>
<script>
  // Shrink the title until it fits its box. Wrapped in a function: the same
  // browser page draws every image, so top-level names would clash.
  // It runs once the embedded fonts are ready, since they change the sizes.
  document.fonts.ready.then(function () {
    var t = document.getElementById('t'), box = t.parentElement, size = 62;
    while ((t.scrollHeight > box.clientHeight || t.scrollWidth > box.clientWidth) && size > 28) {
      size -= 2; t.style.fontSize = size + 'px';
    }
    document.body.setAttribute('data-ready', '1');
  });
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

/* ---------- RSS feeds ---------- */

/* The day after the due date, at midnight UTC: the moment a prediction counts as expired. */
function expiryDate(row) {
    const d = new Date(String(row.due_on).slice(0, 10) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
}

function feedItem(row, f, kind, date) {
    const id = safeId(row.id);
    const link = `${SITE_URL}p/${id}/`;
    const lines = [
        f.due ? (f.expired ? 'Scaduta il ' : 'Da verificare entro il ') + f.due : '',
        f.person ? "Chi l'ha fatta: " + f.person : '',
        f.outlet ? 'Fonte: ' + f.outlet : '',
        row.created_by_name ? 'Inserita da: ' + clip(row.created_by_name, 80) : '',
        f.tags.length ? 'Tag: ' + f.tags.join(', ') : ''
    ].filter(Boolean);
    const details = clip(row.details, 600);
    // HTML for the reader, escaped twice: once as HTML, once as XML text.
    const body = (details ? `<p>${esc(details)}</p>` : '') + `<p>${lines.map(esc).join('<br>')}</p>`;
    const image = join(OUT_DIR, id, 'anteprima.jpg');
    const enclosure = existsSync(image)
        ? `\n      <enclosure url="${esc(link + 'anteprima.jpg')}" length="${statSync(image).size}" type="image/jpeg"/>`
        : '';
    return `    <item>
      <title>${esc((kind === 'expired' ? 'Scaduta: ' : '') + f.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(link + (kind === 'expired' ? '#scaduta' : ''))}</guid>
      <pubDate>${date.toUTCString()}</pubDate>
      <description>${esc(body)}</description>${f.tags.map(t => `\n      <category>${esc(t)}</category>`).join('')}${enclosure}
    </item>`;
}

function feedXml(file, title, description, entries) {
    const newest = entries.length ? entries[0].date : new Date(0);
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(title)}</title>
    <link>${SITE_URL}</link>
    <atom:link href="${SITE_URL}feed/${file}" rel="self" type="application/rss+xml"/>
    <description>${esc(description)}</description>
    <language>it</language>
    <lastBuildDate>${newest.toUTCString()}</lastBuildDate>
${entries.map(e => e.xml).join('\n')}
  </channel>
</rss>
`;
}

function writeFeeds(rows) {
    const valid = rows.filter(r => safeId(r.id) && r.statement);
    const byNewest = (a, b) => b.date - a.date || String(a.id).localeCompare(String(b.id));

    const added = valid.filter(r => r.created_at && !isNaN(Date.parse(r.created_at)))
        .map(r => ({ id: r.id, row: r, date: new Date(r.created_at) }))
        .sort(byNewest).slice(0, FEED_MAX_ITEMS)
        .map(e => ({ date: e.date, xml: feedItem(e.row, facts(e.row), 'added', e.date) }));

    const today = todayIso();
    const expired = valid.filter(r => r.due_on && String(r.due_on) < today)
        .map(r => ({ id: r.id, row: r, date: expiryDate(r) }))
        .sort(byNewest).slice(0, FEED_MAX_ITEMS)
        .map(e => ({ date: e.date, xml: feedItem(e.row, facts(e.row), 'expired', e.date) }));

    mkdirSync(FEED_DIR, { recursive: true });
    writeFileSync(join(FEED_DIR, 'nuove.xml'), feedXml('nuove.xml',
        'Wikiprev - Nuove previsioni', "Le previsioni appena aggiunte all'archivio Wikiprev.", added));
    writeFileSync(join(FEED_DIR, 'scadute.xml'), feedXml('scadute.xml',
        'Wikiprev - Previsioni scadute', 'Le previsioni di Wikiprev la cui scadenza è appena passata: è il momento di verificarle.', expired));
    return { added: added.length, expired: expired.length };
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
        await imagePage.waitForSelector('body[data-ready]');
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

const feeds = writeFeeds(rows);
console.log(`Feeds: ${feeds.added} added, ${feeds.expired} expired.`);
