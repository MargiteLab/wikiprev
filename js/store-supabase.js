/*
 * WikiPrev Supabase backend: shared data, no sign-in. Visitors read the
 * predictions and add them by typing their name; additions go through
 * the database function submit_prediction. Only the administrator, recognised
 * by a secret code, can delete (delete_prediction).
 * Database schema: supabase/migrations/. Same asynchronous interface as
 * store-local.js.
 */
(function (global) {
    'use strict';

    var model = global.WikiPrevModel;

    function create(config) {
        var client = global.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        var categories = model.DEFAULT_CATEGORIES;
        var categoriesLoaded = false;

        function toPrediction(row) {
            return {
                id: row.id,
                title: row.statement,
                author: row.person_name || '',
                source: row.outlet_name || '',
                url: row.source_url || '',
                category: row.category_id,
                madeOn: row.made_on || '',
                dueDate: row.due_on || '',
                description: row.details || '',
                createdAt: row.created_at,
                createdByName: row.created_by_name || ''
            };
        }

        function describeError(error) {
            var msg = (error && error.message) || String(error);
            // Messages written in Italian by the database functions are shown as they are.
            if (/^(Scrivi il tuo nome|Il nome può|Indica la fonte|Previsione non trovata|Solo l'amministratore)/.test(msg)) return msg;
            if (/predictions_dates_check/.test(msg)) return 'La data di verifica non può essere precedente alla data della previsione.';
            if (/source_url_check/.test(msg)) return 'Il link alla fonte deve iniziare con http:// o https://.';
            if (/category_id_fkey/.test(msg)) return 'Categoria non valida.';
            if (/failed to fetch|network/i.test(msg)) return 'Impossibile contattare il database. Controlla la connessione e riprova.';
            return 'Operazione non riuscita: ' + msg;
        }

        async function loadCategories() {
            if (categoriesLoaded) return;
            var res = await client.from('categories').select('id, label, icon, sort_order').order('sort_order');
            if (res.error) throw new Error(describeError(res.error));
            if (res.data.length) {
                var map = {};
                res.data.forEach(function (c) { map[c.id] = { label: c.label, icon: c.icon }; });
                categories = map;
            }
            categoriesLoaded = true;
        }

        return {
            mode: 'supabase',
            needsAdminCode: true,

            categories: async function () {
                await loadCategories();
                return categories;
            },

            list: async function () {
                var res = await client.from('predictions_view').select('*').order('created_at');
                if (res.error) throw new Error(describeError(res.error));
                return res.data.map(toPrediction);
            },

            add: async function (input) {
                var errors = model.validate(input, categories);
                if (errors.length) return { ok: false, errors: errors };
                var res = await client.rpc('submit_prediction', {
                    p_contributor_name: model.str(input.contributor),
                    p_statement: model.str(input.title),
                    p_details: model.str(input.description),
                    p_person_name: model.str(input.author) || null,
                    p_outlet_name: model.str(input.source),
                    p_source_url: model.str(input.url) || null,
                    p_category_id: model.str(input.category),
                    p_made_on: model.str(input.madeOn) || null,
                    p_due_on: model.str(input.dueDate)
                });
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

            checkAdminCode: async function (code) {
                var res = await client.rpc('is_admin_code', { p_code: code || '' });
                if (res.error) throw new Error(describeError(res.error));
                return res.data === true;
            }
        };
    }

    global.WikiPrevSupabaseStore = { create: create };
})(window);
