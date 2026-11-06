/*
 * WikiPrev UI: renders predictions, handles filters and the "add" form.
 * All data access goes through window.WikiPrevStore (js/store.js).
 *
 * User-provided text is always inserted with textContent, never innerHTML.
 */
(function () {
    'use strict';

    var store = window.WikiPrevStore;
    var CATEGORIES = store.CATEGORIES;
    var featuredId = null;

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
        return featuredOrder(store.all())[0] || null;
    }

    function nextFeatured() {
        var order = featuredOrder(store.all());
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
        var total = store.all().length;
        [
            status ? el('p', { className: 'due-status' + (status.expired ? ' expired' : '') }, [
                icon(status.expired ? 'fas fa-hourglass-end' : 'fas fa-hourglass-half'), ' ' + status.text
            ]) : null,
            el('h3', { text: p.title }),
            p.author ? el('p', { className: 'author' }, [icon('fas fa-user'), ' ' + p.author]) : null,
            el('p', { className: 'source' }, ['Fonte: ', sourceNode(p)]),
            metaTags(p),
            p.description ? el('p', { text: p.description }) : null,
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
                    el('span'),
                    el('button', {
                        type: 'button',
                        className: 'delete-btn',
                        'data-id': p.id,
                        'aria-label': 'Elimina la previsione',
                        title: 'Elimina'
                    }, [icon('fas fa-trash-alt'), ' Elimina'])
                ])
            ])
        ]);
    }

    function renderList() {
        var all = store.all();
        var list = applyFilters(all, readFilters());
        var grid = $('predictions-grid');
        grid.replaceChildren();

        if (!list.length) {
            grid.appendChild(el('p', {
                className: 'empty-state',
                text: all.length ? 'Nessuna previsione corrisponde ai filtri.' : 'Ancora nessuna previsione.'
            }));
        } else {
            list.forEach(function (p) { grid.appendChild(card(p)); });
        }

        $('results-count').textContent = list.length === all.length
            ? all.length + (all.length === 1 ? ' previsione' : ' previsioni')
            : list.length + ' di ' + all.length + ' previsioni';
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

    function onSubmit(event) {
        event.preventDefault();
        var form = event.target;
        var input = {};
        ['title', 'author', 'source', 'url', 'category', 'madeOn', 'dueDate', 'description']
            .forEach(function (name) { input[name] = form.elements[name].value; });

        var result = store.add(input);
        if (!result.ok) {
            showMessage(result.errors, 'error');
            return;
        }

        form.reset();
        showMessage(result.saved
            ? 'Previsione aggiunta.'
            : 'Previsione aggiunta, ma non è stato possibile salvarla in questo browser: andrà persa ricaricando la pagina.',
            result.saved ? 'success' : 'error');
        renderList();
        renderFeatured(firstFeatured());
    }

    function onDelete(event) {
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
        store.remove(id);
        renderList();
        renderFeatured(id === featuredId ? firstFeatured() : store.all().find(function (p) { return p.id === featuredId; }));
    }

    /* ---------- Setup ---------- */

    function fillCategorySelects() {
        ['filter-category', 'category'].forEach(function (selectId) {
            var select = $(selectId);
            Object.keys(CATEGORIES).forEach(function (key) {
                select.appendChild(el('option', { value: key, text: CATEGORIES[key].label }));
            });
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

    document.addEventListener('DOMContentLoaded', function () {
        fillCategorySelects();
        setupMobileMenu();

        var filterForm = $('filter-form');
        filterForm.addEventListener('input', renderList);
        filterForm.addEventListener('change', renderList);
        filterForm.addEventListener('submit', function (e) { e.preventDefault(); });
        // "reset" fires before the fields are cleared, so re-render afterwards.
        filterForm.addEventListener('reset', function () { setTimeout(renderList, 0); });

        $('prediction-form').addEventListener('submit', onSubmit);
        $('predictions-grid').addEventListener('click', onDelete);

        renderFeatured(firstFeatured());
        renderList();
    });
})();
