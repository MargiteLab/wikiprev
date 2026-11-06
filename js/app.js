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
            el('span', { className: 'tag', title: 'Due date for verification' }, [
                icon('far fa-calendar'), ' Due: ' + formatDate(p.dueDate)
            ]),
            p.madeOn ? el('span', { className: 'tag', title: 'Date the prediction was made' }, [
                icon('far fa-clock'), ' Made: ' + formatDate(p.madeOn)
            ]) : null,
            el('span', { className: 'tag ' + p.category }, [
                icon('fas ' + cat.icon), ' ' + cat.label
            ])
        ]);
    }

    /* ---------- Featured prediction ---------- */

    function pickFeatured(list) {
        if (!list.length) return null;
        if (list.length > 1) {
            list = list.filter(function (p) { return p.id !== featuredId; });
        }
        return list[Math.floor(Math.random() * list.length)];
    }

    function renderFeatured(p) {
        var box = $('featured-prediction');
        box.replaceChildren();
        if (!p) {
            featuredId = null;
            box.appendChild(el('p', { text: 'No predictions yet. Add the first one below!' }));
            return;
        }
        featuredId = p.id;
        [
            el('h3', { text: p.title }),
            p.author ? el('p', { className: 'author' }, [icon('fas fa-user'), ' ' + p.author]) : null,
            el('p', { className: 'source' }, ['Source: ', sourceNode(p)]),
            metaTags(p),
            p.description ? el('p', { text: p.description }) : null,
            el('button', { type: 'button', className: 'view-all', id: 'shuffle-featured' }, [
                icon('fas fa-random'), ' Show another'
            ])
        ].forEach(function (node) { if (node) box.appendChild(node); });
        $('shuffle-featured').addEventListener('click', function () {
            renderFeatured(pickFeatured(store.all()));
        });
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
                el('p', { className: 'source' }, ['Source: ', sourceNode(p)]),
                metaTags(p),
                el('p', { text: p.description || '' }),
                el('div', { className: 'card-actions' }, [
                    el('span'),
                    el('button', {
                        type: 'button',
                        className: 'delete-btn',
                        'data-id': p.id,
                        'aria-label': 'Delete prediction',
                        title: 'Delete'
                    }, [icon('fas fa-trash-alt'), ' Delete'])
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
                text: all.length ? 'No predictions match these filters.' : 'No predictions yet.'
            }));
        } else {
            list.forEach(function (p) { grid.appendChild(card(p)); });
        }

        $('results-count').textContent = list.length === all.length
            ? all.length + (all.length === 1 ? ' prediction' : ' predictions')
            : 'Showing ' + list.length + ' of ' + all.length + ' predictions';
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
            ? 'Prediction added.'
            : 'Prediction added, but it could not be saved in this browser and will be lost on reload.',
            result.saved ? 'success' : 'error');
        renderList();
        if (!featuredId) renderFeatured(result.prediction);
    }

    function onDelete(event) {
        var btn = event.target.closest('.delete-btn');
        if (!btn) return;
        // Two-step delete: the first click asks for confirmation on the button itself.
        if (!btn.classList.contains('confirming')) {
            btn.classList.add('confirming');
            btn.replaceChildren(icon('fas fa-trash-alt'), ' Click again to delete');
            setTimeout(function () {
                if (!btn.isConnected) return;
                btn.classList.remove('confirming');
                btn.replaceChildren(icon('fas fa-trash-alt'), ' Delete');
            }, 4000);
            return;
        }
        var id = btn.getAttribute('data-id');
        store.remove(id);
        renderList();
        if (id === featuredId) renderFeatured(pickFeatured(store.all()));
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

        renderFeatured(pickFeatured(store.all()));
        renderList();
    });
})();
