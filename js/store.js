/*
 * WikiPrev data layer.
 *
 * All reading and writing of predictions goes through this file, so that the
 * storage (today: the browser's localStorage) can later be swapped for a shared
 * backend without touching the UI code in app.js.
 *
 * Prediction shape (schema version 1):
 * {
 *   id:          string   unique identifier
 *   title:       string   the prediction itself (required)
 *   author:      string   who made the prediction ("" if unknown)
 *   source:      string   where it was published (required)
 *   url:         string   link to the original article ("" if none)
 *   category:    string   one of CATEGORIES keys (required)
 *   madeOn:      string   date the prediction was made, YYYY-MM-DD ("" if unknown)
 *   dueDate:     string   date by which it can be checked, YYYY-MM-DD (required)
 *   description: string   details ("" if none)
 *   createdAt:   string   ISO timestamp of when it was added to WikiPrev
 * }
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'wikiprev_predictions';
    var SCHEMA_VERSION = 1;

    var CATEGORIES = {
        politics:   { label: 'Politics',   icon: 'fa-landmark' },
        economics:  { label: 'Economics',  icon: 'fa-chart-line' },
        technology: { label: 'Technology', icon: 'fa-microchip' },
        sports:     { label: 'Sports',     icon: 'fa-running' },
        science:    { label: 'Science',    icon: 'fa-flask' }
    };

    /* Example predictions shipped with the app, grouped by "seed version".
     * A browser that already has saved data receives only the groups newer
     * than the last one it saw, so deleted examples do not come back. */
    var SEED_VERSION = 2;

    // Real predictions found in the news (added November 2026).
    var SEED_V2 = [
        {
            id: 'seed-v2-bankitalia-pil-2027',
            title: 'Italian GDP will grow by 0.7% in 2027',
            author: "Banca d'Italia",
            source: 'Banca d\'Italia, Proiezioni macroeconomiche',
            url: 'https://www.bancaditalia.it/pubblicazioni/proiezioni-macroeconomiche/2026/Proiezioni-macroeconomiche-Italia-ottobre-2026.pdf',
            category: 'economics',
            madeOn: '2026-10-16',
            dueDate: '2028-03-31',
            description: "In its October 2026 projections the Bank of Italy expects GDP growth of 0.9% in 2026, 0.7% in 2027 and 0.8% in 2028, with inflation at 2.4% in 2027. In an adverse scenario with much higher commodity prices, 2027 growth would be -0.3%. Check against Istat's annual GDP figure for 2027, usually published in March of the following year.",
            createdAt: '2026-11-06T12:00:00.000Z'
        },
        {
            id: 'seed-v2-artemis-iii-2027',
            title: 'Artemis III will launch in summer 2027',
            author: 'NASA',
            source: 'News 6 ClickOrlando',
            url: 'https://www.clickorlando.com/news/local/2026/10/23/artemis-iii-on-schedule-for-summer-2027-launch/',
            category: 'science',
            madeOn: '2026-10-23',
            dueDate: '2027-09-30',
            description: 'NASA leaders said the crewed Artemis III mission is still on schedule for a summer 2027 launch, while the crewed lunar landing is targeted for 2028.',
            createdAt: '2026-11-06T12:01:00.000Z'
        },
        {
            id: 'seed-v2-mobileye-robotaxi-2027',
            title: 'Mobileye will launch its own robotaxi service in a U.S. city in 2027',
            author: 'Mobileye',
            source: 'CNBC',
            url: 'https://www.cnbc.com/2026/06/16/self-driving-tech-supplier-mobileye-targets-us-robotaxi-launch-in-2027.html',
            category: 'technology',
            madeOn: '2026-06-16',
            dueDate: '2027-12-31',
            description: 'Mobileye plans to deploy an initial fleet of 100 vehicles in a major U.S. city during 2027, phasing the launch through the year, and aims for about 17,000 vehicles within five years.',
            createdAt: '2026-11-06T12:02:00.000Z'
        },
        {
            id: 'seed-v2-uk-inflation-peak-2027',
            title: 'UK inflation will peak at about 4.4% around the start of 2027',
            author: 'Economists surveyed by the Financial Times',
            source: 'Investing.com (FT survey)',
            url: 'https://investing.com/news/economy-news/uk-inflation-to-peak-at-44-around-start-of-2027-ft-survey-shows-5002287',
            category: 'economics',
            madeOn: '',
            dueDate: '2027-04-30',
            description: 'A Financial Times survey of economists expects British CPI inflation to peak at an average of 4.4% around the start of 2027, well above official forecasts. Check against the ONS monthly CPI releases for early 2027.',
            createdAt: '2026-11-06T12:03:00.000Z'
        }
    ];

    // Illustrative examples from the first version of the page.
    var SEED_V1 = [
        {
            id: 'seed-1',
            title: 'Stock market will reach new highs by year end',
            author: 'Financial analysts',
            source: 'Financial Times',
            url: '',
            category: 'economics',
            madeOn: '2023-06-15',
            dueDate: '2023-12-31',
            description: 'The stock market is set to grow despite geopolitical uncertainties, reaching new all-time highs by the end of the year.',
            createdAt: '2023-06-20T10:00:00.000Z'
        },
        {
            id: 'seed-2',
            title: 'New government within a week',
            author: 'Sources close to the negotiation',
            source: 'Corriere della Sera',
            url: '',
            category: 'politics',
            madeOn: '2023-11-08',
            dueDate: '2023-11-15',
            description: 'The government crisis will be resolved within 7 days with the formation of a national unity government.',
            createdAt: '2023-11-08T09:00:00.000Z'
        },
        {
            id: 'seed-3',
            title: 'iPhone 15 will be revolutionary',
            author: '',
            source: 'TechCrunch',
            url: '',
            category: 'technology',
            madeOn: '2023-05-02',
            dueDate: '2023-09-30',
            description: 'Apple is preparing innovative features for the next iPhone that will change the smartphone market, including a bezel-less display.',
            createdAt: '2023-05-03T12:00:00.000Z'
        },
        {
            id: 'seed-4',
            title: 'Juventus will win the championship',
            author: '',
            source: 'La Gazzetta dello Sport',
            url: '',
            category: 'sports',
            madeOn: '2022-11-20',
            dueDate: '2023-05-31',
            description: 'Despite a difficult start, the Turin team will recover and win the championship thanks to the return of some key injured players.',
            createdAt: '2022-11-21T08:00:00.000Z'
        }
    ];

    function str(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    function isValidDate(value) {
        return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value));
    }

    function isValidUrl(value) {
        try {
            var u = new URL(value);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch (e) {
            return false;
        }
    }

    function newId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    /* Bring any stored record (including the pre-v1 format that used `expiry`
     * and `verified`/`outcome`) into the current shape. Returns null if the
     * record is unusable. */
    function normalize(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var p = {
            id: raw.id != null ? String(raw.id) : newId(),
            title: str(raw.title),
            author: str(raw.author),
            source: str(raw.source),
            url: str(raw.url),
            category: str(raw.category),
            madeOn: str(raw.madeOn),
            dueDate: str(raw.dueDate || raw.expiry),
            description: str(raw.description),
            createdAt: str(raw.createdAt)
        };
        if (!p.title) return null;
        if (!CATEGORIES[p.category]) p.category = 'politics';
        if (p.url && !isValidUrl(p.url)) p.url = '';
        if (p.madeOn && !isValidDate(p.madeOn)) p.madeOn = '';
        if (!isValidDate(p.dueDate)) p.dueDate = '';
        if (!p.createdAt || isNaN(Date.parse(p.createdAt))) {
            // Old records used Date.now() as id: recover the timestamp if possible.
            var n = Number(raw.id);
            p.createdAt = new Date(n > 1e12 ? n : 0).toISOString();
        }
        return p;
    }

    function readStorage() {
        try {
            var text = global.localStorage.getItem(STORAGE_KEY);
            return text ? JSON.parse(text) : null;
        } catch (e) {
            return null;
        }
    }

    var SEED_GROUPS = { 1: SEED_V1, 2: SEED_V2 };

    function seedsAfter(version) {
        var out = [];
        for (var v = version + 1; v <= SEED_VERSION; v++) out = out.concat(SEED_GROUPS[v] || []);
        return out;
    }

    function load() {
        var data = readStorage();
        // Pre-v1 format: a bare array of predictions (which already had the v1 examples).
        var list = Array.isArray(data) ? data : (data && Array.isArray(data.predictions) ? data.predictions : null);
        if (!list) return { list: seedsAfter(0).map(normalize), changed: false };
        var seenSeeds = Array.isArray(data) ? 1 : (Number(data.seedVersion) || 1);
        list = list.map(normalize).filter(Boolean);
        var ids = {};
        list.forEach(function (p) { ids[p.id] = true; });
        var added = seedsAfter(seenSeeds).filter(function (p) { return !ids[p.id]; }).map(normalize);
        return { list: list.concat(added), changed: seenSeeds < SEED_VERSION };
    }

    var loaded = load();
    var predictions = loaded.list;

    function save() {
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: SCHEMA_VERSION,
                seedVersion: SEED_VERSION,
                predictions: predictions
            }));
            return true;
        } catch (e) {
            return false;
        }
    }

    /* Returns a list of human-readable problems; empty list means valid. */
    function validate(input) {
        var errors = [];
        if (!str(input.title)) errors.push('The prediction text is required.');
        if (!str(input.source)) errors.push('The source is required.');
        if (!CATEGORIES[str(input.category)]) errors.push('Please choose a category.');
        if (!isValidDate(str(input.dueDate))) errors.push('A valid due date is required.');
        if (str(input.url) && !isValidUrl(str(input.url))) errors.push('The source URL must start with http:// or https://.');
        if (str(input.madeOn) && !isValidDate(str(input.madeOn))) errors.push('The date of the prediction is not valid.');
        if (isValidDate(str(input.madeOn)) && isValidDate(str(input.dueDate)) && str(input.madeOn) > str(input.dueDate)) {
            errors.push('The due date cannot be earlier than the date of the prediction.');
        }
        return errors;
    }

    function add(input) {
        var errors = validate(input);
        if (errors.length) return { ok: false, errors: errors };
        var p = normalize({
            id: newId(),
            title: input.title,
            author: input.author,
            source: input.source,
            url: input.url,
            category: input.category,
            madeOn: input.madeOn,
            dueDate: input.dueDate,
            description: input.description,
            createdAt: new Date().toISOString()
        });
        predictions.push(p);
        var saved = save();
        return { ok: true, prediction: p, saved: saved };
    }

    function remove(id) {
        var before = predictions.length;
        predictions = predictions.filter(function (p) { return p.id !== id; });
        if (predictions.length !== before) save();
    }

    if (loaded.changed) save();

    function all() {
        return predictions.slice();
    }

    global.WikiPrevStore = {
        CATEGORIES: CATEGORIES,
        all: all,
        add: add,
        remove: remove,
        validate: validate
    };
})(window);
