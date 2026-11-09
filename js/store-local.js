/*
 * WikiPrev local storage backend: keeps predictions in this browser's
 * localStorage. Used when no Supabase project is configured (js/config.js),
 * e.g. for quick previews. Same asynchronous interface as store-supabase.js.
 *
 * Stored format: { version: 1, seedVersion: N, predictions: [...],
 *                 tags: { id: { label, icon } } }   (tags added here)
 * Older data with a single "category" per prediction (and custom
 * "categories") is converted to tags when loaded.
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'wikiprev_predictions';
    var SCHEMA_VERSION = 1;

    var model = global.WikiPrevModel;
    var TAGS = {};
    Object.keys(model.DEFAULT_TAGS).forEach(function (id) { TAGS[id] = Object.assign({}, model.DEFAULT_TAGS[id]); });
    var customTags = {};
    var legacyCustomCategories = {};   // id -> label, from data saved before categories became tags
    var str = model.str;
    var isValidDate = model.isValidDate;
    var isValidUrl = model.isValidUrl;

    /* Example predictions shipped with the app, grouped by "seed version".
     * A browser that already has saved data receives only the groups newer
     * than the last one it saw, so deleted examples do not come back. */
    var SEED_VERSION = 13;

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





    function newId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    /* Bring any stored record (including the pre-v1 format that used `expiry`
     * and `verified`/`outcome`) into the current shape. Returns null if the
     * record is unusable. */
    function normalizeTags(list) {
        if (!Array.isArray(list)) return [];
        var seen = {};
        return list.filter(function (t) {
            if (!t || typeof t.id !== 'string' || !str(t.label) || seen[t.id]) return false;
            seen[t.id] = true;
            return true;
        }).map(function (t) {
            var tag = { id: t.id, label: str(t.label), icon: str(t.icon) || (TAGS[t.id] && TAGS[t.id].icon) || 'fa-hashtag' };
            // Tags used by examples or saved predictions also appear in filters and the form.
            if (!TAGS[tag.id]) TAGS[tag.id] = { label: tag.label, icon: tag.icon };
            return tag;
        });
    }

    /* The tag an old single category became. */
    function tagForCategory(category) {
        var legacy = model.LEGACY_CATEGORY_TAGS[category];
        if (legacy) return { id: legacy.id, label: legacy.label, icon: legacy.icon };
        if (legacyCustomCategories[category]) {
            var id = tagIdFor(legacyCustomCategories[category]);
            return { id: id, label: TAGS[id].label, icon: TAGS[id].icon };
        }
        return null;
    }

    function normalize(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var p = {
            id: raw.id != null ? String(raw.id) : newId(),
            title: str(raw.title),
            author: str(raw.author),
            source: str(raw.source),
            url: str(raw.url),
            madeOn: str(raw.madeOn),
            dueDate: str(raw.dueDate || raw.expiry),
            description: str(raw.description),
            createdAt: str(raw.createdAt),
            createdByName: str(raw.createdByName),
            tags: normalizeTags(raw.tags)
        };
        if (!p.title) return null;
        var fromCategory = str(raw.category) && tagForCategory(str(raw.category));
        if (fromCategory && !p.tags.some(function (t) { return t.label.toLowerCase() === fromCategory.label.toLowerCase(); })) {
            p.tags.unshift(fromCategory);
        }
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
            tags: [{ id: 'promesse-politiche', label: 'Promesse politiche' }],
            title: 'I cantieri del Ponte sullo Stretto apriranno entro il 2027',
            author: 'Matteo Salvini',
            source: 'StrettoWeb',
            url: 'https://www.strettoweb.com/2026/10/ponte-sullo-stretto-svolta-sui-tempi-salvini-cantieri-al-via-tra-il-2026-e-il-2027-lavori-conclusi-entro-il-2033/2156161/',
            category: 'infrastructure',
            madeOn: '',
            dueDate: '2027-12-31',
            description: "A ottobre 2026 il ministro delle Infrastrutture Matteo Salvini ha indicato l'avvio dei cantieri tra la fine del 2026 e il 2027, con la fine dei lavori entro il 2033. In passato l'apertura era stata annunciata per l'estate 2024, poi per la fine del 2024 e quindi per il 2026.",
            createdAt: '2026-11-06T13:00:00.000Z'
        },
        {
            id: 'seed-v3-terzo-valico-scavi',
            tags: [{ id: 'promesse-politiche', label: 'Promesse politiche' }],
            title: 'Gli scavi del Terzo Valico saranno completati entro la primavera 2027',
            author: 'Edoardo Rixi e Calogero Mauceri',
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
            author: 'Pietro Ciucci',
            source: 'Il Nord Est',
            url: 'https://www.ilnordest.it/italia-ed-esteri/ponte-stretto-ciucci-delibera-cipess-entro-ottobre-previsione-realistica-ar2xsqk8',
            category: 'infrastructure',
            madeOn: '2026-10-07',
            dueDate: '2026-10-31',
            description: "L'amministratore delegato di Stretto di Messina, Pietro Ciucci, ha definito \"abbastanza prudente e realistica\" la previsione di una nuova delibera del CIPESS entro ottobre, precisando che non si possono porre scadenze al CIPESS. La delibera serve a superare i rilievi con cui la Corte dei conti aveva negato la registrazione di quella dell'agosto 2025.",
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
            author: 'S-GAME',
            source: 'Instant Gaming News',
            url: 'https://news.instant-gaming.com/en/articles/19882-phantom-blade-zero-has-been-delayed-to-october-29-2026',
            category: 'technology',
            madeOn: '',
            dueDate: '2026-10-29',
            description: "Dopo un rinvio, gli sviluppatori di S-GAME hanno fissato l'uscita su PS5 e PC al 29 ottobre 2026, spiegando di aver bisogno di altri 50 giorni di produzione per migliorare il gioco.",
            createdAt: '2026-11-06T14:03:00.000Z'
        }
    ];

    // Torino-Lione railway (TAV) predictions (added November 2026).
    var SEED_V7 = [
        {
            id: 'seed-v7-tav-inaugurazione-2015',
            title: 'La linea Torino-Lione sarà inaugurata nel 2015',
            author: '',
            source: 'Il Fatto Quotidiano',
            url: 'https://www.ilfattoquotidiano.it/2026/01/19/tav-torino-lione-costi-ritardi-notizie/8261752/',
            category: 'tav',
            madeOn: '',
            dueDate: '2015-12-31',
            description: "Secondo la relazione speciale 02/2026 della Corte dei conti europea, la stima iniziale prevedeva l'inaugurazione del collegamento nel 2015. Il calendario del 2020 indicava il 2030 e oggi la data prevista è il 2033: 18 anni di ritardo rispetto alla stima iniziale, con costi superiori del 127%.",
            createdAt: '2026-11-06T15:00:00.000Z'
        },
        {
            id: 'seed-v7-tav-talpa-chiomonte-2027',
            title: 'La prima talpa del lato italiano inizierà a scavare a Chiomonte all\'inizio del 2027',
            author: 'TELT',
            source: "L'Indipendente",
            url: 'https://www.lindipendente.online/2026/11/02/i-lavori-per-la-tav-torino-lione-sono-stati-ritardati-di-un-anno-ancora-una-volta/',
            category: 'tav',
            madeOn: '',
            dueDate: '2027-03-31',
            description: "Il programma prevedeva l'arrivo dalla Germania della prima fresa per il cantiere di Chiomonte entro la fine del 2026 e l'avvio dello scavo a inizio 2027. A novembre 2026 TELT ha spostato l'avvio all'inizio del 2028, attribuendo il ritardo alle proteste del 25 luglio.",
            createdAt: '2026-11-06T15:01:00.000Z'
        },
        {
            id: 'seed-v7-tav-servizio-2033',
            title: 'La Torino-Lione entrerà in servizio commerciale il 31 dicembre 2033',
            author: 'TELT',
            source: 'Camera dei deputati, documentazione',
            url: 'https://temi.camera.it/leg19/post/la-tratta-ferroviaria-torino-lione.html',
            category: 'tav',
            madeOn: '',
            dueDate: '2033-12-31',
            description: "Nel luglio 2024 il consiglio di amministrazione di TELT ha fissato al 31/12/2033 l'entrata in servizio commerciale della linea. Il cronoprogramma ufficiale del 2015 indicava la fine del 2029. In Francia il Conseil d'orientation des infrastructures ha ipotizzato uno slittamento al 2035.",
            createdAt: '2026-11-06T15:02:00.000Z'
        }
    ];

    // Torino-Lione predictions from La Stampa, 17 March 2002 (article by
    // Maurizio Tropeano, "La Torino-Lione pronta a fine 2013").
    var SEED_V8 = [
        {
            id: 'seed-v8-tav-2002-ratifica-italia',
            tags: [{ id: 'promesse-politiche', label: 'Promesse politiche' }],
            title: "L'Italia ratificherà il trattato sulla Torino-Lione nei prossimi giorni",
            author: 'Governo italiano',
            source: 'La Stampa',
            url: 'http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/action,viewer/Itemid,3/page,20/articleid,0266_01_2002_0074_0022_2006045/',
            category: 'tav',
            madeOn: '2002-03-16',
            dueDate: '2002-04-30',
            description: "Lo riferisce Sergio Pininfarina, capo della delegazione italiana alla Conferenza intergovernativa: «La Francia ha già ratificato il trattato mentre il nostro governo ha garantito che lo farà nei prossimi giorni». Articolo di Maurizio Tropeano, La Stampa, 17 marzo 2002.",
            createdAt: '2026-11-06T18:00:00.000Z'
        },
        {
            id: 'seed-v8-tav-2002-studio-2003',
            title: 'La fase di studio preliminare della Torino-Lione si concluderà nel 2003',
            author: 'LTF (Lyon Turin Ferroviaire)',
            source: 'La Stampa',
            url: 'http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/action,viewer/Itemid,3/page,20/articleid,0266_01_2002_0074_0022_2006045/',
            category: 'tav',
            madeOn: '2002-03-16',
            dueDate: '2003-12-31',
            description: "Secondo il progetto di fattibilità di LTF, la società controllata da RFF e RFI, approvato dalla Conferenza intergovernativa: «la fase di studio preliminare si concluderà nel 2003 anziché nel 2006». Articolo di Maurizio Tropeano, La Stampa, 17 marzo 2002.",
            createdAt: '2026-11-06T18:01:00.000Z'
        },
        {
            id: 'seed-v8-tav-2002-cantieri-francia-2004',
            title: 'I primi cantieri della Torino-Lione sul versante francese partiranno nel 2004',
            author: 'LTF (Lyon Turin Ferroviaire)',
            source: 'La Stampa',
            url: 'http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/action,viewer/Itemid,3/page,20/articleid,0266_01_2002_0074_0022_2006045/',
            category: 'tav',
            madeOn: '2002-03-16',
            dueDate: '2004-12-31',
            description: "Dal programma operativo di LTF: dopo la fine degli studi preliminari nel 2003, «l'anno dopo dovrebbero partire i primi cantieri sul versante francese». Articolo di Maurizio Tropeano, La Stampa, 17 marzo 2002.",
            createdAt: '2026-11-06T18:02:00.000Z'
        },
        {
            id: 'seed-v8-tav-2002-lavori-italia-2005',
            title: 'I lavori della Torino-Lione sul versante italiano partiranno a metà 2005',
            author: 'LTF (Lyon Turin Ferroviaire)',
            source: 'La Stampa',
            url: 'http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/action,viewer/Itemid,3/page,20/articleid,0266_01_2002_0074_0022_2006045/',
            category: 'tav',
            madeOn: '2002-03-16',
            dueDate: '2005-06-30',
            description: "Dal programma operativo di LTF: «su quello italiano i lavori dovrebbero partire alla metà del 2005». Articolo di Maurizio Tropeano, La Stampa, 17 marzo 2002.",
            createdAt: '2026-11-06T18:03:00.000Z'
        },
        {
            id: 'seed-v8-tav-2002-fine-lavori-2012',
            tags: [{ id: 'promesse-politiche', label: 'Promesse politiche' }],
            title: 'I lavori della Torino-Lione finiranno nel 2012',
            author: 'Conferenza intergovernativa Italia-Francia',
            source: 'La Stampa',
            url: 'http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/action,viewer/Itemid,3/page,20/articleid,0266_01_2002_0074_0022_2006045/',
            category: 'tav',
            madeOn: '2002-03-16',
            dueDate: '2012-12-31',
            description: "La Conferenza intergovernativa, approvando il progetto di fattibilità, «fissa la fine dei lavori nel 2012, con un anticipo di tre anni sui tempi già stabiliti». Costo previsto: 13 miliardi di euro per 254 km, con un contributo europeo atteso fino al 20%. Articolo di Maurizio Tropeano, La Stampa, 17 marzo 2002.",
            createdAt: '2026-11-06T18:04:00.000Z'
        },
        {
            id: 'seed-v8-tav-2002-servizio-2013',
            title: 'La Torino-Lione entrerà in servizio nel 2013',
            author: 'LTF (Lyon Turin Ferroviaire)',
            source: 'La Stampa',
            url: 'http://www.archiviolastampa.it/component/option,com_lastampa/task,search/mod,libera/action,viewer/Itemid,3/page,20/articleid,0266_01_2002_0074_0022_2006045/',
            category: 'tav',
            madeOn: '2002-03-16',
            dueDate: '2013-12-31',
            description: "Il programma operativo di LTF «prevede dopo un periodo di collaudo, l'entrata in servizio della linea nel corso del 2013. Fra 11 anni, dunque, ci vorrà un'ora e 50 minuti per collegare Torino con Lione». Titolo dell'articolo: «La Torino-Lione pronta a fine 2013». Maurizio Tropeano, La Stampa, 17 marzo 2002.",
            createdAt: '2026-11-06T18:05:00.000Z'
        }
    ];

    // Clearly wrong predictions that came due between late 2021 and 2024
    // (added November 2026). Each description says how it turned out.
    var SEED_V11 = [
        {
            id: 'seed-v11-planb-bitcoin-135k-2021',
            title: 'Il bitcoin varrà almeno 135.000 dollari a dicembre 2021',
            author: 'PlanB',
            source: 'FXStreet',
            url: 'https://www.fxstreet.com/cryptocurrencies/news/bitcoin-stock-to-flow-model-invalidated-as-btc-closes-2021-below-100-000-202201010939',
            category: 'economics',
            madeOn: '',
            dueDate: '2021-12-31',
            description: "L'analista anonimo PlanB, autore del modello «stock-to-flow», aveva indicato come scenario minimo («floor model») 98.000 dollari a novembre e 135.000 a dicembre 2021, impegnandosi a considerare invalidata la previsione se il bitcoin non avesse raggiunto i 100.000 dollari entro fine anno. Com'è andata: il bitcoin ha chiuso il 2021 sotto i 50.000 dollari e a giugno 2022 è sceso fino a circa 17.600.",
            createdAt: '2026-11-06T19:00:00.000Z'
        },
        {
            id: 'seed-v11-lagarde-tassi-2022',
            title: 'È molto improbabile che la BCE alzi i tassi di interesse nel 2022',
            author: 'Christine Lagarde',
            source: 'Euronews',
            url: 'https://www.euronews.com/2021/12/16/ecb-policy-rates-lagarde',
            category: 'economics',
            madeOn: '2021-12-16',
            dueDate: '2022-12-31',
            description: "Nella conferenza stampa del 16 dicembre 2021 la presidente della BCE ha ribadito che un rialzo dei tassi nel 2022 era «molto improbabile», come aveva già detto a novembre. Com'è andata: con l'inflazione in forte crescita, la BCE ha alzato i tassi a luglio 2022, per la prima volta in 11 anni, e ancora più volte entro dicembre.",
            createdAt: '2026-11-06T19:01:00.000Z'
        },
        {
            id: 'seed-v11-fed-inflazione-2022',
            title: "L'inflazione negli Stati Uniti (indice PCE) sarà del 2,6% nel 2022",
            author: 'Federal Reserve (FOMC)',
            source: 'Federal Reserve, Summary of Economic Projections',
            url: 'https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20211215.htm',
            category: 'economics',
            madeOn: '2021-12-15',
            dueDate: '2022-12-31',
            description: "Nelle proiezioni del 15 dicembre 2021 la mediana dei membri del FOMC indicava un'inflazione PCE del 2,6% nel 2022 (dal quarto trimestre 2021 al quarto trimestre 2022), in calo dal 5,3% del 2021. Com'è andata: secondo i dati definitivi del BEA l'inflazione PCE 2022 è stata del 5,7% (sempre sul quarto trimestre), con un picco del 7,0% a giugno.",
            createdAt: '2026-11-06T19:02:00.000Z'
        },
        {
            id: 'seed-v11-musk-robotaxi-2024',
            title: 'Tesla produrrà in grandi volumi un robotaxi senza volante né pedali nel 2024',
            author: 'Elon Musk',
            source: 'TechCrunch',
            url: 'https://techcrunch.com/2022/04/20/elon-musk-mass-produce-robotaxi-by-2024',
            category: 'technology',
            madeOn: '2022-04-20',
            dueDate: '2024-12-31',
            description: "Durante la presentazione dei risultati del primo trimestre 2022 Musk ha detto che Tesla puntava a «raggiungere la produzione in volume nel 2024» di un robotaxi dedicato, senza volante né pedali, e che una corsa sarebbe costata meno di un biglietto dell'autobus. Già nel 2019 aveva promesso robotaxi per il 2020. Com'è andata: nel 2024 non è partita nessuna produzione in serie; il prototipo «Cybercab» è stato solo presentato a ottobre 2024.",
            createdAt: '2026-11-06T19:03:00.000Z'
        },
        {
            id: 'seed-v11-salvini-ponte-estate-2024',
            tags: [{ id: 'promesse-politiche', label: 'Promesse politiche' }],
            title: "I cantieri del Ponte sullo Stretto apriranno entro l'estate 2024",
            author: 'Matteo Salvini',
            source: 'Open',
            url: 'https://www.open.online/2023/09/28/ponte-sullo-stretto-salvini-inizio-estate-2024/',
            category: 'infrastructure',
            madeOn: '2023-09-28',
            dueDate: '2024-09-22',
            description: "Al congresso degli ingegneri, il 28 settembre 2023, il ministro delle Infrastrutture ha detto che l'obiettivo era aprire i cantieri «nell'estate dell'anno del Signore 2024», come aveva già detto a maggio e ripetuto alla Camera il 4 ottobre 2023. Com'è andata: nell'estate 2024 i cantieri non sono stati aperti; a giugno 2024 il direttore della società Stretto di Messina parlava di almeno un anno e mezzo, e la data è poi slittata più volte.",
            createdAt: '2026-11-06T19:04:00.000Z'
        }
    ];

    // Bank of Italy, Economic Bulletin 4/2026 (added November 2026).
    var SEED_V12 = [
        {
            id: 'seed-v12-bdi-hyperscaler-rendimenti',
            tags: [
                { id: 'intelligenza-artificiale', label: 'Intelligenza artificiale' },
                { id: 'mercati', label: 'Mercati' },
                { id: 'tecnologia', label: 'Tecnologia' }
            ],
            title: "Le emissioni di obbligazioni delle big tech per l'IA potrebbero far salire ancora i rendimenti dei titoli di Stato a lunga scadenza",
            author: "Banca d'Italia",
            source: "Banca d'Italia, Bollettino economico",
            url: 'https://www.bancaditalia.it/pubblicazioni/bollettino-economico/2026-4/boleco-4-2026.pdf',
            category: 'economics',
            madeOn: '2026-10-16',
            dueDate: '2028-12-31',
            description: "Nel Bollettino economico 4/2026 (riquadro «Il recente rialzo dei rendimenti dei titoli pubblici a lunga scadenza», p. 12) la Banca d'Italia osserva che nei primi otto mesi del 2026 le obbligazioni in dollari delle imprese statunitensi sono cresciute del 47%, trainate dalle «hyperscalers» che costruiscono le infrastrutture dell'IA, e scrive: «In prospettiva, le cospicue emissioni di titoli privati, soprattutto sulle scadenze più lunghe, potrebbero accrescere la concorrenza con gli emittenti pubblici nei segmenti a maggiore durata, alimentando ulteriori pressioni al rialzo sui rendimenti dei titoli». Nello stesso riquadro ricorda che rendimenti più elevati aumentano gli oneri del debito pubblico. Da verificare con l'andamento dei rendimenti decennali (Stati Uniti, Germania, Italia) nel 2027-2028.",
            createdAt: '2026-11-09T10:00:00.000Z'
        }
    ];

    // Clearly wrong predictions from the last 30 years (added November 2026).
    var SEED_V13 = [
        {
            id: 'seed-v13-krugman-internet-fax-2005',
            tags: [{ id: 'economia', label: 'Economia' }, { id: 'tecnologia', label: 'Tecnologia' }],
            title: "Entro il 2005 sarà chiaro che Internet non ha avuto sull'economia un impatto maggiore del fax",
            author: 'Paul Krugman',
            source: 'Red Herring',
            url: 'https://quoteinvestigator.com/2023/10/26/internet-fax/',
            madeOn: '1998-06-10',
            dueDate: '2005-12-31',
            description: "Nell'articolo «Why most economists' predictions are wrong» (Red Herring, giugno 1998) l'economista, poi premio Nobel, scrisse: «By 2005 or so, it will become clear that the Internet's impact on the economy has been no greater than the fax machine's». Com'è andata: nel 2005 il commercio elettronico, i motori di ricerca e la pubblicità online erano già settori da decine di miliardi. Nel 2013 Krugman ha detto che il pezzo voleva essere «divertente e provocatorio», non una previsione accurata. Il link porta alla ricostruzione della citazione su Quote Investigator.",
            createdAt: '2026-11-09T16:00:00.000Z'
        },
        {
            id: 'seed-v13-dow-36000-2004',
            tags: [{ id: 'economia', label: 'Economia' }, { id: 'mercati', label: 'Mercati' }],
            title: 'Il Dow Jones arriverà a 36.000 punti entro tre-cinque anni',
            author: 'James Glassman e Kevin Hassett',
            source: 'Dow 36,000 (libro, 1999)',
            url: 'https://en.wikipedia.org/wiki/Dow_36,000',
            madeOn: '',
            dueDate: '2004-12-31',
            description: "Nel libro «Dow 36,000», uscito nel 1999 con l'indice intorno agli 11.000 punti, i due autori sostenevano che le azioni erano sottovalutate e che il Dow Jones avrebbe toccato 36.000 punti in tre-cinque anni. Com'è andata: dopo lo scoppio della bolla delle dot-com il Dow è sceso sotto gli 8.000 punti nel 2002; ha chiuso per la prima volta sopra 36.000 solo il 2 novembre 2021, 22 anni dopo. Nel 2010 gli autori hanno riconosciuto di aver perso una scommessa sulla previsione.",
            createdAt: '2026-11-09T16:01:00.000Z'
        },
        {
            id: 'seed-v13-gates-spam-2006',
            tags: [{ id: 'tecnologia', label: 'Tecnologia' }],
            title: 'Fra due anni il problema dello spam sarà risolto',
            author: 'Bill Gates',
            source: 'The Register',
            url: 'https://www.theregister.com/2004/01/26/well_kill_spam_in_two/',
            madeOn: '2004-01-23',
            dueDate: '2006-01-31',
            description: "Al World Economic Forum di Davos, a gennaio 2004, il fondatore di Microsoft disse: «Two years from now, spam will be solved», puntando su sistemi di identificazione dei mittenti e su un piccolo costo per ogni email inviata. Com'è andata: nel 2007 si stima che siano state inviate circa 10.800 miliardi di email di spam, più di quelle legittime; i filtri sono migliorati negli anni successivi, ma lo spam non è mai scomparso.",
            createdAt: '2026-11-09T16:02:00.000Z'
        },
        {
            id: 'seed-v13-alitalia-utile-2017',
            tags: [{ id: 'economia', label: 'Economia' }, { id: 'trasporti', label: 'Trasporti' }],
            title: 'Alitalia tornerà in utile nel 2017',
            author: 'Luca Cordero di Montezemolo',
            source: 'Sky TG24',
            url: 'https://tg24.sky.it/economia/2015/01/20/alitalia_presentazione_nuova_societ__ethiad_montezemolo_hogan_cassano',
            madeOn: '2015-01-20',
            dueDate: '2017-12-31',
            description: "Presentando la nuova Alitalia nata dall'ingresso di Etihad, il presidente Montezemolo indicò il 2017 come anno del ritorno all'utile; l'amministratore delegato Silvano Cassano parlò di circa 100 milioni di euro. Il piano di Etihad del 2014 prevedeva 108 milioni di utile nel 2017. Com'è andata: il 2 maggio 2017 Alitalia ha chiesto l'amministrazione straordinaria, con perdite stimate di centinaia di milioni.",
            createdAt: '2026-11-09T16:03:00.000Z'
        },
        {
            id: 'seed-v13-musk-milione-robotaxi-2020',
            tags: [{ id: 'tecnologia', label: 'Tecnologia' }],
            title: "L'anno prossimo ci saranno più di un milione di robotaxi Tesla in strada",
            author: 'Elon Musk',
            source: 'TechCrunch',
            url: 'https://techcrunch.com/2019/04/22/tesla-plans-to-launch-a-robotaxi-network-in-2020/',
            madeOn: '2019-04-22',
            dueDate: '2020-12-31',
            description: "All'«Autonomy Day» di Tesla, il 22 aprile 2019, Musk disse: «next year for sure, we'll have over a million robotaxis on the road», spiegando che sarebbe bastato un aggiornamento software delle auto già vendute. Com'è andata: nel 2020 non c'era nessun robotaxi Tesla in servizio; nel 2022 Musk spostava l'obiettivo a una produzione in volume nel 2024 (vedi la previsione relativa).",
            createdAt: '2026-11-09T16:04:00.000Z'
        }
    ];

    var SEED_GROUPS = { 2: SEED_V2, 3: SEED_V3, 5: SEED_V5, 7: SEED_V7, 8: SEED_V8, 11: SEED_V11, 12: SEED_V12, 13: SEED_V13 };

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

    function loadCustomCategories() {
        var data = readStorage();
        var stored = data && !Array.isArray(data) && data.categories;
        if (stored && typeof stored === 'object') {
            Object.keys(stored).forEach(function (id) {
                var c = stored[id];
                if (c && str(c.label)) legacyCustomCategories[id] = str(c.label);
            });
        }
        var storedTags = data && !Array.isArray(data) && data.tags;
        if (storedTags && typeof storedTags === 'object') {
            Object.keys(storedTags).forEach(function (id) {
                var t = storedTags[id];
                if (/^[a-z][a-z0-9-]*$/.test(id) && t && str(t.label)) {
                    customTags[id] = { label: str(t.label), icon: str(t.icon) || 'fa-hashtag' };
                    TAGS[id] = customTags[id];
                }
            });
        }
    }

    loadCustomCategories();
    var loaded = load();
    var predictions = loaded.list;

    function save() {
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: SCHEMA_VERSION,
                seedVersion: SEED_VERSION,
                predictions: predictions,
                tags: customTags
            }));
            return true;
        } catch (e) {
            return false;
        }
    }


    function add(input) {
        var errors = model.validate(input);
        if (errors.length) return { ok: false, errors: errors };
        var p = normalize({
            id: newId(),
            title: input.title,
            author: input.author,
            source: input.source,
            url: input.url,
            madeOn: input.madeOn,
            dueDate: input.dueDate,
            description: input.description,
            createdAt: new Date().toISOString(),
            createdByName: input.contributor,
            tags: (input.tags || []).map(function (label) {
                var id = tagIdFor(label);
                return { id: id, label: TAGS[id].label, icon: TAGS[id].icon };
            })
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

    /* Find a tag by name ignoring case, creating it if needed. */
    function tagIdFor(label) {
        var clean = str(label).replace(/\s+/g, ' ');
        var existing = Object.keys(TAGS).filter(function (id) {
            return TAGS[id].label.toLowerCase() === clean.toLowerCase();
        })[0];
        if (existing) return existing;
        var id = model.tagIdFor(clean, TAGS);
        customTags[id] = { label: clean, icon: 'fa-hashtag' };
        TAGS[id] = customTags[id];
        return id;
    }

    function all() {
        return predictions.slice();
    }

    function resolved(value) {
        return Promise.resolve(value);
    }

    global.WikiPrevLocalStore = {
        mode: 'local',
        needsAdminCode: false,
        checkAdminCode: function () { return resolved(true); },
        tags: function () { return resolved(Object.assign({}, TAGS)); },
        logVisit: function () { return resolved(); },
        list: function () { return resolved(all()); },
        add: function (input) { return resolved(add(input)); },
        remove: function (id) { remove(id); return resolved({ ok: true }); }
    };
})(window);
