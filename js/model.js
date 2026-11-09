/*
 * WikiPrev shared model: default tags, validation and small helpers used by
 * both storage backends (store-local.js and store-supabase.js).
 *
 * A prediction, as the UI sees it:
 * {
 *   id:            string   unique identifier
 *   title:         string   the prediction itself
 *   author:        string   who made it ("" if unknown)
 *   source:        string   where it was published
 *   url:           string   link to the original article ("" if none)
 *   madeOn:        string   date it was made, YYYY-MM-DD ("" if unknown)
 *   dueDate:       string   date by which it can be checked, YYYY-MM-DD
 *   description:   string   details ("" if none)
 *   createdAt:     string   ISO timestamp of when it was added to WikiPrev
 *   createdByName: string   name of who added it ("" for the bundled examples)
 *   tags:          array    [{ id, label, icon }], at least one
 *   outcomeLinks:  array    links to news showing how it went, oldest first:
 *                           [{ id, url, note, addedBy, createdAt }]
 * }
 *
 * Until November 2026 a prediction also had a single "category"; categories
 * have become tags (see supabase/migrations/0013_categories_become_tags.sql).
 */
(function (global) {
    'use strict';

    // Old category id -> the tag it became.
    var LEGACY_CATEGORY_TAGS = {
        politics:       { id: 'politica',       label: 'Politica',       icon: 'fa-landmark' },
        economics:      { id: 'economia',       label: 'Economia',       icon: 'fa-chart-line' },
        technology:     { id: 'tecnologia',     label: 'Tecnologia',     icon: 'fa-microchip' },
        sports:         { id: 'sport',          label: 'Sport',          icon: 'fa-running' },
        science:        { id: 'scienza',        label: 'Scienza',        icon: 'fa-flask' },
        infrastructure: { id: 'infrastrutture', label: 'Infrastrutture', icon: 'fa-road' },
        tav:            { id: 'tav',            label: 'TAV',            icon: 'fa-train' }
    };

    var DEFAULT_TAGS = {};
    Object.keys(LEGACY_CATEGORY_TAGS).forEach(function (k) {
        var t = LEGACY_CATEGORY_TAGS[k];
        DEFAULT_TAGS[t.id] = { label: t.label, icon: t.icon };
    });
    DEFAULT_TAGS['promesse-politiche'] = { label: 'Promesse politiche', icon: 'fa-hashtag' };

    var MAX_TAGS = 10;

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

    function tagLabelError(label) {
        var clean = str(label).replace(/\s+/g, ' ');
        if (clean.length < 2 || clean.length > 40) return 'Il nome di un tag deve avere tra 2 e 40 caratteri.';
        return '';
    }

    /* "Opere pubbliche" -> "opere-pubbliche". Same rule as tag_id_for() in the
     * database (prefix "tag" when the name does not start with a letter). */
    function tagIdFor(label, existing) {
        var base = str(label).toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (!/^[a-z]/.test(base)) base = ('tag-' + base).replace(/-+$/, '');
        var id = base, n = 1;
        while (existing && existing[id]) { n += 1; id = base + '-' + n; }
        return id;
    }

    /* Returns a list of human-readable problems; empty list means valid. */
    function validate(input) {
        var errors = [];
        if (!str(input.contributor)) errors.push('Scrivi il tuo nome.');
        else if (str(input.contributor).length > 80) errors.push('Il nome può avere al massimo 80 caratteri.');
        if (!str(input.title)) errors.push('Scrivi il testo della previsione.');
        else if (str(input.title).length > 300) errors.push('Il testo della previsione può avere al massimo 300 caratteri.');
        if (!str(input.source)) errors.push('Indica la fonte.');
        var tags = input.tags || [];
        if (!tags.length) errors.push('Scegli almeno un tag.');
        if (tags.length > MAX_TAGS) errors.push('Puoi indicare al massimo ' + MAX_TAGS + ' tag.');
        tags.forEach(function (t) { var e = tagLabelError(t); if (e && errors.indexOf(e) === -1) errors.push(e); });
        if (!isValidDate(str(input.dueDate))) errors.push('Indica una data valida entro cui verificarla.');
        if (str(input.url) && !isValidUrl(str(input.url))) errors.push('Il link alla fonte deve iniziare con http:// o https://.');
        if (str(input.madeOn) && !isValidDate(str(input.madeOn))) errors.push('La data della previsione non è valida.');
        if (isValidDate(str(input.madeOn)) && isValidDate(str(input.dueDate)) && str(input.madeOn) > str(input.dueDate)) {
            errors.push('La data di verifica non può essere precedente alla data della previsione.');
        }
        return errors;
    }

    var MAX_NOTE = 300;

    /* Checks a "Com'è andata" link before it is saved. */
    function validateOutcomeLink(input, prediction) {
        var errors = [];
        if (!str(input.contributor)) errors.push('Scrivi il tuo nome.');
        else if (str(input.contributor).length > 80) errors.push('Il nome può avere al massimo 80 caratteri.');
        if (!isValidUrl(str(input.url))) errors.push('Il link deve iniziare con http:// o https://.');
        if (str(input.note).length > MAX_NOTE) errors.push('La nota può avere al massimo ' + MAX_NOTE + ' caratteri.');
        if (prediction && (prediction.outcomeLinks || []).some(function (l) {
            return l.url.toLowerCase() === str(input.url).toLowerCase();
        })) errors.push('Questo link è già stato aggiunto.');
        return errors;
    }

    global.WikiPrevModel = {
        MAX_NOTE: MAX_NOTE,
        validateOutcomeLink: validateOutcomeLink,
        LEGACY_CATEGORY_TAGS: LEGACY_CATEGORY_TAGS,
        DEFAULT_TAGS: DEFAULT_TAGS,
        MAX_TAGS: MAX_TAGS,
        tagLabelError: tagLabelError,
        tagIdFor: tagIdFor,
        str: str,
        isValidDate: isValidDate,
        isValidUrl: isValidUrl,
        validate: validate
    };
})(window);
