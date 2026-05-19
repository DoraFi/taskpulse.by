(function (global) {
    const PANEL_CLASS = 'tp-dropdown-panel';
    const PANEL_FLOAT_CLASS = 'tp-dropdown-panel--floating';
    const OPTION_CLASS = 'tp-dropdown-option';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeQuery(value) {
        return String(value ?? '').trim();
    }

    function getSelectedLabel(select) {
        const opt = select.options[select.selectedIndex];
        return opt ? opt.textContent.trim() : '';
    }

    function positionPanel(panel, anchor) {
        const rect = anchor.getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.left = `${Math.round(rect.left)}px`;
        panel.style.top = `${Math.round(rect.bottom + 4)}px`;
        panel.style.width = `${Math.round(rect.width)}px`;
        panel.style.right = 'auto';
        panel.style.zIndex = '2100';
        panel.classList.add(PANEL_FLOAT_CLASS);
    }

    function resetPanelPosition(panel) {
        panel.style.position = '';
        panel.style.left = '';
        panel.style.top = '';
        panel.style.width = '';
        panel.style.right = '';
        panel.style.zIndex = '';
        panel.classList.remove(PANEL_FLOAT_CLASS);
    }

    function isSearchableEnabled(select, opts) {
        if (opts && opts.searchable) return true;
        return select?.dataset?.tpSelectSearch === '1';
    }

    function initTpSelect(select, opts) {
        if (!select || select.multiple || select.dataset.tpSelect === '1') {
            return select?._tpSelectApi || null;
        }
        if (select.closest('.tp-combobox')) return null;

        const searchable = isSearchableEnabled(select, opts);
        select.dataset.tpSelect = '1';
        if (searchable) select.dataset.tpSelectSearch = '1';

        const wrap = document.createElement('div');
        wrap.className = searchable ? 'tp-select tp-select--searchable' : 'tp-select';
        select.parentNode.insertBefore(wrap, select);

        const triggerClasses = [...select.classList].filter((c) => c !== 'tp-select__native');
        let trigger;
        if (searchable) {
            trigger = document.createElement('input');
            trigger.type = 'text';
            trigger.autocomplete = 'off';
            trigger.spellcheck = false;
            trigger.setAttribute('role', 'combobox');
            trigger.setAttribute('aria-autocomplete', 'list');
        } else {
            trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.setAttribute('aria-haspopup', 'listbox');
        }
        trigger.className = `${triggerClasses.join(' ')} tp-select__trigger`.trim();
        trigger.setAttribute('aria-expanded', 'false');

        select.className = 'tp-select__native';
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');

        const list = document.createElement('ul');
        list.className = PANEL_CLASS;
        list.setAttribute('role', 'listbox');
        list.hidden = true;

        wrap.appendChild(trigger);
        wrap.appendChild(select);
        wrap.appendChild(list);

        let activeIndex = -1;

        function getFilterQuery() {
            return searchable ? normalizeQuery(trigger.value).toLowerCase() : '';
        }

        function findBestMatchIndex(query) {
            const q = normalizeQuery(query).toLowerCase();
            if (!q) return select.selectedIndex >= 0 ? select.selectedIndex : -1;

            const tryMatch = (predicate) => {
                for (let i = 0; i < select.options.length; i++) {
                    const opt = select.options[i];
                    if (opt.disabled) continue;
                    const label = opt.textContent.trim().toLowerCase();
                    const value = String(opt.value).toLowerCase();
                    if (predicate(label, value)) return i;
                }
                return -1;
            };

            let idx = tryMatch((label, value) => label.startsWith(q) || value.startsWith(q));
            if (idx >= 0) return idx;
            idx = tryMatch((label, value) => label.includes(q) || value.includes(q));
            return idx;
        }

        function findExactOptionIndex(query) {
            const q = normalizeQuery(query).toLowerCase();
            if (!q) return -1;
            for (let i = 0; i < select.options.length; i++) {
                const opt = select.options[i];
                if (opt.disabled) continue;
                const label = opt.textContent.trim().toLowerCase();
                const value = String(opt.value).toLowerCase();
                if (label === q || value === q) return i;
            }
            return -1;
        }

        function getVisibleOptionElements() {
            return [...list.querySelectorAll(`.${OPTION_CLASS}:not(.tp-dropdown-option--disabled)`)];
        }

        function syncTrigger() {
            const label = getSelectedLabel(select) || trigger.getAttribute('data-placeholder') || '';
            if (searchable) {
                trigger.value = label;
            } else {
                trigger.textContent = label;
            }
            trigger.disabled = select.disabled;
            if (select.disabled) {
                trigger.setAttribute('aria-disabled', 'true');
            } else {
                trigger.removeAttribute('aria-disabled');
            }
        }

        function buildListHtml() {
            const query = searchable ? getFilterQuery() : '';
            const matchIdx = searchable && query ? findBestMatchIndex(query) : -1;

            const items = [...select.options].map((opt, idx) => {
                const disabled = opt.disabled;
                let cls = OPTION_CLASS;
                if (disabled) cls += ' tp-dropdown-option--disabled';
                if (searchable) {
                    if (idx === matchIdx) cls += ' is-match';
                } else if (opt.selected) {
                    cls += ' is-active';
                }
                return `<li class="${cls}" role="option" data-index="${idx}" data-value="${escapeHtml(opt.value)}">${escapeHtml(opt.textContent.trim())}</li>`;
            });

            if (!items.length) {
                return '<li class="tp-dropdown-empty text-signature">Нет вариантов</li>';
            }
            return items.join('');
        }

        function scrollToMatchInList(matchIdx) {
            if (matchIdx < 0) return;
            const el = list.querySelector(`.${OPTION_CLASS}[data-index="${matchIdx}"]`);
            el?.scrollIntoView({ block: 'nearest' });
        }

        function applySearchHighlight() {
            const query = getFilterQuery();
            const matchIdx = query ? findBestMatchIndex(query) : (select.selectedIndex >= 0 ? select.selectedIndex : -1);
            const items = getVisibleOptionElements();

            items.forEach((el) => {
                const idx = Number(el.dataset.index);
                const isMatch = idx === matchIdx && query;
                const isKeyboard = items.indexOf(el) === activeIndex && activeIndex >= 0;
                el.classList.toggle('is-match', Boolean(isMatch));
                el.classList.toggle('is-active', isKeyboard);
            });

            if (matchIdx >= 0) {
                scrollToMatchInList(matchIdx);
                if (query && activeIndex < 0) {
                    activeIndex = items.findIndex((el) => Number(el.dataset.index) === matchIdx);
                }
            }
        }

        function restorePanel() {
            if (list.parentElement !== wrap) {
                wrap.appendChild(list);
            }
            resetPanelPosition(list);
        }

        function closeList() {
            list.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
            wrap.classList.remove('is-open');
            activeIndex = -1;
            restorePanel();
            window.removeEventListener('resize', repositionIfOpen);
            window.removeEventListener('scroll', repositionIfOpen, true);
        }

        function repositionIfOpen() {
            if (!list.hidden) positionPanel(list, trigger);
        }

        function openList() {
            list.innerHTML = buildListHtml();
            if (list.parentElement !== document.body) {
                document.body.appendChild(list);
            }
            positionPanel(list, trigger);
            list.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
            wrap.classList.add('is-open');
            window.addEventListener('resize', repositionIfOpen);
            window.addEventListener('scroll', repositionIfOpen, true);
            if (searchable) applySearchHighlight();
        }

        function pickIndex(index) {
            const opt = select.options[index];
            if (!opt || opt.disabled) return;
            select.selectedIndex = index;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            syncTrigger();
            closeList();
        }

        function commitSearchableInput() {
            const query = normalizeQuery(trigger.value);
            if (!query) {
                syncTrigger();
                closeList();
                return;
            }
            const exactIdx = findExactOptionIndex(query);
            if (exactIdx >= 0) {
                pickIndex(exactIdx);
                return;
            }
            syncTrigger();
            closeList();
        }

        function refresh() {
            syncTrigger();
            if (!list.hidden) {
                list.innerHTML = buildListHtml();
                positionPanel(list, trigger);
                if (searchable) applySearchHighlight();
            }
        }

        function highlightActiveItem() {
            const items = getVisibleOptionElements();
            const query = searchable ? getFilterQuery() : '';
            const matchIdx = searchable && query ? findBestMatchIndex(query) : -1;

            items.forEach((el, i) => {
                const idx = Number(el.dataset.index);
                el.classList.toggle('is-active', i === activeIndex);
                el.classList.toggle('is-match', searchable && query && idx === matchIdx);
            });
            items[activeIndex]?.scrollIntoView({ block: 'nearest' });
        }

        list.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const item = e.target.closest(`.${OPTION_CLASS}`);
            if (!item || item.classList.contains('tp-dropdown-option--disabled')) return;
            const idx = Number(item.dataset.index);
            if (!Number.isNaN(idx)) pickIndex(idx);
        });

        if (searchable) {
            trigger.addEventListener('focus', () => {
                if (select.disabled) return;
                openList();
            });
            trigger.addEventListener('input', () => {
                if (select.disabled) return;
                activeIndex = -1;
                if (list.hidden) {
                    openList();
                } else {
                    list.innerHTML = buildListHtml();
                    applySearchHighlight();
                }
            });
            trigger.addEventListener('blur', () => {
                setTimeout(() => {
                    if (list.contains(document.activeElement)) return;
                    commitSearchableInput();
                }, 120);
            });
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (select.disabled) return;
                if (list.hidden) openList();
            });
            trigger.addEventListener('keydown', (e) => {
                if (select.disabled) return;
                const items = getVisibleOptionElements();
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (list.hidden) openList();
                    activeIndex = Math.min(activeIndex + 1, items.length - 1);
                    highlightActiveItem();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (list.hidden) openList();
                    activeIndex = Math.max(activeIndex - 1, 0);
                    highlightActiveItem();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (activeIndex >= 0 && items[activeIndex]) {
                        pickIndex(Number(items[activeIndex].dataset.index));
                        return;
                    }
                    commitSearchableInput();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    syncTrigger();
                    closeList();
                }
            });
        } else {
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                if (select.disabled) return;
                if (list.hidden) openList();
                else closeList();
            });

            trigger.addEventListener('keydown', (e) => {
                if (select.disabled) return;
                if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (list.hidden) openList();
                } else if (e.key === 'Escape') {
                    closeList();
                }
            });

            list.addEventListener('keydown', (e) => {
                const items = getVisibleOptionElements();
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    activeIndex = Math.min(activeIndex + 1, items.length - 1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    activeIndex = Math.max(activeIndex - 1, 0);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (activeIndex >= 0 && items[activeIndex]) {
                        pickIndex(Number(items[activeIndex].dataset.index));
                    }
                    return;
                } else if (e.key === 'Escape') {
                    closeList();
                    trigger.focus();
                    return;
                } else {
                    return;
                }
                highlightActiveItem();
            });
        }

        select.addEventListener('change', syncTrigger);

        document.addEventListener('click', (e) => {
            if (wrap.contains(e.target) || list.contains(e.target)) return;
            if (searchable && !list.hidden) {
                commitSearchableInput();
                return;
            }
            closeList();
        });

        syncTrigger();

        const api = { refresh, close: closeList, getSelect: () => select };
        select._tpSelectApi = api;
        return api;
    }

    function initAllTpSelects(root) {
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll('select.create-task-select').forEach((select) => {
            if (select.closest('.tp-select, .tp-combobox, .tp-date-picker')) return;
            if (select.classList.contains('tp-select__native')) return;
            initTpSelect(select);
        });
    }

    global.initTpSelect = initTpSelect;
    global.initAllTpSelects = initAllTpSelects;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initAllTpSelects());
    } else {
        initAllTpSelects();
    }
})(window);
