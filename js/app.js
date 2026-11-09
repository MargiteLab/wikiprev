/*
 * WikiPrev UI: featured predictions, list and filters, the "add" form and the
 * single-prediction page (address ?p=<id>).
 * All data access goes through window.WikiPrevStore (js/store.js).
 *
 * User-provided text is always inserted with textContent, never innerHTML.
 */
(function () {
    'use strict';

    var store = window.WikiPrevStore;
    var TAGS = window.WikiPrevModel.DEFAULT_TAGS;
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

    /* Link to a prediction's own page. */
    function predictionUrl(id) {
        return window.location.pathname + '?p=' + encodeURIComponent(id);
    }

    function predictionAbsoluteUrl(id) {
        return window.location.origin + predictionUrl(id);
    }

    function tagChips(p) {
        return (p.tags || []).map(function (t) {
            return el('span', { className: 'tag t-' + t.id, title: 'Tag' }, [icon('fas ' + (t.icon || 'fa-hashtag')), ' ' + t.label]);
        });
    }

    function sourceNode(p) {
        if (!p.url) return document.createTextNode(p.source);
        return el('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, [
            p.source, ' ', icon('fas fa-external-link-alt')
        ]);
    }

    function metaTags(p) {
        return el('div', { className: 'prediction-meta' }, [
            el('span', { className: 'tag', title: 'Da verificare entro il' }, [
                icon('far fa-calendar'), ' Scadenza: ' + formatDate(p.dueDate)
            ]),
            p.madeOn ? el('span', { className: 'tag', title: 'Data della previsione' }, [
                icon('far fa-clock'), ' Fatta il: ' + formatDate(p.madeOn)
            ]) : null
        ].concat(tagChips(p)));
    }

    /* ---------- Featured predictions ---------- */

    function todayIso() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function daysBetween(fromIso, toIso) {
        return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
    }

    /* "12 giorni", "circa 5 mesi", "circa 10 anni" */
    function humanSpan(days) {
        if (days < 60) return days + ' giorni';
        if (days < 730) return 'circa ' + Math.round(days / 30.44) + ' mesi';
        return 'circa ' + Math.round(days / 365.25) + ' anni';
    }

    /* "Scade tra 12 giorni", "Scaduta da circa 3 mesi", ... */
    function dueStatus(p) {
        if (!p.dueDate) return null;
        var days = daysBetween(todayIso(), p.dueDate);
        if (days === 0) return { text: 'Scade oggi', expired: false };
        if (days === 1) return { text: 'Scade domani', expired: false };
        if (days > 1) return { text: 'Scade tra ' + humanSpan(days), expired: false };
        if (days === -1) return { text: 'Scaduta ieri', expired: true };
        return { text: 'Scaduta da ' + humanSpan(-days), expired: true };
    }

    function statusBadge(p) {
        var status = dueStatus(p);
        if (!status) return null;
        return el('p', { className: 'due-status' + (status.expired ? ' expired' : '') }, [
            icon(status.expired ? 'fas fa-hourglass-end' : 'fas fa-hourglass-half'), ' ' + status.text
        ]);
    }

    /* Left panel: expired, most recent first. Right panel: not yet expired
     * (due today or later), soonest first. The buttons move further away in
     * time (older / later) or back. */
    var featured = {
        expired: { index: 0, title: 'Appena scaduta', empty: 'Nessuna previsione scaduta.',
                   further: 'Scaduta prima', closer: 'Più recente' },
        upcoming: { index: 0, title: 'In scadenza', empty: 'Nessuna previsione in scadenza.',
                    further: 'Scade dopo', closer: 'Scade prima' }
    };

    function featuredList(kind) {
        var today = todayIso();
        var dated = all().filter(function (p) { return p.dueDate; });
        if (kind === 'expired') {
            return dated.filter(function (p) { return p.dueDate < today; })
                .sort(function (a, b) { return b.dueDate.localeCompare(a.dueDate) || b.createdAt.localeCompare(a.createdAt); });
        }
        return dated.filter(function (p) { return p.dueDate >= today; })
            .sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate) || b.createdAt.localeCompare(a.createdAt); });
    }

    function renderFeaturedPanel(kind) {
        var conf = featured[kind];
        var list = featuredList(kind);
        var box = $('featured-' + kind);
        box.replaceChildren();
        box.appendChild(el('p', { className: 'featured-kicker' }, [
            icon(kind === 'expired' ? 'fas fa-history' : 'fas fa-hourglass-half'), ' ' + conf.title
        ]));
        if (!list.length) {
            box.appendChild(el('p', { className: 'featured-empty', text: conf.empty }));
            return;
        }
        conf.index = Math.max(0, Math.min(conf.index, list.length - 1));
        var p = list[conf.index];
        [
            statusBadge(p),
            el('h3', null, el('a', { href: predictionUrl(p.id), className: 'prediction-link', 'data-id': p.id, text: p.title })),
            p.author ? el('p', { className: 'author' }, [icon('fas fa-user'), ' ' + p.author]) : null,
            el('p', { className: 'source' }, ['Fonte: ', sourceNode(p)]),
            metaTags(p),
            p.description ? el('p', { className: 'featured-description', text: p.description }) : null,
            el('div', { className: 'featured-nav' }, [
                el('button', { type: 'button', className: 'secondary-btn', 'data-kind': kind, 'data-step': '-1' },
                    [icon('fas fa-chevron-left'), ' ' + conf.closer]),
                el('span', { className: 'featured-position', text: (conf.index + 1) + ' di ' + list.length }),
                el('button', { type: 'button', className: 'secondary-btn', 'data-kind': kind, 'data-step': '1' },
                    [conf.further + ' ', icon('fas fa-chevron-right')])
            ])
        ].forEach(function (node) { if (node) box.appendChild(node); });
        var buttons = box.querySelectorAll('.featured-nav button');
        buttons[0].disabled = conf.index === 0;
        buttons[1].disabled = conf.index >= list.length - 1;
    }

    function renderFeatured() {
        renderFeaturedPanel('expired');
        renderFeaturedPanel('upcoming');
    }

    function onFeaturedNav(event) {
        var btn = event.target.closest('.featured-nav button');
        if (!btn || btn.disabled) return;
        var kind = btn.getAttribute('data-kind');
        featured[kind].index += Number(btn.getAttribute('data-step'));
        renderFeaturedPanel(kind);
    }

    /* ---------- List and filters ---------- */

    function readFilters() {
        return {
            text: $('filter-text').value.trim().toLowerCase(),
            tag: $('filter-tag').value,
            from: $('filter-from').value,
            to: $('filter-to').value,
            sort: $('filter-sort').value
        };
    }

    function applyFilters(list, f) {
        var result = list.filter(function (p) {
            if (f.tag && !(p.tags || []).some(function (t) { return t.id === f.tag; })) return false;
            if (f.from && (!p.dueDate || p.dueDate < f.from)) return false;
            if (f.to && (!p.dueDate || p.dueDate > f.to)) return false;
            if (f.text) {
                var haystack = [p.title, p.author, p.source, p.description]
                    .concat((p.tags || []).map(function (t) { return t.label; })).join(' ').toLowerCase();
                if (haystack.indexOf(f.text) === -1) return false;
            }
            return true;
        });

        // Same insertion time (e.g. examples added together): keep a stable order.
        var byCreated = function (a, b) { return a.createdAt.localeCompare(b.createdAt) || String(a.id).localeCompare(String(b.id)); };
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
                el('h3', null, el('a', { href: predictionUrl(p.id), className: 'prediction-link', 'data-id': p.id, text: p.title })),
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
        ['contributor', 'title', 'author', 'source', 'url', 'madeOn', 'dueDate', 'description']
            .forEach(function (name) { input[name] = form.elements[name].value; });
        input.tags = selectedTags();

        var submit = form.querySelector('.submit-btn');
        submit.disabled = true;
        showMessage('Salvataggio…');
        var result;
        try {
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
        try { TAGS = await store.tags(); } catch (e) { /* keep the current list */ }
        renderTagOptions([]);
        fillTagFilter();
        saveName(input.contributor.trim());
        form.reset();
        $('contributor').value = input.contributor.trim();
        showMessage(result.saved
            ? 'Previsione aggiunta.'
            : 'Previsione aggiunta, ma non è stato possibile salvarla in questo browser: andrà persa ricaricando la pagina.',
            result.saved ? 'success' : 'error');
        renderList();
        renderFeatured();
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
        renderFeatured();
        if (currentDetailId() === id) goHome();
    }

    /* ---------- Setup ---------- */

    /* ---------- Tags ---------- */

    /* Tag checkboxes in the form; `checked` is a list of labels to keep ticked. */
    function renderTagOptions(checked) {
        var box = $('tag-options');
        var keep = (checked || []).map(function (l) { return l.toLowerCase(); });
        var labels = Object.keys(TAGS).map(function (id) { return TAGS[id].label; });
        // Tags typed in the form but not saved yet stay in the list.
        (checked || []).forEach(function (l) {
            if (!labels.some(function (x) { return x.toLowerCase() === l.toLowerCase(); })) labels.push(l);
        });
        labels.sort(function (a, b) { return a.localeCompare(b, 'it'); });
        box.replaceChildren();
        labels.forEach(function (label, i) {
            var id = 'tag-opt-' + i;
            var input = el('input', { type: 'checkbox', id: id, value: label });
            input.checked = keep.indexOf(label.toLowerCase()) !== -1;
            box.appendChild(el('label', { className: 'tag-option', for: id }, [input, ' ' + label]));
        });
    }

    function selectedTags() {
        return Array.prototype.map.call(
            document.querySelectorAll('#tag-options input:checked'),
            function (input) { return input.value; });
    }

    function addTypedTag() {
        var input = $('newTag');
        var label = input.value.trim().replace(/\s+/g, ' ');
        if (!label) return;
        var error = window.WikiPrevModel.tagLabelError(label);
        if (error) {
            showMessage(error, 'error');
            return;
        }
        renderTagOptions(selectedTags().concat([label]));
        input.value = '';
        showMessage('');
    }

    function fillTagFilter() {
        var select = $('filter-tag');
        var current = select.value;
        while (select.options.length > 1) select.remove(1);
        Object.keys(TAGS).sort(function (a, b) { return TAGS[a].label.localeCompare(TAGS[b].label, 'it'); })
            .forEach(function (id) { select.appendChild(el('option', { value: id, text: TAGS[id].label })); });
        select.value = current;
        if (select.value !== current) select.value = '';
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
        $('add-tag-btn').addEventListener('click', addTypedTag);
        $('newTag').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); addTypedTag(); }
        });
        $('predictions-grid').addEventListener('click', onDelete);
        $('detail-card').addEventListener('click', onDelete);
        $('featured-expired').addEventListener('click', onFeaturedNav);
        $('featured-upcoming').addEventListener('click', onFeaturedNav);
        // Prediction titles open their page without reloading the site.
        document.addEventListener('click', function (e) {
            var link = e.target.closest('a.prediction-link');
            if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            openPrediction(link.getAttribute('data-id'));
        });
        $('back-link').addEventListener('click', function (e) {
            e.preventDefault();
            goHome();
        });
        window.addEventListener('popstate', route);
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
        if (started) {
            renderList();
            route();
        }
    }

    function renderAdminPanel() {
        $('admin-login').hidden = isAdmin;
        $('admin-active').hidden = !isAdmin;
        renderVisitStats();
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
        $('visit-stats-refresh').addEventListener('click', renderVisitStats);
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

    /* ---------- Visits ---------- */

    /* Random id kept only while this tab is open (sessionStorage): it counts
     * visits without following anyone over time. */
    function sessionId() {
        var key = 'wikiprev_session';
        try {
            var id = window.sessionStorage.getItem(key);
            if (id) return id;
        } catch (e) { /* fall through */ }
        var id2 = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
            : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); });
        try { window.sessionStorage.setItem(key, id2); } catch (e) { /* not essential */ }
        return id2;
    }

    function referrerHost() {
        try {
            if (!document.referrer) return '';
            var host = new URL(document.referrer).hostname;
            return host === window.location.hostname ? '' : host;
        } catch (e) { return ''; }
    }

    function deviceType() {
        var w = window.innerWidth || 0;
        var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (w < 600) return 'mobile';
        if (coarse && w < 1100) return 'tablet';
        return 'desktop';
    }

    function logVisit() {
        store.logVisit(sessionId(), referrerHost(), deviceType());
    }

    var DEVICE_LABELS = { mobile: 'Telefono', tablet: 'Tablet', desktop: 'Computer', other: 'Altro' };

    async function renderVisitStats() {
        var box = $('visit-stats');
        if (store.mode !== 'supabase' || !isAdmin) { box.hidden = true; return; }
        box.hidden = false;
        var body = $('visit-stats-body');
        body.replaceChildren(el('p', { text: 'Caricamento…' }));
        var stats;
        try {
            stats = await store.visitStats(adminCode(), 30);
        } catch (e) {
            body.replaceChildren(el('p', { className: 'form-message error', text: e.message }));
            return;
        }
        var devices = Object.keys(stats.devices || {}).map(function (k) {
            return (DEVICE_LABELS[k] || k) + ' ' + stats.devices[k];
        }).join(' · ') || '—';
        var rows = (stats.days || []).slice(0, 14).map(function (d) {
            return el('tr', null, [
                el('td', { text: formatDate(d.day) }),
                el('td', { className: 'num', text: String(d.visits) }),
                el('td', { className: 'num', text: String(d.page_views) })
            ]);
        });
        body.replaceChildren(
            el('div', { className: 'visit-totals' }, [
                el('div', null, [el('strong', { text: String(stats.visits) }), el('span', { text: 'visite' })]),
                el('div', null, [el('strong', { text: String(stats.page_views) }), el('span', { text: 'pagine viste' })])
            ]),
            el('p', { className: 'field-hint', text: 'Dal ' + formatDate(stats.from) + ' a oggi. Una visita è una scheda del browser aperta sul sito.' }),
            el('p', null, [el('strong', { text: 'Provenienza: ' }),
                (stats.sources || []).map(function (s) { return s.source + ' ' + s.visits; }).join(' · ') || '—']),
            el('p', null, [el('strong', { text: 'Dispositivi: ' }), devices]),
            rows.length ? el('table', { className: 'visit-table' }, [
                el('thead', null, el('tr', null, [el('th', { text: 'Giorno' }), el('th', { className: 'num', text: 'Visite' }), el('th', { className: 'num', text: 'Pagine' })])),
                el('tbody', null, rows)
            ]) : el('p', { text: 'Nessuna visita registrata finora.' })
        );
    }

    /* ---------- Single prediction page ---------- */

    var BASE_TITLE = document.title;

    function currentDetailId() {
        return new URLSearchParams(window.location.search).get('p');
    }

    function openPrediction(id) {
        history.pushState({ wikiprev: true }, '', predictionUrl(id));
        route();
        window.scrollTo(0, 0);
    }

    function goHome() {
        if (history.state && history.state.wikiprev) {
            history.back();   // back to where the visitor came from in the archive
        } else {
            history.pushState({}, '', window.location.pathname);
            route();
        }
    }

    function detailRow(label, value) {
        if (!value) return null;
        return el('div', { className: 'detail-row' }, [el('dt', { text: label }), el('dd', null, value)]);
    }

    async function copyText(text, button) {
        var done = function (ok) {
            var original = button.getAttribute('data-label');
            button.replaceChildren(icon(ok ? 'fas fa-check' : 'fas fa-exclamation-triangle'),
                ok ? ' Link copiato' : ' Copia non riuscita: seleziona il link a mano');
            setTimeout(function () { button.replaceChildren(icon('fas fa-link'), ' ' + original); }, 2500);
        };
        try {
            await navigator.clipboard.writeText(text);
            done(true);
        } catch (e) {
            var input = $('share-url');
            input.focus();
            input.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
            done(ok);
        }
    }

    function renderDetail(p) {
        var card = $('detail-card');
        card.replaceChildren();
        if (!p) {
            document.title = 'Previsione non trovata - ' + BASE_TITLE;
            card.append(el('h2', { text: 'Previsione non trovata' }),
                el('p', { text: 'Il link potrebbe essere sbagliato, oppure la previsione è stata eliminata.' }));
            return;
        }
        document.title = p.title + ' - Wikiprev';
        var link = predictionAbsoluteUrl(p.id);
        var sourceValue = [sourceNode(p)];
        if (p.url) {
            sourceValue.push(el('div', { className: 'source-preview' }, [
                el('span', { className: 'source-host' }, [icon('fas fa-globe'), ' ' + new URL(p.url).hostname.replace(/^www\./, '')]),
                el('a', { href: 'https://web.archive.org/web/*/' + p.url, target: '_blank', rel: 'noopener noreferrer' },
                    [icon('fas fa-archive'), ' Copie archiviate (archive.org)'])
            ]));
        }
        var shareButtons = [
            el('button', { type: 'button', className: 'secondary-btn', id: 'copy-link', 'data-label': 'Copia link' }, [icon('fas fa-link'), ' Copia link'])
        ];
        if (navigator.share) {
            shareButtons.push(el('button', { type: 'button', className: 'secondary-btn', id: 'native-share' }, [icon('fas fa-share-alt'), ' Condividi']));
        }
        [
            statusBadge(p),
            el('h2', { className: 'detail-title', text: p.title }),
            el('div', { className: 'prediction-meta' }, tagChips(p)),
            p.description ? el('p', { className: 'detail-description', text: p.description }) : null,
            el('dl', { className: 'detail-list' }, [
                detailRow("Chi l'ha fatta", p.author),
                detailRow('Fonte', sourceValue),
                detailRow('Data della previsione', p.madeOn ? formatDate(p.madeOn) : ''),
                detailRow('Da verificare entro il', formatDate(p.dueDate)),
                detailRow('Inserita', formatInserted(p.createdAt) + (p.createdByName ? ' da ' + p.createdByName : ''))
            ].filter(Boolean)),
            el('div', { className: 'share-box' }, [
                el('label', { for: 'share-url', text: 'Link a questa previsione' }),
                el('div', { className: 'share-row' }, [
                    el('input', { type: 'text', id: 'share-url', readonly: 'readonly', value: link })
                ].concat(shareButtons))
            ]),
            canDelete() ? el('div', { className: 'card-actions' }, [el('span'), el('button', {
                type: 'button', className: 'delete-btn', 'data-id': p.id, 'aria-label': 'Elimina la previsione', title: 'Elimina'
            }, [icon('fas fa-trash-alt'), ' Elimina'])]) : null
        ].forEach(function (node) { if (node) card.appendChild(node); });
        $('share-url').addEventListener('focus', function (e) { e.target.select(); });
        $('copy-link').addEventListener('click', function (e) { copyText(link, e.currentTarget); });
        if (navigator.share) {
            $('native-share').addEventListener('click', function () {
                navigator.share({ title: p.title, text: p.title, url: link }).catch(function () { /* cancelled */ });
            });
        }
    }

    /* Show the archive or a single prediction, depending on the address. */
    function route() {
        var id = currentDetailId();
        $('home-view').hidden = Boolean(id);
        $('detail-view').hidden = !id;
        if (!id) {
            document.title = BASE_TITLE;
            return;
        }
        renderDetail(items.find(function (p) { return String(p.id) === id; }) || null);
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
            TAGS = await store.tags();
            items = await store.list();
        } catch (e) {
            showStatus(e.message, true);
            return;
        }
        await restoreAdmin();
        renderTagOptions([]);
        fillTagFilter();
        fillSuggestions();
        setupMainView();
        renderFeatured();
        renderList();
        showView('main');
        route();
    }

    document.addEventListener('DOMContentLoaded', function () {
        // A page cached by the browser from an older version may not have the
        // elements this code expects: ask for a reload instead of hanging.
        var required = ['featured-expired', 'featured-upcoming', 'home-view', 'detail-view', 'tag-options', 'filter-tag'];
        if (required.some(function (id) { return !$(id); })) {
            var text = document.getElementById('status-text');
            var panel = document.getElementById('status-panel');
            if (text && panel) {
                text.textContent = 'È disponibile una nuova versione di Wikiprev: ricarica la pagina (Ctrl+Maiusc+R, oppure chiudi e riapri la scheda).';
                panel.hidden = false;
            }
            return;
        }
        setupMobileMenu();
        $('local-mode-banner').hidden = store.mode !== 'local';
        $('contributor').value = savedName();
        setupAdmin();
        showMain();
        logVisit();
    });
})();
