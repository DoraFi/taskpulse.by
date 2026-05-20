(function () {
    if (window.__tpGlobalSearchBoot) return;
    window.__tpGlobalSearchBoot = true;

    const GROUP_LABELS = {
        command: 'Команды',
        nav: 'Разделы',
        task: 'Задачи',
        project: 'Проекты',
        board: 'Доски',
        member: 'Команда',
        mail: 'Почта команды',
        comment: 'Комментарии',
        label: 'Метки',
        faq: 'Справка · FAQ',
        doc: 'Справка · Документация',
        settings: 'Настройки',
    };

    const GROUP_ORDER = [
        'command', 'nav', 'task', 'project', 'board', 'member', 'mail',
        'comment', 'label', 'faq', 'doc', 'settings',
    ];

    let debounceTimer = null;
    let abortCtrl = null;
    let activeIndex = -1;
    let lastItems = [];

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function stripMarkdown(text) {
        return String(text ?? '')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/!\[[^\]]*]\([^)]*\)/g, '')
            .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
            .replace(/^#{1,6}\s*/gm, '')
            .replace(/#{1,6}\s*/g, ' ')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
            .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
            .replace(/`([^`\n]+)`/g, '$1')
            .replace(/~~([^~]+)~~/g, '$1')
            .replace(/^\s*[-*+]\s+/gm, '')
            .replace(/^\s*\d+\.\s+/gm, '')
            .replace(/^\s*>\s?/gm, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function apiSearchUrl(q) {
        const base = typeof window.getApiBasePath === 'function'
            ? window.getApiBasePath()
            : (() => {
                const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
                return m ? `/o/${m[1]}/t/${m[2]}/api` : '/api';
            })();
        return `${base}/search?q=${encodeURIComponent(q)}`;
    }

    function ensureDropdown(panel) {
        let drop = panel.querySelector('.header-global-search__dropdown');
        if (!drop) {
            drop = document.createElement('div');
            drop.className = 'header-global-search__dropdown';
            drop.id = 'headerGlobalSearchDropdown';
            drop.setAttribute('role', 'listbox');
            drop.hidden = true;
            panel.classList.add('header-global-search');
            panel.appendChild(drop);
        }
        return drop;
    }

    function groupItems(items) {
        const groups = new Map();
        for (const item of items) {
            const kind = item.kind || 'other';
            if (!groups.has(kind)) groups.set(kind, []);
            groups.get(kind).push(item);
        }
        const ordered = [];
        for (const kind of GROUP_ORDER) {
            if (groups.has(kind)) ordered.push({ kind, items: groups.get(kind) });
        }
        for (const [kind, list] of groups) {
            if (!GROUP_ORDER.includes(kind)) ordered.push({ kind, items: list });
        }
        return ordered;
    }

    function renderDropdown(drop, data) {
        const items = Array.isArray(data?.items) ? data.items : [];
        lastItems = items;
        activeIndex = -1;

        if (!items.length) {
            const q = (data?.query || '').trim();
            drop.innerHTML = q.length >= 2
                ? '<p class="header-global-search__empty text-signature">Ничего не найдено</p>'
                : '<p class="header-global-search__empty text-signature">Введите минимум 2 символа</p>';
            drop.hidden = false;
            return;
        }

        const grouped = groupItems(items);
        let flatIdx = 0;
        const html = grouped.map((g) => {
            const label = GROUP_LABELS[g.kind] || g.kind;
            const hits = g.items.map((item) => {
                const idx = flatIdx++;
                const title = escapeHtml(item.title);
                const sub = escapeHtml(item.subtitle || '');
                const snip = item.snippet
                    ? `<span class="header-global-search__snippet text-signature">${escapeHtml(stripMarkdown(item.snippet))}</span>`
                    : '';
                return `
                    <button type="button" class="header-global-search__hit" role="option" data-idx="${idx}">
                        <span class="header-global-search__hit-title text-basic">${title}</span>
                        ${sub ? `<span class="header-global-search__hit-sub text-signature">${sub}</span>` : ''}
                        ${snip}
                    </button>`;
            }).join('');
            return `
                <div class="header-global-search__group">
                    <p class="header-global-search__group-label text-signature">${escapeHtml(label)}</p>
                    ${hits}
                </div>`;
        }).join('');

        drop.innerHTML = html;
        drop.hidden = false;
        drop.querySelectorAll('.header-global-search__hit').forEach((btn) => {
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.idx);
                if (Number.isFinite(idx) && lastItems[idx]) activateItem(lastItems[idx]);
            });
        });
    }

    function hideDropdown(drop) {
        if (drop) drop.hidden = true;
        activeIndex = -1;
    }

    async function runSearch(q, drop) {
        if (abortCtrl) abortCtrl.abort();
        abortCtrl = new AbortController();
        try {
            const res = await fetch(apiSearchUrl(q), {
                headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
                credentials: 'same-origin',
                signal: abortCtrl.signal,
            });
            if (res.status === 401 || res.status === 403) {
                if (typeof redirectToLoginExpired === 'function') redirectToLoginExpired();
                return;
            }
            const raw = await res.text();
            let data = {};
            try {
                data = raw ? JSON.parse(raw) : {};
            } catch {
                throw new Error('invalid json');
            }
            if (!res.ok) {
                throw new Error(data.message || data.error || `HTTP ${res.status}`);
            }
            renderDropdown(drop, data);
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('Global search failed', err);
            drop.innerHTML = '<p class="header-global-search__empty text-signature">Ошибка поиска. Перезапустите сервер после обновления.</p>';
            drop.hidden = false;
        }
    }

    async function activateItem(item) {
        const action = item.action;
        if (action === 'openTask' && item.payload) {
            if (typeof window.tpOpenTaskDetailModal === 'function') {
                window.tpOpenTaskDetailModal(item.payload);
                closeSearchUi();
                return;
            }
            if (item.href) {
                const href = item.href;
                if (typeof loadPage === 'function' && href.startsWith('/o/')) loadPage(href);
                else window.location.href = href;
                closeSearchUi();
                return;
            }
        }
        if (action === 'createTask') {
            document.getElementById('headerCreateTaskBtn')?.click();
            closeSearchUi();
            return;
        }
        if (action === 'openProfile') {
            document.getElementById('headerProfileBtn')?.click();
            closeSearchUi();
            return;
        }
        if (action === 'openSettings' || action === 'openSettingsPanel') {
            const panel = item.settingsPanel || 'general';
            if (typeof window.tpOpenSettingsModal === 'function') {
                await window.tpOpenSettingsModal(panel);
            } else {
                document.getElementById('headerSettingsBtn')?.click();
            }
            closeSearchUi();
            return;
        }
        if (item.href) {
            const href = item.href;
            if (typeof loadPage === 'function' && href.startsWith('/o/')) {
                loadPage(href);
            } else {
                window.location.href = href;
            }
            closeSearchUi();
        }
    }

    function closeSearchUi() {
        const input = document.getElementById('headerGlobalSearch');
        const drop = document.getElementById('headerGlobalSearchDropdown');
        if (input) input.value = '';
        hideDropdown(drop);
    }

    function highlightHit(drop, idx) {
        const hits = drop?.querySelectorAll('.header-global-search__hit');
        if (!hits?.length) return;
        hits.forEach((el, i) => el.classList.toggle('is-active', i === idx));
        hits[idx]?.scrollIntoView({ block: 'nearest' });
    }

    function bindInput(input, drop) {
        input.id = 'headerGlobalSearch';
        input.type = 'search';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('aria-label', 'Глобальный поиск');
        input.setAttribute('aria-controls', 'headerGlobalSearchDropdown');
        input.setAttribute('aria-expanded', 'false');
        if (!input.placeholder || input.placeholder === 'Поиск') {
            input.placeholder = 'Поиск: задачи, проекты, команда, справка…';
        }

        input.addEventListener('input', () => {
            const q = input.value.trim();
            clearTimeout(debounceTimer);
            if (q.length < 2) {
                hideDropdown(drop);
                return;
            }
            debounceTimer = setTimeout(() => runSearch(q, drop), 220);
        });

        input.addEventListener('focus', () => {
            const q = input.value.trim();
            if (q.length >= 2) runSearch(q, drop);
        });

        input.addEventListener('keydown', (e) => {
            const hits = drop.querySelectorAll('.header-global-search__hit');
            if (!hits.length) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIndex = Math.min(activeIndex + 1, hits.length - 1);
                highlightHit(drop, activeIndex);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIndex = Math.max(activeIndex - 1, 0);
                highlightHit(drop, activeIndex);
            } else if (e.key === 'Enter' && activeIndex >= 0 && lastItems[activeIndex]) {
                e.preventDefault();
                activateItem(lastItems[activeIndex]);
            } else if (e.key === 'Escape') {
                hideDropdown(drop);
                input.blur();
            }
        });
    }

    function ensureHeaderSearch() {
        const headerLeft = document.querySelector('.header > .gap-24.flex-row, .header > .gap-24');
        if (!headerLeft) return;

        let panel = headerLeft.querySelector('.search-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'search-panel br-5';
            panel.innerHTML = `
                <img class="h-16" src="/static/source/icons/search.svg" alt="">
                <input class="text-basic" type="search" placeholder="Поиск: задачи, проекты, команда, справка…">
            `;
            const logo = headerLeft.querySelector('.logo-link, .logo');
            if (logo?.nextSibling) headerLeft.insertBefore(panel, logo.nextSibling);
            else headerLeft.appendChild(panel);
        }

        const input = panel.querySelector('input');
        if (!input) return;
        const drop = ensureDropdown(panel);
        if (panel.dataset.tpGlobalSearchBound === '1') return;
        panel.dataset.tpGlobalSearchBound = '1';
        bindInput(input, drop);

        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target)) hideDropdown(drop);
        });
    }

    window.tpInitGlobalSearch = ensureHeaderSearch;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureHeaderSearch);
    } else {
        ensureHeaderSearch();
    }
})();
