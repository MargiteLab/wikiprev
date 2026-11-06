/*
 * WikiPrev Supabase backend: shared data for signed-in members.
 * Database schema: supabase/migrations/. Same asynchronous interface as
 * store-local.js.
 */
(function (global) {
    'use strict';

    var model = global.WikiPrevModel;

    function create(config) {
        var client = global.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        var categories = model.DEFAULT_CATEGORIES;

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
            if (/signups not allowed|user not found/i.test(msg)) {
                return 'Questo indirizzo email non è tra quelli invitati. Chiedi a chi gestisce WikiPrev di invitarti.';
            }
            if (/rate limit|security purposes/i.test(msg)) {
                return 'Hai chiesto troppi link in poco tempo. Riprova tra qualche minuto.';
            }
            if (/failed to fetch|network/i.test(msg)) {
                return 'Impossibile contattare il database. Controlla la connessione e riprova.';
            }
            if (/JWT|not signed in|permission denied/i.test(msg)) {
                return 'La sessione è scaduta. Esci e accedi di nuovo.';
            }
            return 'Operazione non riuscita: ' + msg;
        }

        async function loadUser(session) {
            if (!session || !session.user) return null;
            var res = await client.from('profiles').select('display_name').eq('id', session.user.id).maybeSingle();
            return {
                id: session.user.id,
                email: session.user.email,
                name: (res.data && res.data.display_name) || session.user.email
            };
        }

        async function loadCategories() {
            var res = await client.from('categories').select('id, label, icon, sort_order').order('sort_order');
            if (res.error || !res.data || !res.data.length) return;
            var map = {};
            res.data.forEach(function (c) { map[c.id] = { label: c.label, icon: c.icon }; });
            categories = map;
        }

        return {
            mode: 'supabase',

            init: async function () {
                var res = await client.auth.getSession();
                var user = await loadUser(res.data && res.data.session);
                if (user) await loadCategories();
                return { user: user };
            },

            categories: function () {
                return Promise.resolve(categories);
            },

            list: async function () {
                var res = await client.from('predictions_view').select('*').order('created_at');
                if (res.error) throw new Error(describeError(res.error));
                return res.data.map(toPrediction);
            },

            add: async function (input) {
                var errors = model.validate(input, categories);
                if (errors.length) return { ok: false, errors: errors };
                var res = await client.rpc('add_prediction', {
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

            remove: async function (id) {
                var res = await client.from('predictions')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', id);
                if (res.error) return { ok: false, error: describeError(res.error) };
                return { ok: true };
            },

            signIn: async function (email) {
                var res = await client.auth.signInWithOtp({
                    email: email,
                    options: {
                        shouldCreateUser: false,
                        emailRedirectTo: global.location.href.split('#')[0]
                    }
                });
                if (res.error) return { ok: false, error: describeError(res.error) };
                return { ok: true };
            },

            signOut: async function () {
                await client.auth.signOut();
            },

            /* cb(user | null) whenever the user signs in or out. */
            onAuthChange: function (cb) {
                client.auth.onAuthStateChange(function (event, session) {
                    if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;
                    // Supabase advises against awaiting its own calls inside this callback.
                    setTimeout(async function () {
                        var user = await loadUser(session);
                        if (user) await loadCategories();
                        cb(user);
                    }, 0);
                });
            }
        };
    }

    global.WikiPrevSupabaseStore = { create: create };
})(window);
