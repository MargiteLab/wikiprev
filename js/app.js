/*
 * WikiPrev UI: renders predictions, handles filters and the "add" form.
 * All data access goes through window.WikiPrevStore (js/store.js).
 *
 * User-provided text is always inserted with textContent, never innerHTML.
 */
(function () {
    'use strict';

    var store = window.WikiPrevStore;
    var CATEGORIES = window.WikiPrevModel.DEFAULT_CATEGORIES;
    var featuredId = null;
    var items = [];        // predictions currently loaded from the store
    var started = false;   // true once the main view has been set up

    function all() {
        return items.slice();
    }

    /* The contributor's name is remembered in this browser for convenience. */
    var NAME_KEY = 'wikiprev_contributor_name';

    function savedName() {
        try { return window.localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
    }

    function saveName(name) {
        try { window.localStorage.setItem(NAME_KEY, name); } catch (e) { /* not essential */ }
    }

    /* Administrator code (shared mode only), remembered in this browser. */
    var ADMIN_KEY = 'wikiprev_admin_code';
    var isAdmin = false;

    function savedAdminCode() {
        try { return window.localStorage.getItem(ADMIN_KEY) || ''; } catch (e) { return ''; }
    }

    function saveAdminCode(code) {
        try {
            if (code) window.localStorage.setItem(ADMIN_KEY, code);
            else window.localStorage.removeItem(ADMIN_KEY);
        } catch (e) { /* the code then lasts until the page is closed */ }
    }

    var sessionAdminCode = '';   // fallback when localStorage is unavailable

    function adminCode() {
        return savedAdminCode() || sessionAdminCode;
    }

    function canDelete() {
        return !store.needsAdminCode || isAdmin;
    }

    /* ---------- Helpers ---------- */

    function $(id) {
        return document.getElementById(id);
    }

    /* Create an element: el('p', { className: 'x' }, 'text' | [children]) */
    function el(tag, props, children) {
        var node = document.createElement(tag);
        if (props) {
            Object.keys(props).forEach(function (key) {
                if (key === 'className') node.className = props[key];
                else if (key === 'text') node.textContent = props[key];
                else node.setAttribute(key, props[key]);
            });
        }
        [].concat(children || []).forEach(function (child) {
            if (child == null || child === false) return;
            node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        });
        return node;
    }

    function icon(classes) {
        return el('i', { className: classes, 'aria-hidden': 'true' });
    }

    /* Date and time a prediction was added to WikiPrev, in the viewer's time zone. */
    function formatInserted(isoTimestamp) {
        var d = new Date(isoTimestamp);
        if (!isoTimestamp || isNaN(d)) return '';
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
            ' alle ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    /* "Caricata da Sergio il 06/11/2026 alle 18:05" (or without the name). */
    function insertedNode(p) {
        var when = formatInserted(p.createdAt);
        if (!when && !p.createdByName) return el('span');
        var text = (p.createdByName ? 'Caricata da ' + p.createdByName : 'Inserita') + (when ? ' il ' + when : '');
        return el('span', { className: 'added-by', title: 'Inserimento in WikiPrev' }, [icon('fas fa-user-edit'), ' ' + text]);
    }

    function formatDate(iso) {
        if (!iso) return '—';
        var parts = iso.split('-');
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    function categoryOf(p) {
        return CATEGORIES[p.category] || { label: p.category, icon: 'fa-tag' };
    }

    function sourceNode(p) {
        if (!p.url) return document.createTextNode(p.source);
        return el('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, [
            p.source, ' ', icon('fas fa-external-link-alt')
        ]);
    }

    function metaTags(p) {
        var cat = categoryOf(p);
        return el('div', { className: 'prediction-meta' }, [
            el('span', { className: 'tag', title: 'Da verificare entro il' }, [
                icon('far fa-calendar'), ' Scadenza: ' + formatDate(p.dueDate)
            ]),
            p.madeOn ? el('span', { className: 'tag', title: 'Data della previsione' }, [
                icon('far fa-clock'), ' Fatta il: ' + formatDate(p.madeOn)
            ]) : null,
            el('span', { className: 'tag ' + p.category }, [
                icon('fas ' + cat.icon), ' ' + cat.label
            ])
        ]);
    }

    /* ---------- Featured prediction ---------- */

    // A prediction counts as "just expired" for this many days after its due date.
    var RECENTLY_EXPIRED_DAYS = 30;

    function todayIso() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function daysBetween(fromIso, toIso) {
        return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
    }

    /* Order in which predictions are featured:
     * 1. expired in the last RECENTLY_EXPIRED_DAYS days, most recent first;
     * 2. not yet expired (due today or later), soonest first;
     * 3. expired longer ago, most recent first;
     * 4. without a due date. */
    function featuredOrder(list) {
        var today = todayIso();
        var recent = [], upcoming = [], older = [], undated = [];
        list.forEach(function (p) {
            if (!p.dueDate) undated.push(p);
            else if (p.dueDate >= today) upcoming.push(p);
            else if (daysBetween(p.dueDate, today) <= RECENTLY_EXPIRED_DAYS) recent.push(p);
            else older.push(p);
        });
        var asc = function (a, b) { return a.dueDate.localeCompare(b.dueDate); };
        var desc = function (a, b) { return b.dueDate.localeCompare(a.dueDate); };
        return recent.sort(desc).concat(upcoming.sort(asc), older.sort(desc), undated);
    }

    /* "Scade tra 12 giorni", "Scaduta da 3 giorni", ... */
    function dueStatus(p) {
        if (!p.dueDate) return null;
        var days = daysBetween(todayIso(), p.dueDate);
        if (days === 0) return { text: 'Scade oggi', expired: false };
        if (days === 1) return { text: 'Scade domani', expired: false };
        if (days > 1) return { text: 'Scade tra ' + days + ' giorni', expired: false };
        if (days === -1) return { text: 'Scaduta ieri', expired: true };
        return { text: 'Scaduta da ' + (-days) + ' giorni', expired: true };
    }

    function firstFeatured() {
        return featuredOrder(all())[0] || null;
    }

    function nextFeatured() {
        var order = featuredOrder(all());
        if (!order.length) return null;
        var i = order.findIndex(function (p) { return p.id === featuredId; });
        return order[(i + 1) % order.length];
    }

    function renderFeatured(p) {
        var box = $('featured-prediction');
        box.replaceChildren();
        if (!p) {
            featuredId = null;
            box.appendChild(el('p', { text: 'Ancora nessuna previsione. Aggiungi la prima qui sotto!' }));
            return;
        }
        featuredId = p.id;
        var status = dueStatus(p);
        var total = all().length;
        [
            status ? el('p', { className: 'due-status' + (status.expired ? ' expired' : '') }, [
                icon(status.expired ? 'fas fa-hourglass-end' : 'fas fa-hourglass-half'), ' ' + status.text
            ]) : null,
            el('h3', { text: p.title }),
            p.author ? el('p', { className: 'author' }, [icon('fas fa-user'), ' ' + p.author]) : null,
            el('p', { className: 'source' }, ['Fonte: ', sourceNode(p)]),
            metaTags(p),
            p.description ? el('p', { text: p.description }) : null,
            el('p', { className: 'featured-inserted' }, [insertedNode(p)]),
            total > 1 ? el('button', { type: 'button', className: 'view-all', id: 'next-featured' }, [
                icon('fas fa-forward'), ' Mostra la successiva'
            ]) : null
        ].forEach(function (node) { if (node) box.appendChild(node); });
        if (total > 1) {
            $('next-featured').addEventListener('click', function () {
                renderFeatured(nextFeatured());
            });
        }
    }

    /* ---------- List and filters ---------- */

    function readFilters() {
        return {
            text: $('filter-text').value.trim().toLowerCase(),
            category: $('filter-category').value,
            from: $('filter-from').value,
            to: $('filter-to').value,
            sort: $('filter-sort').value
        };
    }

    function applyFilters(list, f) {
        var result = list.filter(function (p) {
            if (f.category && p.category !== f.category) return false;
            if (f.from && (!p.dueDate || p.dueDate < f.from)) return false;
            if (f.to && (!p.dueDate || p.dueDate > f.to)) return false;
            if (f.text) {
                var haystack = [p.title, p.author, p.source, p.description].join(' ').toLowerCase();
                if (haystack.indexOf(f.text) === -1) return false;
            }
            return true;
        });

        var byCreated = function (a, b) { return a.createdAt.localeCompare(b.createdAt); };
        // Predictions without a due date always go last.
        var byDue = function (a, b) {
            if (!a.dueDate) return b.dueDate ? 1 : 0;
            if (!b.dueDate) return -1;
            return a.dueDate.localeCompare(b.dueDate);
        };

        switch (f.sort) {
            case 'oldest':   result.sort(byCreated); break;
            case 'due-asc':  result.sort(byDue); break;
            case 'due-desc': result.sort(function (a, b) {
                if (!a.dueDate || !b.dueDate) return byDue(a, b);
                return byDue(b, a);
            }); break;
            default:         result.sort(function (a, b) { return byCreated(b, a); });
        }
        return result;
    }

    function card(p) {
        return el('article', { className: 'prediction-card' }, [
            el('div', { className: 'card-content' }, [
                el('h3', { text: p.title }),
                p.author ? el('p', { className: 'author' }, [icon('fas fa-user'), ' ' + p.author]) : null,
                el('p', { className: 'source' }, ['Fonte: ', sourceNode(p)]),
                metaTags(p),
                el('p', { text: p.description || '' }),
                el('div', { className: 'card-actions' }, [
                    insertedNode(p),
                    canDelete() ? el('button', {
                        type: 'button',
                        className: 'delete-btn',
                        'data-id': p.id,
                        'aria-label': 'Elimina la previsione',
                        title: 'Elimina'
                    }, [icon('fas fa-trash-alt'), ' Elimina']) : null
                ])
            ])
        ]);
    }

    function renderList() {
        var everything = all();
        var list = applyFilters(everything, readFilters());
        var grid = $('predictions-grid');
        grid.replaceChildren();

        if (!list.length) {
            grid.appendChild(el('p', {
                className: 'empty-state',
                text: everything.length ? 'Nessuna previsione corrisponde ai filtri.' : 'Ancora nessuna previsione.'
            }));
        } else {
            list.forEach(function (p) { grid.appendChild(card(p)); });
        }

        $('results-count').textContent = list.length === everything.length
            ? everything.length + (everything.length === 1 ? ' previsione' : ' previsioni')
            : list.length + ' di ' + everything.length + ' previsioni';
    }

    /* ---------- Add form ---------- */

    function showMessage(text, kind) {
        var msg = $('form-message');
        msg.className = 'form-message ' + (kind || '');
        msg.replaceChildren();
        [].concat(text).forEach(function (line, i) {
            if (i) msg.appendChild(el('br'));
            msg.appendChild(document.createTextNode(line));
        });
    }

    async function onSubmit(event) {
        event.preventDefault();
        var form = event.target;
        var input = {};
        ['contributor', 'title', 'author', 'source', 'url', 'category', 'madeOn', 'dueDate', 'description']
            .forEach(function (name) { input[name] = form.elements[name].value; });

        var submit = form.querySelector('.submit-btn');
        submit.disabled = true;
        showMessage('Salvataggio…');
        var result;
        try {
            if (input.category === NEW_CATEGORY) {
                var created = await store.addCategory($('newCategory').value);
                if (!created.ok) {
                    submit.disabled = false;
                    showMessage(created.error, 'error');
                    return;
                }
                CATEGORIES = await store.categories();
                fillCategorySelects();
                $('category').value = created.id;
                toggleNewCategory();
                input.category = created.id;
            }
            result = await store.add(input);
        } catch (e) {
            result = { ok: false, errors: [e.message] };
        }
        submit.disabled = false;
        if (!result.ok) {
            showMessage(result.errors, 'error');
            return;
        }

        items.push(result.prediction);
        fillSuggestions();
        saveName(input.contributor.trim());
        form.reset();
        toggleNewCategory();
        $('contributor').value = input.contributor.trim();
        showMessage(result.saved
            ? 'Previsione aggiunta.'
            : 'Previsione aggiunta, ma non è stato possibile salvarla in questo browser: andrà persa ricaricando la pagina.',
            result.saved ? 'success' : 'error');
        renderList();
        renderFeatured(firstFeatured());
    }

    async function onDelete(event) {
        var btn = event.target.closest('.delete-btn');
        if (!btn) return;
        // Two-step delete: the first click asks for confirmation on the button itself.
        if (!btn.classList.contains('confirming')) {
            btn.classList.add('confirming');
            btn.replaceChildren(icon('fas fa-trash-alt'), ' Clicca di nuovo per eliminare');
            setTimeout(function () {
                if (!btn.isConnected) return;
                btn.classList.remove('confirming');
                btn.replaceChildren(icon('fas fa-trash-alt'), ' Elimina');
            }, 4000);
            return;
        }
        var id = btn.getAttribute('data-id');
        btn.disabled = true;
        var result = await store.remove(id, adminCode());
        if (!result.ok && result.notAdmin) {
            // The saved code is no longer valid (e.g. it was changed).
            setAdmin(false);
            $('admin-panel').hidden = false;
            $('admin-message').className = 'form-message error';
            $('admin-message').textContent = 'Il codice salvato non è più valido. Inseriscilo di nuovo.';
            return;
        }
        if (!result.ok) {
            btn.disabled = false;
            btn.classList.remove('confirming');
            btn.replaceChildren(icon('fas fa-exclamation-triangle'), ' ' + result.error);
            return;
        }
        items = items.filter(function (p) { return p.id !== id; });
        renderList();
        renderFeatured(id === featuredId ? firstFeatured() : all().find(function (p) { return p.id === featuredId; }));
    }

    /* ---------- Setup ---------- */

    var NEW_CATEGORY = '__new__';

    function fillCategorySelects() {
        ['filter-category', 'category'].forEach(function (selectId) {
            var select = $(selectId);
            var current = select.value;
            // Keep the first, "empty" option and rebuild the rest.
            while (select.options.length > 1) select.remove(1);
            Object.keys(CATEGORIES).forEach(function (key) {
                select.appendChild(el('option', { value: key, text: CATEGORIES[key].label }));
            });
            if (selectId === 'category') {
                select.appendChild(el('option', { value: NEW_CATEGORY, text: '+ Nuova categoria…' }));
            }
            select.value = current;
            if (select.value !== current) select.value = '';
        });
        toggleNewCategory();
    }

    function toggleNewCategory() {
        var isNew = $('category').value === NEW_CATEGORY;
        $('new-category-group').hidden = !isNew;
        if (!isNew) $('newCategory').value = '';
    }

    /* Suggest existing names while typing, so the same person or source is
     * always written the same way (important for statistics). */
    function fillSuggestions() {
        [['author', 'people-list'], ['source', 'outlets-list'], ['createdByName', 'contributors-list']].forEach(function (pair) {
            var names = {};
            items.forEach(function (p) { if (p[pair[0]]) names[p[pair[0]]] = true; });
            var list = $(pair[1]);
            list.replaceChildren();
            Object.keys(names).sort(function (a, b) { return a.localeCompare(b, 'it'); })
                .forEach(function (name) { list.appendChild(el('option', { value: name })); });
        });
    }

    function setupMobileMenu() {
        var btn = document.querySelector('.mobile-menu-btn');
        var links = document.querySelector('.nav-links');
        btn.addEventListener('click', function () {
            var open = links.classList.toggle('active');
            btn.setAttribute('aria-expanded', String(open));
        });
        links.addEventListener('click', function (e) {
            if (e.target.closest('a')) {
                links.classList.remove('active');
                btn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function setupMainView() {
        if (started) return;
        started = true;
        var filterForm = $('filter-form');
        filterForm.addEventListener('input', renderList);
        filterForm.addEventListener('change', renderList);
        filterForm.addEventListener('submit', function (e) { e.preventDefault(); });
        // "reset" fires before the fields are cleared, so re-render afterwards.
        filterForm.addEventListener('reset', function () { setTimeout(renderList, 0); });

        $('prediction-form').addEventListener('submit', onSubmit);
        $('category').addEventListener('change', function () {
            toggleNewCategory();
            if (!$('new-category-group').hidden) $('newCategory').focus();
        });
        $('predictions-grid').addEventListener('click', onDelete);
    }

    /* ---------- Administrator ---------- */

    function setAdmin(value, code) {
        isAdmin = value;
        if (value) {
            sessionAdminCode = code || adminCode();
            if (code) saveAdminCode(code);
        } else {
            sessionAdminCode = '';
            saveAdminCode('');
        }
        renderAdminPanel();
        if (started) renderList();
    }

    function renderAdminPanel() {
        $('admin-login').hidden = isAdmin;
        $('admin-active').hidden = !isAdmin;
    }

    function setupAdmin() {
        if (!store.needsAdminCode) return;
        $('admin-link-item').hidden = false;
        $('admin-link').addEventListener('click', function (e) {
            e.preventDefault();
            $('admin-panel').hidden = false;
            renderAdminPanel();
            $('admin-panel').scrollIntoView({ behavior: 'smooth' });
        });
        $('admin-form').addEventListener('submit', async function (e) {
            e.preventDefault();
            var code = $('admin-code').value;
            var msg = $('admin-message');
            msg.className = 'form-message';
            msg.textContent = 'Verifica…';
            var ok = false;
            try {
                ok = await store.checkAdminCode(code);
            } catch (err) {
                msg.className = 'form-message error';
                msg.textContent = err.message;
                return;
            }
            if (!ok) {
                msg.className = 'form-message error';
                msg.textContent = 'Codice non valido.';
                return;
            }
            $('admin-code').value = '';
            msg.textContent = '';
            setAdmin(true, code);
        });
        $('admin-logout').addEventListener('click', function () {
            setAdmin(false);
        });
    }

    async function restoreAdmin() {
        if (!store.needsAdminCode || !savedAdminCode()) return;
        try {
            if (await store.checkAdminCode(savedAdminCode())) {
                isAdmin = true;
                $('admin-panel').hidden = false;
                renderAdminPanel();
            } else {
                saveAdminCode('');
            }
        } catch (e) { /* keep the code; try again on next visit */ }
    }

    /* ---------- Views: loading/error and main ---------- */

    function showView(name) {
        $('status-panel').hidden = name !== 'status';
        $('app-content').hidden = name !== 'main';
    }

    function showStatus(text, isError) {
        $('status-text').textContent = text;
        $('status-panel').classList.toggle('error', Boolean(isError));
        showView('status');
    }

    async function showMain() {
        showStatus('Caricamento delle previsioni…');
        try {
            CATEGORIES = await store.categories();
            items = await store.list();
        } catch (e) {
            showStatus(e.message, true);
            return;
        }
        await restoreAdmin();
        fillCategorySelects();
        fillSuggestions();
        setupMainView();
        renderFeatured(firstFeatured());
        renderList();
        showView('main');
    }

    document.addEventListener('DOMContentLoaded', function () {
        setupMobileMenu();
        $('local-mode-banner').hidden = store.mode !== 'local';
        $('contributor').value = savedName();
        setupAdmin();
        showMain();
    });
})();
