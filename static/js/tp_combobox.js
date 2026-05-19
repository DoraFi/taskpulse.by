(function (global) {
    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeValue(value) {
        return String(value || '').trim();
    }

    /**
     * @param {HTMLInputElement} input
     * @param {object} opts
     * @param {string[]} [opts.options]
     * @param {string} [opts.createLabel] template with {value}
     * @param {(value: string) => void} [opts.onAddOption]
     */
    function initTpCombobox(input, opts) {
        if (!input || input.dataset.tpCombobox === '1') {
            return {
                getValue: () => normalizeValue(input?.value),
                setValue: (v) => { if (input) input.value = v || ''; },
                setOptions: () => {},
            };
        }
        input.dataset.tpCombobox = '1';

        const config = opts || {};
        let options = Array.isArray(config.options) ? [...config.options] : [];
        const createLabel = config.createLabel || 'Добавить «{value}»';
        const onAddOption = typeof config.onAddOption === 'function' ? config.onAddOption : null;

        const wrap = document.createElement('div');
        wrap.className = 'tp-combobox';
        input.parentNode.insertBefore(wrap, input);

        const control = document.createElement('div');
        control.className = 'tp-combobox__control br-5';
        wrap.appendChild(control);
        control.appendChild(input);

        const list = document.createElement('ul');
        list.className = 'tp-dropdown-panel tp-combobox__list';
        list.setAttribute('role', 'listbox');
        wrap.appendChild(list);

        input.classList.add('tp-combobox__input');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-autocomplete', 'list');

        let activeIndex = -1;

        function setOptions(next) {
            options = Array.isArray(next) ? [...next] : [];
        }

        function filteredOptions(query) {
            const q = normalizeValue(query).toLowerCase();
            if (!q) return options.slice();
            return options.filter((item) => item.toLowerCase().includes(q));
        }

        function positionFloatingList() {
            const rect = control.getBoundingClientRect();
            list.style.position = 'fixed';
            list.style.left = `${Math.round(rect.left)}px`;
            list.style.top = `${Math.round(rect.bottom + 4)}px`;
            list.style.width = `${Math.round(rect.width)}px`;
            list.style.right = 'auto';
            list.style.zIndex = '2100';
            list.classList.add('tp-dropdown-panel--floating');
        }

        function attachListToBody() {
            if (list.parentElement !== document.body) {
                document.body.appendChild(list);
            }
        }

        function restoreListToWrap() {
            if (list.parentElement !== wrap) {
                wrap.appendChild(list);
            }
            list.style.position = '';
            list.style.left = '';
            list.style.top = '';
            list.style.width = '';
            list.style.right = '';
            list.style.zIndex = '';
            list.classList.remove('tp-dropdown-panel--floating');
        }

        function repositionIfOpen() {
            if (!list.hidden) positionFloatingList();
        }

        function closeList() {
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            activeIndex = -1;
            wrap.classList.remove('is-open');
            restoreListToWrap();
            window.removeEventListener('resize', repositionIfOpen);
            window.removeEventListener('scroll', repositionIfOpen, true);
        }

        function openList() {
            attachListToBody();
            positionFloatingList();
            list.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            wrap.classList.add('is-open');
            window.addEventListener('resize', repositionIfOpen);
            window.addEventListener('scroll', repositionIfOpen, true);
        }

        function renderList() {
            const query = normalizeValue(input.value);
            const matches = filteredOptions(query);
            const exact = options.some((item) => item.toLowerCase() === query.toLowerCase());
            const items = [];

            matches.forEach((item) => {
                items.push({ type: 'option', value: item });
            });

            if (query && !exact) {
                items.push({ type: 'create', value: query });
            }

            if (!items.length) {
                list.innerHTML = '<li class="tp-dropdown-empty text-signature">Нет совпадений</li>';
                openList();
                return;
            }

            list.innerHTML = items.map((item, idx) => {
                if (item.type === 'create') {
                    const label = createLabel.replace('{value}', item.value);
                    return `<li class="tp-dropdown-option tp-dropdown-option--create" role="option" data-index="${idx}" data-create="1">${escapeHtml(label)}</li>`;
                }
                return `<li class="tp-dropdown-option" role="option" data-index="${idx}">${escapeHtml(item.value)}</li>`;
            }).join('');

            openList();
            positionFloatingList();
        }

        function pickValue(value, addIfNew) {
            const v = normalizeValue(value);
            if (!v) return;
            if (addIfNew && !options.some((item) => item.toLowerCase() === v.toLowerCase())) {
                options.push(v);
                options.sort((a, b) => a.localeCompare(b, 'ru'));
                onAddOption?.(v);
            }
            input.value = v;
            closeList();
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        list.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const item = e.target.closest('.tp-dropdown-option');
            if (!item || item.classList.contains('tp-dropdown-empty')) return;
            const isCreate = item.dataset.create === '1';
            const label = isCreate ? normalizeValue(input.value) : item.textContent.trim();
            pickValue(label, isCreate);
        });

        input.addEventListener('focus', () => renderList());
        input.addEventListener('input', () => renderList());
        input.addEventListener('blur', () => {
            setTimeout(closeList, 120);
        });
        input.addEventListener('keydown', (e) => {
            const items = [...list.querySelectorAll('.tp-dropdown-option:not(.tp-dropdown-empty)')];
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (list.hidden) renderList();
                activeIndex = Math.min(activeIndex + 1, items.length - 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIndex = Math.max(activeIndex - 1, 0);
            } else if (e.key === 'Enter') {
                if (!list.hidden && activeIndex >= 0 && items[activeIndex]) {
                    e.preventDefault();
                    const el = items[activeIndex];
                    const isCreate = el.dataset.create === '1';
                    pickValue(isCreate ? input.value : el.textContent.trim(), isCreate);
                    return;
                }
                const v = normalizeValue(input.value);
                if (v && !options.some((item) => item.toLowerCase() === v.toLowerCase())) {
                    e.preventDefault();
                    pickValue(v, true);
                }
                closeList();
                return;
            } else if (e.key === 'Escape') {
                closeList();
                return;
            } else {
                return;
            }

            items.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
            items[activeIndex]?.scrollIntoView({ block: 'nearest' });
        });

        document.addEventListener('click', (e) => {
            if (wrap.contains(e.target) || list.contains(e.target)) return;
            closeList();
        });

        return {
            getValue: () => normalizeValue(input.value),
            setValue: (v) => { input.value = v || ''; },
            setOptions,
        };
    }

    global.initTpCombobox = initTpCombobox;
})(window);
