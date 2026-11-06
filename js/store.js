/*
 * Picks the storage backend: Supabase when js/config.js is filled in and the
 * Supabase library loaded, otherwise this browser's localStorage.
 */
(function (global) {
    'use strict';

    var config = global.WIKIPREV_CONFIG || {};
    var configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

    if (!configured) {
        global.WikiPrevStore = global.WikiPrevLocalStore;
    } else if (global.supabase && global.WikiPrevSupabaseStore) {
        global.WikiPrevStore = global.WikiPrevSupabaseStore.create(config);
    } else {
        // Configured for the shared database but the library did not load:
        // never fall back to local mode silently, or data would not be shared.
        var failure = new Error('Impossibile caricare la libreria del database. Controlla la connessione e ricarica la pagina.');
        var fail = function () { return Promise.reject(failure); };
        global.WikiPrevStore = {
            mode: 'supabase',
            categories: fail,
            list: fail,
            add: fail,
            remove: fail,
            checkAdminCode: fail,
            addCategory: fail,
            tags: fail,
            supportsTags: function () { return false; }
        };
    }
})(window);
