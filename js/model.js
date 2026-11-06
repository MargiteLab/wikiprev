/*
 * WikiPrev shared model: default categories, validation and small helpers
 * used by both storage backends (store-local.js and store-supabase.js).
 *
 * A prediction, as the UI sees it:
 * {
 *   id:            string   unique identifier
 *   title:         string   the prediction itself
 *   author:        string   who made it ("" if unknown)
 *   source:        string   where it was published
 *   url:           string   link to the original article ("" if none)
 *   category:      string   category id
 *   madeOn:        string   date it was made, YYYY-MM-DD ("" if unknown)
 *   dueDate:       string   date by which it can be checked, YYYY-MM-DD
 *   description:   string   details ("" if none)
 *   createdAt:     string   ISO timestamp of when it was added to WikiPrev
 *   createdByName: string   name of who added it ("" for the bundled examples)
 *   tags:          array    [{ id, label }], any number (may be empty)
 * }
 */
(function (global) {
    'use strict';

    var DEFAULT_CATEGORIES = {
        politics:       { label: 'Politica',       icon: 'fa-landmark' },
        economics:      { label: 'Economia',       icon: 'fa-chart-line' },
        technology:     { label: 'Tecnologia',     icon: 'fa-microchip' },
        sports:         { label: 'Sport',          icon: 'fa-running' },
        science:        { label: 'Scienza',        icon: 'fa-flask' },
        infrastructure: { label: 'Infrastrutture', icon: 'fa-road' },
        tav:            { label: 'TAV',            icon: 'fa-train' }
    };

    var DEFAULT_TAGS = {
        'promesse-politiche': { label: 'Promesse politiche' }
    };

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

    /* Category names: 2-40 characters, spaces collapsed. Returns an error or "". */
    function categoryLabelError(label) {
        var clean = str(label).replace(/\s+/g, ' ');
        if (clean.length < 2 || clean.length > 40) return 'Il nome della categoria deve avere tra 2 e 40 caratteri.';
        return '';
    }

    function tagLabelError(label) {
        var clean = str(label).replace(/\s+/g, ' ');
        if (clean.length < 2 || clean.length > 40) return "Il nome di un'etichetta deve avere tra 2 e 40 caratteri.";
        return '';
    }

    /* "Opere pubbliche" -> "opere-pubbliche". Same rule as add_category() and
     * tag_id_for() in the database (prefix "cat" or "tag" when needed). */
    function categoryIdFor(label, existing, prefix) {
        var base = str(label).toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (!/^[a-z]/.test(base)) base = ((prefix || 'cat') + '-' + base).replace(/-+$/, '');
        var id = base, n = 1;
        while (existing && existing[id]) { n += 1; id = base + '-' + n; }
        return id;
    }

    /* Returns a list of human-readable problems; empty list means valid. */
    function validate(input, categories) {
        var errors = [];
        if (!str(input.contributor)) errors.push('Scrivi il tuo nome.');
        else if (str(input.contributor).length > 80) errors.push('Il nome può avere al massimo 80 caratteri.');
        if (!str(input.title)) errors.push('Scrivi il testo della previsione.');
        else if (str(input.title).length > 300) errors.push('Il testo della previsione può avere al massimo 300 caratteri.');
        if (!str(input.source)) errors.push('Indica la fonte.');
        if (!(categories || DEFAULT_CATEGORIES)[str(input.category)]) errors.push('Scegli una categoria.');
        if (!isValidDate(str(input.dueDate))) errors.push('Indica una data valida entro cui verificarla.');
        if (str(input.url) && !isValidUrl(str(input.url))) errors.push('Il link alla fonte deve iniziare con http:// o https://.');
        if (str(input.madeOn) && !isValidDate(str(input.madeOn))) errors.push('La data della previsione non è valida.');
        var tags = input.tags || [];
        if (tags.length > MAX_TAGS) errors.push('Puoi indicare al massimo ' + MAX_TAGS + ' etichette.');
        tags.forEach(function (t) { var e = tagLabelError(t); if (e && errors.indexOf(e) === -1) errors.push(e); });
        if (isValidDate(str(input.madeOn)) && isValidDate(str(input.dueDate)) && str(input.madeOn) > str(input.dueDate)) {
            errors.push('La data di verifica non può essere precedente alla data della previsione.');
        }
        return errors;
    }

    global.WikiPrevModel = {
        DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
        DEFAULT_TAGS: DEFAULT_TAGS,
        MAX_TAGS: MAX_TAGS,
        tagLabelError: tagLabelError,
        str: str,
        isValidDate: isValidDate,
        isValidUrl: isValidUrl,
        categoryLabelError: categoryLabelError,
        categoryIdFor: categoryIdFor,
        validate: validate
    };
})(window);
