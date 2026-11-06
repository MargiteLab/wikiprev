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
        politics:   { label: 'Politica',   icon: 'fa-landmark' },
        economics:  { label: 'Economia',   icon: 'fa-chart-line' },
        technology: { label: 'Tecnologia', icon: 'fa-microchip' },
        sports:     { label: 'Sport',      icon: 'fa-running' },
        science:    { label: 'Scienza',    icon: 'fa-flask' },
        infrastructure: { label: 'Infrastrutture', icon: 'fa-road' }
    };

    /* Example predictions shipped with the app, grouped by "seed version".
     * A browser that already has saved data receives only the groups newer
     * than the last one it saw, so deleted examples do not come back. */
    var SEED_VERSION = 5;

    // Real predictions found in the news (added November 2026).
    var SEED_V2 = [
        {
            id: 'seed-v2-bankitalia-pil-2027',
            title: 'Il PIL italiano crescerà dello 0,7% nel 2027',
            author: "Banca d'Italia",
            source: 'Banca d\'Italia, Proiezioni macroeconomiche',
            url: 'https://www.bancaditalia.it/pubblicazioni/proiezioni-macroeconomiche/2026/Proiezioni-macroeconomiche-Italia-ottobre-2026.pdf',
            category: 'economics',
            madeOn: '2026-10-16',
            dueDate: '2028-03-31',
            description: "Nelle proiezioni di ottobre 2026 la Banca d'Italia prevede una crescita del PIL dello 0,9% nel 2026, dello 0,7% nel 2027 e dello 0,8% nel 2028, con l'inflazione al 2,4% nel 2027. In uno scenario avverso, con forti rincari delle materie prime, nel 2027 la crescita sarebbe del -0,3%. Da verificare con il dato annuale Istat sul PIL 2027, di solito pubblicato a marzo dell'anno successivo.",
            createdAt: '2026-11-06T12:00:00.000Z'
        },
        {
            id: 'seed-v2-artemis-iii-2027',
            title: 'Artemis III partirà nell\'estate 2027',
            author: 'NASA',
            source: 'News 6 ClickOrlando',
            url: 'https://www.clickorlando.com/news/local/2026/10/23/artemis-iii-on-schedule-for-summer-2027-launch/',
            category: 'science',
            madeOn: '2026-10-23',
            dueDate: '2027-09-30',
            description: 'I vertici della NASA hanno confermato che la missione con equipaggio Artemis III è ancora in programma per l\'estate 2027, mentre l\'allunaggio con equipaggio è previsto per il 2028.',
            createdAt: '2026-11-06T12:01:00.000Z'
        },
        {
            id: 'seed-v2-mobileye-robotaxi-2027',
            title: 'Mobileye lancerà un proprio servizio di robotaxi in una città degli Stati Uniti nel 2027',
            author: 'Mobileye',
            source: 'CNBC',
            url: 'https://www.cnbc.com/2026/06/16/self-driving-tech-supplier-mobileye-targets-us-robotaxi-launch-in-2027.html',
            category: 'technology',
            madeOn: '2026-06-16',
            dueDate: '2027-12-31',
            description: 'Mobileye prevede di portare una prima flotta di 100 veicoli in una grande città statunitense nel corso del 2027, con un avvio graduale durante l\'anno, e punta a circa 17.000 veicoli entro cinque anni.',
            createdAt: '2026-11-06T12:02:00.000Z'
        },
        {
            id: 'seed-v2-uk-inflation-peak-2027',
            title: 'L\'inflazione nel Regno Unito toccherà il picco di circa il 4,4% a inizio 2027',
            author: 'Economisti intervistati dal Financial Times',
            source: 'Investing.com (sondaggio FT)',
            url: 'https://investing.com/news/economy-news/uk-inflation-to-peak-at-44-around-start-of-2027-ft-survey-shows-5002287',
            category: 'economics',
            madeOn: '',
            dueDate: '2027-04-30',
            description: 'Secondo un sondaggio del Financial Times tra gli economisti, l\'inflazione britannica raggiungerà un picco medio del 4,4% verso l\'inizio del 2027, ben sopra le previsioni ufficiali. Da verificare con i dati mensili ONS sui prezzi al consumo di inizio 2027.',
            createdAt: '2026-11-06T12:03:00.000Z'
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


    // Real Italian predictions (added November 2026).
    var SEED_V3 = [
        {
            id: 'seed-v3-ponte-stretto-cantieri',
            title: 'I cantieri del Ponte sullo Stretto apriranno entro il 2027',
            author: 'Matteo Salvini, ministro delle Infrastrutture',
            source: 'StrettoWeb',
            url: 'https://www.strettoweb.com/2026/10/ponte-sullo-stretto-svolta-sui-tempi-salvini-cantieri-al-via-tra-il-2026-e-il-2027-lavori-conclusi-entro-il-2033/2156161/',
            category: 'infrastructure',
            madeOn: '',
            dueDate: '2027-12-31',
            description: "A ottobre 2026 Salvini ha indicato l'avvio dei cantieri tra la fine del 2026 e il 2027, con la fine dei lavori entro il 2033. In passato l'apertura era stata annunciata per l'estate 2024, poi per la fine del 2024 e quindi per il 2026.",
            createdAt: '2026-11-06T13:00:00.000Z'
        },
        {
            id: 'seed-v3-terzo-valico-scavi',
            title: 'Gli scavi del Terzo Valico saranno completati entro la primavera 2027',
            author: 'Edoardo Rixi, viceministro, e Calogero Mauceri, commissario straordinario',
            source: 'ANSA',
            url: 'https://www.ansa.it/lombardia/notizie/2026/09/14/terzo-valico-rixi-e-mauceri-entro-la-primavera-completati-gli-scavi_295161d8-8390-482c-96e9-96a6f6bd0805.html',
            category: 'infrastructure',
            madeOn: '2026-09-14',
            dueDate: '2027-06-21',
            description: "Il viceministro Rixi e il commissario Mauceri hanno indicato la primavera 2027 per la fine degli scavi della linea ad alta capacità Genova-Milano. Il completamento dell'intera linea è previsto circa un anno dopo.",
            createdAt: '2026-11-06T13:01:00.000Z'
        },
        {
            id: 'seed-v3-san-siro-cantieri-2027',
            title: 'I lavori del nuovo stadio di San Siro inizieranno nel 2027',
            author: 'Comune di Milano, Regione Lombardia, Inter e Milan',
            source: 'Calcio e Finanza',
            url: 'https://www.calcioefinanza.it/2026/10/08/san-siro-prossimi-passi-nuovo-stadio/',
            category: 'sports',
            madeOn: '2026-10-08',
            dueDate: '2027-12-31',
            description: "Comune e Regione puntano a chiudere le autorizzazioni nel 2027 per avviare i cantieri nella seconda metà dell'anno, con lo stadio pronto per gli Europei 2032. Alcune fonti indicano invece il 2028 per l'inizio dei lavori.",
            createdAt: '2026-11-06T13:02:00.000Z'
        },
        {
            id: 'seed-v3-disoccupazione-italia-2027',
            title: 'La disoccupazione in Italia sarà al 5,7% nel 2027',
            author: 'Commissione europea',
            source: 'askanews',
            url: 'https://askanews.it/2026/05/21/ue-migliora-stime-disoccupazione-italia-in-2026-57-a-minimo-record/',
            category: 'economics',
            madeOn: '2026-05-21',
            dueDate: '2028-04-30',
            description: "Nelle previsioni di primavera 2026 la Commissione europea stima per l'Italia un tasso di disoccupazione del 5,7% sia nel 2026 sia nel 2027, minimo storico, dopo il 6,1% del 2025. Da verificare con il dato medio annuo Istat del 2027.",
            createdAt: '2026-11-06T13:03:00.000Z'
        }
    ];

    // Ids of examples that were removed. Browsers that still have them drop
    // them once when they upgrade (the first two are from the very first
    // version of the page, which used numeric ids).
    var RETIRED_SEED_IDS = { 3: ['1', '2', 'seed-1', 'seed-2', 'seed-3', 'seed-4'] };

    // Real predictions whose due date passed in October 2026 (added November 2026).
    var SEED_V5 = [
        {
            id: 'seed-v5-ponte-cipess-ottobre',
            title: 'Il CIPESS approverà la nuova delibera sul Ponte sullo Stretto entro ottobre 2026',
            author: "Pietro Ciucci, amministratore delegato di Stretto di Messina",
            source: 'Il Nord Est',
            url: 'https://www.ilnordest.it/italia-ed-esteri/ponte-stretto-ciucci-delibera-cipess-entro-ottobre-previsione-realistica-ar2xsqk8',
            category: 'infrastructure',
            madeOn: '2026-10-07',
            dueDate: '2026-10-31',
            description: "Ciucci ha definito \"abbastanza prudente e realistica\" la previsione di una nuova delibera del CIPESS entro ottobre, precisando che non si possono porre scadenze al CIPESS. La delibera serve a superare i rilievi con cui la Corte dei conti aveva negato la registrazione di quella dell'agosto 2025.",
            createdAt: '2026-11-06T14:00:00.000Z'
        },
        {
            id: 'seed-v5-cervinia-apertura-24-ottobre',
            title: 'Gli impianti di Breuil-Cervinia apriranno il 24 ottobre 2026',
            author: 'Comprensorio Breuil-Cervinia',
            source: 'Funivie.it',
            url: 'https://funivie.it/it/articoli/apertura-impianti-2026-date-comprensori/',
            category: 'sports',
            madeOn: '',
            dueDate: '2026-10-24',
            description: "Il calendario delle aperture per la stagione 2026-2027 indicava il 24 ottobre per Breuil-Cervinia e Solda, e il 28 novembre per Livigno e altre località.",
            createdAt: '2026-11-06T14:01:00.000Z'
        },
        {
            id: 'seed-v5-li-auto-i6-ottobre',
            title: 'Li Auto presenterà la nuova i6 a fine ottobre 2026',
            author: 'Li Auto',
            source: 'CnEVPost',
            url: 'https://cnevpost.com/2026/09/23/li-auto-moves-2026-i6-launch-to-late-oct/',
            category: 'technology',
            madeOn: '2026-09-23',
            dueDate: '2026-10-31',
            description: "La casa automobilistica cinese ha spostato a fine ottobre il lancio della i6 2026, mantenendo l'inizio delle consegne ai clienti a inizio novembre.",
            createdAt: '2026-11-06T14:02:00.000Z'
        },
        {
            id: 'seed-v5-phantom-blade-zero-29-ottobre',
            title: 'Il videogioco Phantom Blade Zero uscirà il 29 ottobre 2026',
            author: 'S-GAME, sviluppatore del gioco',
            source: 'Instant Gaming News',
            url: 'https://news.instant-gaming.com/en/articles/19882-phantom-blade-zero-has-been-delayed-to-october-29-2026',
            category: 'technology',
            madeOn: '',
            dueDate: '2026-10-29',
            description: "Dopo un rinvio, gli sviluppatori hanno fissato l'uscita su PS5 e PC al 29 ottobre 2026, spiegando di aver bisogno di altri 50 giorni di produzione per migliorare il gioco.",
            createdAt: '2026-11-06T14:03:00.000Z'
        }
    ];

    var SEED_GROUPS = { 2: SEED_V2, 3: SEED_V3, 5: SEED_V5 };

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
        var retired = {};
        for (var v = seenSeeds + 1; v <= SEED_VERSION; v++) {
            (RETIRED_SEED_IDS[v] || []).forEach(function (id) { retired[id] = true; });
        }
        list = list.map(normalize).filter(function (p) { return p && !retired[p.id]; });
        // Examples whose text changed (e.g. translated) are refreshed once.
        if (seenSeeds < SEED_VERSION) {
            var current = {};
            seedsAfter(0).forEach(function (p) { current[p.id] = p; });
            list = list.map(function (p) { return current[p.id] ? normalize(current[p.id]) : p; });
        }
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
        if (!str(input.title)) errors.push('Scrivi il testo della previsione.');
        if (!str(input.source)) errors.push('Indica la fonte.');
        if (!CATEGORIES[str(input.category)]) errors.push('Scegli una categoria.');
        if (!isValidDate(str(input.dueDate))) errors.push('Indica una data valida entro cui verificarla.');
        if (str(input.url) && !isValidUrl(str(input.url))) errors.push('Il link alla fonte deve iniziare con http:// o https://.');
        if (str(input.madeOn) && !isValidDate(str(input.madeOn))) errors.push('La data della previsione non è valida.');
        if (isValidDate(str(input.madeOn)) && isValidDate(str(input.dueDate)) && str(input.madeOn) > str(input.dueDate)) {
            errors.push('La data di verifica non può essere precedente alla data della previsione.');
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
