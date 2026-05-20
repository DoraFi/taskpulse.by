(function () {
    let docTree = { pages: [], modals: [] };
    let docRoute = { kind: 'page', section: 'index', article: 'guide' };
    let ticketSelectedFiles = [];
    let ticketMaxFiles = 5;

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function helpApi(path) {
        if (typeof apiUrl === 'function') return apiUrl(`/help${path}`);
        return `/api/help${path}`;
    }

    function parseHelpRoute() {
        const raw = (window.location.hash || '').replace(/^#/, '').trim();
        if (!raw || raw === 'faq') return { tab: 'faq' };
        if (raw === 'support') return { tab: 'support' };
        if (raw === 'docs') return { tab: 'docs', kind: 'page', section: 'index', article: 'guide' };
        const parts = raw.split('/').filter(Boolean);
        if (parts[0] === 'docs' && (parts[1] === 'page' || parts[1] === 'modal')) {
            return {
                tab: 'docs',
                kind: parts[1],
                section: parts[2] || 'index',
                article: parts[3] || 'guide',
            };
        }
        return { tab: 'faq' };
    }

    function helpHashForRoute(route) {
        if (route.tab === 'faq') return '#faq';
        if (route.tab === 'support') return '#support';
        if (route.tab === 'docs') {
            return `#docs/${route.kind || 'page'}/${route.section || 'index'}`;
        }
        return '#faq';
    }

    function setHelpRoute(route, replace) {
        const url = `${window.location.pathname}${helpHashForRoute(route)}`;
        if (replace) history.replaceState(null, '', url);
        else history.pushState(null, '', url);
        syncHelpMenu();
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

    function previewText(text, maxLen) {
        const t = stripMarkdown(text);
        if (!t) return '';
        if (t.length <= maxLen) return t;
        return `${t.slice(0, maxLen)}…`;
    }

    function showHelpToast(message) {
        if (!message) return;
        if (typeof window.showToast === 'function') {
            window.showToast(message);
            return;
        }
        let toast = document.querySelector('.toast-notification');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast-notification';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(showHelpToast._timer);
        showHelpToast._timer = setTimeout(() => toast.classList.remove('show'), 2800);
    }

    function syncHelpMenu() {
        if (typeof updateActiveMenuItem === 'function') {
            updateActiveMenuItem();
        }
    }

    function renderMarkdown(md) {
        const lines = String(md ?? '').split('\n');
        const html = [];
        let inList = false;
        const closeList = () => {
            if (inList) {
                html.push('</ul>');
                inList = false;
            }
        };
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                closeList();
                continue;
            }
            if (/^!\[.*\]\(.+\)$/.test(trimmed)) {
                continue;
            }
            if (trimmed.startsWith('## ')) {
                closeList();
                html.push(`<h3 class="help-md-h3 text-header">${escapeHtml(trimmed.slice(3))}</h3>`);
                continue;
            }
            if (/^\d+\.\s/.test(trimmed)) {
                closeList();
                const item = escapeHtml(trimmed.replace(/^\d+\.\s/, '')).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                html.push(`<p class="help-md-step">${trimmed.match(/^\d+/)[0]}. ${item}</p>`);
                continue;
            }
            let content = escapeHtml(trimmed);
            content = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            if (trimmed.startsWith('- ')) {
                if (!inList) {
                    html.push('<ul class="help-md-list">');
                    inList = true;
                }
                html.push(`<li>${content.slice(2)}</li>`);
                continue;
            }
            closeList();
            html.push(`<p>${content}</p>`);
        }
        closeList();
        return html.join('');
    }

    function setActiveTab(tabId) {
        document.querySelectorAll('.help-tabs__btn').forEach((btn) => {
            const active = btn.dataset.tab === tabId;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('.help-panel').forEach((panel) => {
            const active = panel.dataset.panel === tabId;
            panel.classList.toggle('is-active', active);
            panel.hidden = !active;
        });
        const helpRoot = document.getElementById('helpPage');
        if (helpRoot) {
            helpRoot.classList.toggle('help-page--docs', tabId === 'docs');
        }
    }

    async function fetchJson(path, options) {
        const res = await fetch(helpApi(path), {
            cache: 'no-store',
            credentials: 'same-origin',
            ...options,
        });
        if (typeof isSessionExpiredResponse === 'function' && isSessionExpiredResponse(res.status)) {
            if (typeof redirectToLoginExpired === 'function') redirectToLoginExpired();
            throw new Error('session_expired');
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || err.error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    function renderFaqBlocks(categories) {
        const el = document.getElementById('helpFaqBlocks');
        if (!el) return;
        const blocks = Array.isArray(categories) ? categories : [];
        if (!blocks.length) {
            el.innerHTML = '<p class="text-basic">Вопросы пока не добавлены.</p>';
            return;
        }
        el.innerHTML = blocks.map((block) => {
            const questions = Array.isArray(block.questions) ? block.questions : [];
            const items = questions.map((q, idx) => `
                <details class="help-faq__item" data-faq-id="${escapeHtml(q.id)}" ${idx === 0 ? '' : ''}>
                    <summary class="text-basic help-faq__question">${escapeHtml(q.question)}</summary>
                    <div class="text-basic help-faq__answer">${escapeHtml(q.answer).replace(/\n/g, '<br>')}</div>
                </details>
            `).join('');
            return `
                <section class="help-faq-block card br-10" data-category="${escapeHtml(block.slug)}">
                    <h2 class="text-header help-faq-block__title">${escapeHtml(block.title)}</h2>
                    <div class="help-faq-block__items">${items || '<p class="text-signature">Нет вопросов в блоке</p>'}</div>
                </section>
            `;
        }).join('');
    }

    function renderFaqSearchResults(rows) {
        const box = document.getElementById('helpFaqSearchResults');
        const blocks = document.getElementById('helpFaqBlocks');
        if (!box || !blocks) return;
        if (!rows.length) {
            box.hidden = true;
            box.innerHTML = '';
            blocks.hidden = false;
            return;
        }
        blocks.hidden = true;
        box.hidden = false;
        box.innerHTML = `
            <p class="text-signature help-search-meta">Найдено: ${rows.length}</p>
            <div class="help-search-list">
            ${rows.map((r) => `
                <button type="button" class="help-search-hit card br-10" data-faq-id="${escapeHtml(r.id)}">
                    <span class="help-search-hit__title text-basic">${escapeHtml(r.question)}</span>
                    <span class="help-search-hit__preview text-signature">${escapeHtml(previewText(r.answer, 200))}</span>
                </button>
            `).join('')}
            </div>
        `;
        box.querySelectorAll('.help-search-hit').forEach((btn) => {
            btn.addEventListener('click', () => {
                box.hidden = true;
                blocks.hidden = false;
                const det = document.querySelector(`details.help-faq__item[data-faq-id="${btn.dataset.faqId}"]`);
                if (det) {
                    det.open = true;
                    det.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        });
    }

    async function loadFaq() {
        const data = await fetchJson('/faq');
        renderFaqBlocks(data);
        document.getElementById('helpFaqBlocks')?.removeAttribute('hidden');
        document.getElementById('helpFaqSearchResults')?.setAttribute('hidden', '');
    }

    function bindFaqSearch() {
        const input = document.getElementById('helpFaqSearchInput');
        if (!input || input.dataset.bound === '1') return;
        input.dataset.bound = '1';
        let timer = null;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            const q = input.value.trim();
            const hint = document.getElementById('helpFaqSearchHint');
            if (q.length < 2) {
                if (hint) hint.textContent = '';
                renderFaqSearchResults([]);
                loadFaq().catch(showHelpError);
                return;
            }
            if (hint) hint.textContent = 'Поиск…';
            timer = setTimeout(async () => {
                try {
                    const rows = await fetchJson(`/faq/search?q=${encodeURIComponent(q)}`);
                    renderFaqSearchResults(Array.isArray(rows) ? rows : []);
                    if (hint) hint.textContent = `Результаты по запросу «${q}»`;
                } catch (e) {
                    showHelpError(e);
                }
            }, 280);
        });
    }

    function renderSupportInfo(info) {
        const title = document.getElementById('helpSupportTitle');
        const lead = document.getElementById('helpSupportLead');
        const meta = document.getElementById('helpSupportMeta');
        const hint = document.getElementById('helpTicketFilesHint');
        if (title && info.title) title.textContent = info.title;
        if (lead) lead.textContent = info.leadText || '';
        if (meta) {
            meta.textContent = [info.workHours, info.responseHint].filter(Boolean).join(' · ');
        }
        if (info.maxFiles) ticketMaxFiles = Number(info.maxFiles) || 5;
        if (hint) {
            hint.textContent = `До ${ticketMaxFiles} файлов, каждый до ${info.maxFileSizeMb || 10} МБ`;
        }
    }

    function ticketFileKey(f) {
        return `${f.name}|${f.size}|${f.lastModified}`;
    }

    function isTicketImage(name) {
        const ext = String(name || '').split('.').pop().toLowerCase();
        return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
    }

    function ticketFileExtBadge(name) {
        const ext = String(name || '').includes('.') ? String(name).split('.').pop() : '';
        return ext ? ext.toUpperCase().slice(0, 4) : 'FILE';
    }

    function renderTicketFiles() {
        const hint = document.getElementById('helpTicketAttachmentsHint');
        const list = document.getElementById('helpTicketFileList');
        if (!hint) return;
        if (!ticketSelectedFiles.length) {
            hint.textContent = 'Перетащите сюда файлы или';
            if (list) list.innerHTML = '';
            return;
        }
        hint.textContent = `Выбрано файлов: ${ticketSelectedFiles.length}`;
        if (!list) return;
        list.innerHTML = ticketSelectedFiles.map((f, idx) => `
            <li class="create-task-selected-file">
                <button type="button" class="create-task-selected-file__remove" data-file-index="${idx}" aria-label="Удалить файл">×</button>
                ${isTicketImage(f.name)
                    ? `<img class="create-task-selected-file__thumb" src="${URL.createObjectURL(f)}" alt="">`
                    : `<span class="create-task-selected-file__badge">${escapeHtml(ticketFileExtBadge(f.name))}</span>`
                }
                <span class="create-task-selected-file__name">${escapeHtml(f.name)}</span>
            </li>
        `).join('');
        list.querySelectorAll('.create-task-selected-file__remove').forEach((btn) => {
            btn.addEventListener('click', () => {
                const index = Number(btn.getAttribute('data-file-index'));
                if (Number.isNaN(index)) return;
                ticketSelectedFiles.splice(index, 1);
                renderTicketFiles();
            });
        });
    }

    function addTicketFiles(files) {
        const incoming = Array.from(files || []);
        if (!incoming.length) return;
        const map = new Map(ticketSelectedFiles.map((f) => [ticketFileKey(f), f]));
        incoming.forEach((f) => map.set(ticketFileKey(f), f));
        ticketSelectedFiles = Array.from(map.values()).slice(0, ticketMaxFiles);
        if (map.size > ticketMaxFiles && typeof window.showToast === 'function') {
            window.showToast(`Не больше ${ticketMaxFiles} файлов`);
        }
        renderTicketFiles();
    }

    function bindTicketAttachments() {
        const zone = document.getElementById('helpTicketAttachmentsZone');
        const btn = document.getElementById('helpTicketAttachmentsBtn');
        const form = document.getElementById('helpTicketForm');
        if (!zone || !form || zone.dataset.bound === '1') return;
        zone.dataset.bound = '1';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.hidden = true;
        fileInput.accept = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.doc,.docx,.zip,image/*,application/pdf';
        form.appendChild(fileInput);

        btn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });
        fileInput.addEventListener('change', () => {
            addTicketFiles(fileInput.files);
            fileInput.value = '';
        });
        zone.addEventListener('click', (e) => e.stopPropagation());
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('create-task-attachments--drag');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('create-task-attachments--drag'));
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('create-task-attachments--drag');
            if (e.dataTransfer?.files) addTicketFiles(e.dataTransfer.files);
        });
    }

    function bindTicketForm() {
        const form = document.getElementById('helpTicketForm');
        const fileList = document.getElementById('helpTicketFileList');
        if (!form || form.dataset.bound === '1') return;
        form.dataset.bound = '1';
        bindTicketAttachments();

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('helpTicketSubmitBtn');
            const subject = document.getElementById('helpTicketSubject')?.value?.trim() || '';
            const message = document.getElementById('helpTicketMessage')?.value?.trim() || '';
            const fd = new FormData();
            fd.append('subject', subject);
            fd.append('message', message);
            ticketSelectedFiles.forEach((f) => fd.append('files', f));
            if (btn) btn.disabled = true;
            try {
                const res = await fetch(helpApi('/support/tickets'), {
                    method: 'POST',
                    body: fd,
                    credentials: 'same-origin',
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || data.error || 'Не удалось отправить');
                showHelpToast(data.message || 'Заявка принята');
                form.reset();
                ticketSelectedFiles = [];
                renderTicketFiles();
                if (fileList) fileList.innerHTML = '';
            } catch (err) {
                showHelpToast(err.message || 'Ошибка отправки');
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    async function loadSupport() {
        const info = await fetchJson('/support');
        renderSupportInfo(info);
        bindTicketForm();
    }

    function renderDocsNav() {
        const nav = document.getElementById('helpDocsNav');
        if (!nav) return;
        const groups = [
            { key: 'page', label: 'Страницы', items: docTree.pages || [] },
            { key: 'modal', label: 'Модальные окна', items: docTree.modals || [] },
        ];
        nav.innerHTML = groups.map((group) => {
            if (!group.items.length) return '';
            return `
                <div class="help-docs-nav__group">
                    <p class="help-docs-nav__group-title">${escapeHtml(group.label)}</p>
                    ${group.items.map((section) => {
                        const active = docRoute.kind === group.key && docRoute.section === section.slug;
                        return `
                            <button type="button"
                                class="help-docs-nav__item ${active ? 'is-active' : ''}"
                                data-kind="${escapeHtml(group.key)}"
                                data-section="${escapeHtml(section.slug)}">
                                ${escapeHtml(section.title)}
                            </button>
                        `;
                    }).join('')}
                </div>
            `;
        }).join('') || '<p class="text-basic">Нет разделов. Примените миграцию V30.</p>';

        nav.querySelectorAll('.help-docs-nav__item').forEach((btn) => {
            btn.addEventListener('click', () => {
                openDoc(btn.dataset.kind, btn.dataset.section, 'guide');
            });
        });
    }

    async function openDoc(kind, sectionSlug, articleSlug) {
        docRoute = { kind, section: sectionSlug, article: articleSlug || 'guide' };
        setHelpRoute({ tab: 'docs', kind, section: sectionSlug, article: articleSlug || 'guide' });
        renderDocsNav();
        const articleEl = document.getElementById('helpDocsArticle');
        if (!articleEl) return;
        articleEl.innerHTML = '<p class="text-basic">Загрузка…</p>';
        try {
            const data = await fetchJson(
                `/docs/${encodeURIComponent(kind)}/${encodeURIComponent(sectionSlug)}?article=${encodeURIComponent(articleSlug || 'guide')}`
            );
            articleEl.innerHTML = `
                <h2 class="text-header help-docs-article__title">${escapeHtml(data.title || data.sectionTitle)}</h2>
                <div class="help-docs-article__scroll">
                    <div class="help-docs-article__body text-basic">${renderMarkdown(data.bodyMd)}</div>
                </div>
            `;
            syncHelpMenu();
        } catch (e) {
            articleEl.innerHTML = `<p class="text-basic">${escapeHtml(e.message)}</p>`;
        }
    }

    function renderDocsSearchResults(rows) {
        const box = document.getElementById('helpDocsSearchResults');
        if (!box) return;
        if (!rows.length) {
            box.hidden = true;
            box.innerHTML = '';
            return;
        }
        box.hidden = false;
        box.innerHTML = `
            <p class="text-signature help-search-meta">Найдено: ${rows.length}</p>
            <div class="help-search-list">
                ${rows.map((r) => `
                    <button type="button" class="help-search-hit card br-10"
                        data-kind="${escapeHtml(r.kind)}"
                        data-section="${escapeHtml(r.section_slug)}"
                        data-article="${escapeHtml(r.article_slug)}">
                        <span class="help-search-hit__title text-basic">${escapeHtml(r.title || r.section_title)}</span>
                        <span class="help-search-hit__preview text-signature">${escapeHtml(previewText(r.snippet, 220))}</span>
                    </button>
                `).join('')}
            </div>
        `;
        box.querySelectorAll('.help-search-hit').forEach((btn) => {
            btn.addEventListener('click', () => {
                box.hidden = true;
                setActiveTab('docs');
                openDoc(btn.dataset.kind, btn.dataset.section, btn.dataset.article);
            });
        });
    }

    function bindDocsSearch() {
        const input = document.getElementById('helpDocsSearchInput');
        if (!input || input.dataset.bound === '1') return;
        input.dataset.bound = '1';
        let timer = null;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            const q = input.value.trim();
            if (q.length < 2) {
                renderDocsSearchResults([]);
                return;
            }
            timer = setTimeout(async () => {
                try {
                    const rows = await fetchJson(`/docs/search?q=${encodeURIComponent(q)}`);
                    renderDocsSearchResults(Array.isArray(rows) ? rows : []);
                } catch (e) {
                    showHelpError(e);
                }
            }, 280);
        });
    }

    function resolveDocTarget(route) {
        let kind = route.kind === 'modal' ? 'modal' : 'page';
        const pool = kind === 'modal' ? (docTree.modals || []) : (docTree.pages || []);
        let section = route.section;
        if (!section || !pool.some((s) => s.slug === section)) {
            if (pool.length) {
                section = pool[0].slug;
            } else {
                kind = kind === 'page' ? 'modal' : 'page';
                const alt = kind === 'modal' ? (docTree.modals || []) : (docTree.pages || []);
                section = alt[0]?.slug || null;
            }
        }
        return { kind, section, article: route.article || 'guide' };
    }

    async function loadDocs(route) {
        docTree = await fetchJson('/docs');
        if (!docTree.pages) docTree.pages = [];
        if (!docTree.modals) docTree.modals = [];
        renderDocsNav();
        bindDocsSearch();
        const target = resolveDocTarget(route);
        const articleEl = document.getElementById('helpDocsArticle');
        if (!target.section) {
            if (articleEl) {
                articleEl.innerHTML = '<p class="text-basic">Документация пуста. Выполните миграцию V30 и перезапустите сервер.</p>';
            }
            return;
        }
        await openDoc(target.kind, target.section, target.article);
    }

    function bindTabs() {
        document.querySelectorAll('.help-tabs__btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                setActiveTab(tab);
                if (tab === 'faq') {
                    setHelpRoute({ tab: 'faq' });
                    loadFaq().catch(showHelpError);
                } else if (tab === 'support') {
                    setHelpRoute({ tab: 'support' });
                    loadSupport().catch(showHelpError);
                } else if (tab === 'docs') {
                    const r = { tab: 'docs', kind: docRoute.kind, section: docRoute.section, article: docRoute.article };
                    setHelpRoute(r);
                    loadDocs(r).catch(showHelpError);
                }
            });
        });
    }

    function showHelpError(err) {
        const sub = document.getElementById('helpSubtitle');
        if (sub) sub.textContent = err?.message || 'Не удалось загрузить справку.';
    }

    async function applyRoute(route) {
        setActiveTab(route.tab);
        if (route.tab === 'faq') {
            await loadFaq();
            bindFaqSearch();
        } else if (route.tab === 'support') {
            await loadSupport();
        } else if (route.tab === 'docs') {
            await loadDocs(route);
        }
    }

    window.initHelpPage = async function initHelpPage() {
        const root = document.getElementById('helpPage');
        if (!root) return;
        if (root.dataset.helpBound !== '1') {
            root.dataset.helpBound = '1';
            bindTabs();
            window.addEventListener('hashchange', () => {
                if (!document.getElementById('helpPage')) return;
                applyRoute(parseHelpRoute()).catch(showHelpError);
                syncHelpMenu();
            });
        }
        try {
            await applyRoute(parseHelpRoute());
        } catch (e) {
            showHelpError(e);
        }
    };

    if (document.getElementById('helpPage')) {
        window.initHelpPage();
    }
})();
