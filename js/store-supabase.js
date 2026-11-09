/*
 * WikiPrev Supabase backend: shared data, no sign-in. Visitors read the
 * predictions and add them by typing their name; additions go through the
 * database function add_tagged_prediction (migration 0013). Only the
 * administrator, recognised by a secret code, can delete (delete_prediction).
 * Database schema: supabase/migrations/. Same asynchronous interface as
 * store-local.js.
 *
 * Until migration 0013 is applied, the old category of each prediction is
 * shown as one of its tags, so the site looks the same before and after.
 */
(function (global) {
    'use strict';

    var model = global.WikiPrevModel;

    function create(config) {
        var client = global.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        // Old categories, used only while migration 0013 has not been applied.
        var legacyCategories = null;   // { categoryId: { label, icon } }

        // True once tags have an icon column, i.e. migration 0013 has been
        // applied: from then on old categories are ignored.
        var categoriesMigrated = false;

        async function loadLegacyCategories() {
            if (categoriesMigrated) return {};
            if (legacyCategories) return legacyCategories;
            var res = await client.from('categories').select('id, label, icon');
            legacyCategories = {};
            if (!res.error) res.data.forEach(function (c) { legacyCategories[c.id] = { label: c.label, icon: c.icon }; });
            return legacyCategories;
        }

        function sameLabel(a, b) {
            return a.toLowerCase() === b.toLowerCase();
        }

        function toPrediction(row) {
            var tags = (Array.isArray(row.tags) ? row.tags : []).map(function (t) {
                return { id: t.id, label: t.label, icon: t.icon || 'fa-hashtag' };
            });
            var cat = row.category_id && legacyCategories && legacyCategories[row.category_id];
            if (cat && !tags.some(function (t) { return sameLabel(t.label, cat.label); })) {
                tags.unshift({ id: model.tagIdFor(cat.label), label: cat.label, icon: cat.icon || 'fa-hashtag' });
            }
            return {
                id: row.id,
                title: row.statement,
                author: row.person_name || '',
                source: row.outlet_name || '',
                url: row.source_url || '',
                madeOn: row.made_on || '',
                dueDate: row.due_on || '',
                description: row.details || '',
                createdAt: row.created_at,
                createdByName: row.created_by_name || '',
                tags: tags
            };
        }

        function describeError(error) {
            var msg = (error && error.message) || String(error);
            // Messages written in Italian by the database functions are shown as they are.
            if (/^(Scrivi il tuo nome|Il nome può|Indica la fonte|Previsione non trovata|Solo l'amministratore|Il nome di un tag|Il nome di un'etichetta|Puoi indicare al massimo|Scegli almeno un tag|Solo l'amministratore può vedere)/.test(msg)) return msg;
            if (/predictions_dates_check/.test(msg)) return 'La data di verifica non può essere precedente alla data della previsione.';
            if (/source_url_check/.test(msg)) return 'Il link alla fonte deve iniziare con http:// o https://.';
            if (/failed to fetch|network/i.test(msg)) return 'Impossibile contattare il database. Controlla la connessione e riprova.';
            return 'Operazione non riuscita: ' + msg;
        }

        return {
            mode: 'supabase',
            needsAdminCode: true,

            /* All tags, plus (before migration 0013) the old categories. */
            tags: async function () {
                var res = await client.from('tags').select('*').order('label');
                if (res.error) throw new Error(describeError(res.error));
                var map = {};
                res.data.forEach(function (t) { map[t.id] = { label: t.label, icon: t.icon || 'fa-hashtag' }; });
                if (res.data.some(function (t) { return 'icon' in t; })) {
                    categoriesMigrated = true;
                    legacyCategories = {};
                }
                var cats = await loadLegacyCategories();
                Object.keys(cats).forEach(function (cid) {
                    var label = cats[cid].label;
                    var exists = Object.keys(map).some(function (id) { return sameLabel(map[id].label, label); });
                    if (!exists) map[model.tagIdFor(label)] = { label: label, icon: cats[cid].icon || 'fa-hashtag' };
                });
                return map;
            },

            list: async function () {
                await loadLegacyCategories();
                var res = await client.from('predictions_view').select('*').order('created_at');
                if (res.error) throw new Error(describeError(res.error));
                return res.data.map(toPrediction);
            },

            add: async function (input) {
                var errors = model.validate(input);
                if (errors.length) return { ok: false, errors: errors };
                var res = await client.rpc('add_tagged_prediction', {
                    p_contributor_name: model.str(input.contributor),
                    p_statement: model.str(input.title),
                    p_details: model.str(input.description),
                    p_person_name: model.str(input.author) || null,
                    p_outlet_name: model.str(input.source),
                    p_source_url: model.str(input.url) || null,
                    p_made_on: model.str(input.madeOn) || null,
                    p_due_on: model.str(input.dueDate),
                    p_tags: (input.tags || []).map(model.str)
                });
                if (res.error && /PGRST202|Could not find the function/i.test(res.error.code + ' ' + res.error.message)) {
                    return { ok: false, errors: ['Il sito è stato aggiornato: per salvare serve la migrazione 0013 nel SQL Editor di Supabase.'] };
                }
                if (res.error) return { ok: false, errors: [describeError(res.error)] };
                var row = await client.from('predictions_view').select('*').eq('id', res.data).single();
                if (row.error) return { ok: false, errors: [describeError(row.error)] };
                return { ok: true, saved: true, prediction: toPrediction(row.data) };
            },

            remove: async function (id, adminCode) {
                var res = await client.rpc('delete_prediction', { p_id: id, p_admin_code: adminCode || '' });
                if (res.error) {
                    return { ok: false, error: describeError(res.error), notAdmin: res.error.code === '42501' };
                }
                return { ok: true };
            },

            /* Never fails: a visit that cannot be recorded is simply not counted. */
            logVisit: async function (sessionId, referrerHost, device) {
                try {
                    await client.rpc('log_visit', {
                        p_session_id: sessionId,
                        p_referrer_host: referrerHost || null,
                        p_device: device
                    });
                } catch (e) { /* ignore */ }
            },

            visitStats: async function (adminCode, days) {
                var res = await client.rpc('visit_stats', { p_admin_code: adminCode || '', p_days: days || 30 });
                if (res.error) {
                    if (/PGRST202|Could not find the function/i.test(res.error.code + ' ' + res.error.message)) {
                        throw new Error('Il contatore delle visite non è ancora attivo: esegui la migrazione 0011 nel SQL Editor di Supabase.');
                    }
                    throw new Error(describeError(res.error));
                }
                return res.data;
            },

            checkAdminCode: async function (code) {
                var res = await client.rpc('is_admin_code', { p_code: code || '' });
                if (res.error) throw new Error(describeError(res.error));
                return res.data === true;
            }
        };
    }

    global.WikiPrevSupabaseStore = { create: create };
})(window);
