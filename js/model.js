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
        infrastructure: { label: 'Infrastrutture', icon: 'fa-road' }
    };

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
        if (isValidDate(str(input.madeOn)) && isValidDate(str(input.dueDate)) && str(input.madeOn) > str(input.dueDate)) {
            errors.push('La data di verifica non può essere precedente alla data della previsione.');
        }
        return errors;
    }

    global.WikiPrevModel = {
        DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
        str: str,
        isValidDate: isValidDate,
        isValidUrl: isValidUrl,
        validate: validate
    };
})(window);
