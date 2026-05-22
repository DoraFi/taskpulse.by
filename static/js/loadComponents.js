function redirectToLoginExpired() {
    const path = window.location.pathname + window.location.search;
    const redirect = path.startsWith('/auth/') ? '' : `&redirect=${encodeURIComponent(path)}`;
    window.location.replace(`/auth/login?session=expired${redirect}`);
}

function isSessionExpiredResponse(status) {
    return status === 401 || status === 403;
}

(function() {
    const asideContainer = document.getElementById('aside-container');
    if (asideContainer && asideContainer.innerHTML.trim() === '') {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/templates/components/aside.html', false);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.send();
        if (isSessionExpiredResponse(xhr.status)) {
            redirectToLoginExpired();
            return;
        }
        if (xhr.status === 200) {
            asideContainer.innerHTML = xhr.responseText;
        }
    }
})();

function getApiBasePath() {
    const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
    if (!m) return '/api';
    return `/o/${m[1]}/t/${m[2]}/api`;
}

window.getApiBasePath = getApiBasePath;

(function loadTpDebugScript() {
    if (window.__tpDebugScriptLoaded) return;
    window.__tpDebugScriptLoaded = true;
    const s = document.createElement('script');
    s.src = '/static/js/tp_debug.js';
    s.async = false;
    document.head.appendChild(s);
})();

function ensureGlobalToast() {
    if (typeof window.showToast === 'function') return;
    window.showToast = function showToast(message) {
        if (!message) return;
        let toast = document.querySelector('.toast-notification');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast-notification';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(window.showToast._hideTimer);
        window.showToast._hideTimer = setTimeout(() => toast.classList.remove('show'), 2800);
    };
}

async function ensureTeamSwitchScript() {
    if (window.__tpTeamSwitchBoot) {
        if (typeof window.tpInitHeaderTeamSwitch === 'function') {
            window.tpInitHeaderTeamSwitch();
        }
        return;
    }
    return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = '/static/js/team_switch.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
    });
}

function ensureGlobalSearchScript() {
    if (window.__tpGlobalSearchScriptLoading || window.__tpGlobalSearchBoot) return Promise.resolve();
    window.__tpGlobalSearchScriptLoading = true;
    return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = '/static/js/global_search.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
    });
}

function initGlobalSearchUi() {
    if (typeof window.tpInitGlobalSearch === 'function') {
        window.tpInitGlobalSearch();
    }
}

function apiUrl(path) {
    return `${getApiBasePath()}${path}`;
}

function apiUrlForBase(basePath, path) {
    if (!basePath) return `/api${path}`;
    return `${basePath}/api${path}`;
}

function getContextBaseFromPathname() {
    const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
    if (!m) return null;
    return `/o/${m[1]}/t/${m[2]}`;
}

async function resolveContextBase() {
    const fromPath = getContextBaseFromPathname();
    if (fromPath) {
        try {
            sessionStorage.setItem('tpActiveTeamBase', fromPath);
        } catch (_) {  }
        return fromPath;
    }
    try {
        const stored = sessionStorage.getItem('tpActiveTeamBase');
        if (stored && /^\/o\/[^/]+\/t\/[^/]+$/.test(stored)) {
            const probe = await fetch(`${stored}/api/my-teams`, { credentials: 'same-origin', cache: 'no-store' });
            if (probe.ok) {
                return stored;
            }
            sessionStorage.removeItem('tpActiveTeamBase');
        }
    } catch (_) {  }
    try {
        const res = await fetch('/api/bootstrap/context');
        if (isSessionExpiredResponse(res.status)) {
            redirectToLoginExpired();
            return null;
        }
        if (!res.ok) return null;
        const data = await res.json();
        const base = data && data.basePath ? data.basePath : null;
        if (base) {
            try {
                sessionStorage.setItem('tpActiveTeamBase', base);
            } catch (_) {  }
        }
        return base;
    } catch {
        return null;
    }
}

window.getContextBaseFromPathname = getContextBaseFromPathname;

function contextIdsFromBase(base) {
    if (!base) return { orgId: null, teamId: null };
    const m = String(base).match(/^\/o\/([^/]+)\/t\/([^/]+)/);
    if (!m) return { orgId: null, teamId: null };
    return { orgId: decodeURIComponent(m[1]), teamId: decodeURIComponent(m[2]) };
}

function applyContextNavLinks(base) {
    if (!base) return;
    document.querySelectorAll('[data-context-link="home"]').forEach(el => el.dataset.href = base);
    document.querySelectorAll('[data-context-link="tasks"]').forEach(el => el.dataset.href = `${base}/tasks`);
    document.querySelectorAll('[data-context-link="projects"]').forEach(el => el.dataset.href = `${base}/projects`);
    document.querySelectorAll('[data-context-link="projects-org"]').forEach(el => el.dataset.href = `${base}/projects/org`);
    document.querySelectorAll('[data-context-link="projects-archive"]').forEach(el => el.dataset.href = `${base}/projects/archive`);
    document.querySelectorAll('[data-context-link="team"]').forEach(el => el.dataset.href = `${base}/team`);
    document.querySelectorAll('[data-context-link="events"]').forEach(el => el.dataset.href = `${base}/events`);
    document.querySelectorAll('[data-context-link="analytics-section"]').forEach(el => el.dataset.href = `${base}/analytics`);
    document.querySelectorAll('[data-context-link="analytics"]').forEach(el => el.dataset.href = `${base}/analytics`);
    document.querySelectorAll('[data-context-link="analytics-reports"]').forEach(el => el.dataset.href = `${base}/analytics#reports`);
    document.querySelectorAll('[data-context-link="analytics-charts"]').forEach(el => el.dataset.href = `${base}/analytics#charts`);
    document.querySelectorAll('[data-context-link="analytics-compare"]').forEach(el => el.dataset.href = `${base}/analytics#compare`);
    document.querySelectorAll('[data-context-link="help-section"]').forEach(el => el.dataset.href = `${base}/help#faq`);
    document.querySelectorAll('[data-context-link="help-faq"]').forEach(el => el.dataset.href = `${base}/help#faq`);
    document.querySelectorAll('[data-context-link="help-support"]').forEach(el => el.dataset.href = `${base}/help#support`);
    document.querySelectorAll('[data-context-link="help-docs"]').forEach(el => el.dataset.href = `${base}/help#docs/page/index`);
    document.querySelectorAll('a.logo-link, .header .logo[href="/"], .header a[href="/"]').forEach(a => a.setAttribute('href', base));
}

function isErrorPage() {
    return Boolean(document.querySelector('.tp-error-details'));
}

function clearActiveMenuState() {
    document.querySelectorAll('.nav-link.active, .nav-link.nav-link--in-section').forEach(link => {
        link.classList.remove('active', 'nav-link--in-section');
    });
}

async function hydrateTeamProjectsMenu() {
    const menu = document.getElementById('teamProjectsMenu');
    if (!menu) return;
    const renderFallbackMenu = (orgId, teamId) => {
        menu.innerHTML = `
            <li><button class="nav-link" data-href="${orgId && teamId ? `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/projects/org` : '#'}">Проекты организации</button></li>
            <li><button class="nav-link" data-href="${orgId && teamId ? `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/projects/archive` : '#'}">Архивные проекты</button></li>
            <li><span class="text-signature">Нет доступных проектов</span></li>
        `;
    };
    try {
        const base = await resolveContextBase();
        const navBase = getContextBaseFromPathname() || base;
        applyContextNavLinks(navBase);
        const { orgId, teamId } = contextIdsFromBase(navBase);
        const [meRes, projectsRes] = await Promise.all([
            fetch(apiUrlForBase(navBase, '/me')),
            fetch(apiUrlForBase(navBase, '/projects'))
        ]);
        if (!meRes.ok || !projectsRes.ok) {
            renderFallbackMenu(orgId, teamId);
            return;
        }
        const projects = await projectsRes.json();
        if (!Array.isArray(projects) || !projects.length) {
            renderFallbackMenu(orgId, teamId);
            return;
        }
        const seenCodes = new Set();
        const uniqueProjects = projects.filter((p) => {
            const code = String(p.code || p.id || '').trim().toLowerCase();
            if (!code || seenCodes.has(code)) return false;
            seenCodes.add(code);
            return true;
        });
        const projectsLinks = uniqueProjects.map((p) => {
            const projectCode = encodeURIComponent(p.code || '');
            const fallback = '#';
            const href = orgId && teamId && projectCode
                ? (p.view === 'kanban'
                    ? `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/p/${projectCode}/kanban?project=${projectCode}`
                    : p.view === 'scrum'
                        ? `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/p/${projectCode}/scrum?project=${projectCode}`
                    : `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/p/${projectCode}/boards?project=${projectCode}`)
                : fallback;
            return `<li><button class="nav-link" data-href="${href}">${p.name || 'Проект'}</button></li>`;
        }).join('');
        const staticLinks = `
            <li><button class="nav-link" data-href="${orgId && teamId ? `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/projects/org` : '#'}">Проекты организации</button></li>
            <li><button class="nav-link" data-href="${orgId && teamId ? `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/projects/archive` : '#'}">Архивные проекты</button></li>
        `;
        menu.innerHTML = projectsLinks + staticLinks;

        if (isErrorPage()) {
            clearActiveMenuState();
        }
    } catch (e) {
        console.error(e);
        renderFallbackMenu(null, null);
    }
}

function saveSubmenusState() {
    const states = {};
    document.querySelectorAll('.item').forEach((item, index) => {
        const submenu = item.querySelector('.submenu');
        states[index] = submenu ? submenu.style.display === 'block' : false;
    });
    localStorage.setItem('submenusState', JSON.stringify(states));
    console.log('Состояние подменю сохранено:', states);
}

function openDefaultSubmenus() {
    document.querySelectorAll('.item').forEach((item, index) => {
        const submenu = item.querySelector('.submenu');
        const arrowWrapper = item.querySelector('.arrow-wrapper');
        const arrowImg = arrowWrapper?.querySelector('.arrow-img');
        if (!submenu) return;
        const shouldOpen = index === 2;
        submenu.style.display = shouldOpen ? 'block' : 'none';
        if (arrowImg) arrowImg.style.transform = shouldOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
    });
}

function loadSubmenusState() {
    const saved = localStorage.getItem('submenusState');
    if (!saved) {
        openDefaultSubmenus();
        return;
    }
    
    try {
        const states = JSON.parse(saved);
        document.querySelectorAll('.item').forEach((item, index) => {
            const submenu = item.querySelector('.submenu');
            const arrowWrapper = item.querySelector('.arrow-wrapper');
            const arrowImg = arrowWrapper?.querySelector('.arrow-img');
            
            if (submenu && states[index] !== undefined) {
                if (states[index]) {
                    submenu.style.display = 'block';
                    if (arrowImg) arrowImg.style.transform = 'rotate(-90deg)';
                } else {
                    submenu.style.display = 'none';
                    if (arrowImg) arrowImg.style.transform = 'rotate(0deg)';
                }
            }
        });
        console.log('Состояние подменю загружено');
    } catch (e) {
        console.error('Ошибка загрузки состояния подменю:', e);
        openDefaultSubmenus();
    }
}

function handleArrowClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const arrow = e.currentTarget;
    const item = arrow.closest('.item');
    const submenu = item?.querySelector('.submenu');
    const arrowImg = arrow.querySelector('.arrow-img');
    
    if (submenu) {
        const isOpen = submenu.style.display === 'block';
        submenu.style.display = isOpen ? 'none' : 'block';
        if (arrowImg) arrowImg.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
        
        saveSubmenusState();
    }
}

function initSubmenus() {
    document.querySelectorAll('.arrow-wrapper').forEach(arrow => {
        arrow.removeEventListener('click', handleArrowClick);
        arrow.addEventListener('click', handleArrowClick);
    });
    
    loadSubmenusState();
}

function pageRoot(container, selector) {
    if (!container) return null;
    if (container.matches && container.matches(selector)) return container;
    return container.querySelector(selector);
}

function isAnalyticsPage(container) {
    if (!container) return false;
    if (container.classList && container.classList.contains('analytics-page')) return true;
    return Boolean(pageRoot(container, '#analyticsPage'));
}

function applyAppContainerPageShell(target, source) {
    if (!target || !source) return;
    target.className = source.className;
    if (source.id) {
        target.id = source.id;
    } else {
        target.removeAttribute('id');
    }
    delete target.dataset.controlsBound;
    delete target.dataset.tabsBound;
    delete target.dataset.helpBound;
}

function isAnalyticsPath(pathname) {
    return pathname.endsWith('/analytics');
}

function analyticsTabFromUrl(url) {
    const hash = (url.hash || '').replace('#', '').trim();
    return hash || 'overview';
}

function isHelpPage(container) {
    if (!container) return false;
    if (container.classList && container.classList.contains('help-page')) return true;
    return Boolean(pageRoot(container, '#helpPage'));
}

function isEventsPage(container) {
    if (!container) return false;
    if (container.classList && container.classList.contains('events-page')) return true;
    return Boolean(pageRoot(container, '#eventsPage'));
}

function isHelpPath(pathname) {
    return pathname.endsWith('/help');
}

function isEventsPath(pathname) {
    return pathname.endsWith('/events');
}

function helpNavHash(url) {
    return (url.hash || '').replace('#', '').trim();
}

function helpNavMatches(currentUrl, contextLink) {
    if (!isHelpPath(currentUrl.pathname)) return false;
    const hash = helpNavHash(currentUrl);
    if (contextLink === 'help-faq') {
        return hash === 'faq' || hash === '';
    }
    if (contextLink === 'help-support') {
        return hash === 'support';
    }
    if (contextLink === 'help-docs') {
        return hash === 'docs' || hash.startsWith('docs/');
    }
    return false;
}

function navLinkMatches(currentUrl, linkUrl, contextLink) {
    if (currentUrl.pathname !== linkUrl.pathname) return false;
    if (linkUrl.search && currentUrl.search !== linkUrl.search) return false;
    if (contextLink === 'analytics-section' || contextLink === 'help-section') {
        return false;
    }
    if (isAnalyticsPath(currentUrl.pathname)) {
        return analyticsTabFromUrl(currentUrl) === analyticsTabFromUrl(linkUrl);
    }
    if (isHelpPath(currentUrl.pathname)) {
        if (contextLink === 'help-faq' || contextLink === 'help-support' || contextLink === 'help-docs') {
            return helpNavMatches(currentUrl, contextLink);
        }
        return helpNavHash(currentUrl) === helpNavHash(linkUrl);
    }
    return true;
}

function isCurrentPage(url, contextLink) {
    const currentUrl = new URL(window.location.href);
    const targetUrl = new URL(url, window.location.origin);
    return navLinkMatches(currentUrl, targetUrl, contextLink);
}

function updateActiveMenuItem() {
    clearActiveMenuState();

    if (isErrorPage()) {
        return;
    }

    const currentUrl = new URL(window.location.href);
    
    const onAnalytics = isAnalyticsPath(currentUrl.pathname);
    const onHelp = isHelpPath(currentUrl.pathname);

    document.querySelectorAll('.nav-link[data-href]').forEach(link => {
        const linkUrl = new URL(link.dataset.href, window.location.origin);
        const contextLink = link.dataset.contextLink || '';
        if (contextLink === 'analytics-section') {
            if (onAnalytics) {
                link.classList.add('nav-link--in-section');
            }
            return;
        }
        if (contextLink === 'help-section') {
            if (onHelp) {
                link.classList.add('nav-link--in-section');
            }
            return;
        }
        if (navLinkMatches(currentUrl, linkUrl, contextLink)) {
            link.classList.add('active');
        }
    });
}

function initNavigation() {
    document.querySelectorAll('.nav-link[data-href], a.logo-link[data-href]').forEach(link => {
        link.removeEventListener('click', handleNavigationClick);
        link.addEventListener('click', handleNavigationClick);
    });
}

const ASIDE_COLLAPSED_KEY = 'tpAsideCollapsed';

function ensureAsideCollapseButton() {
    let btn = document.getElementById('asideCollapseToggle');
    if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'asideCollapseToggle';
        btn.className = 'header-toolbar__action aside-collapse-toggle-btn';
        btn.setAttribute('aria-label', 'Свернуть меню');
        btn.innerHTML = '<img class="h-32 aside-toggle-icon" src="/static/source/icons/close_aside.svg" alt="">';
    }
    if (!btn.dataset.bound) {
        btn.addEventListener('click', () => {
            const collapsed = !document.body.classList.contains('aside-collapsed');
            setAsideCollapsedState(collapsed);
        });
        btn.dataset.bound = '1';
    }
    return btn;
}

function placeAsideToggleButton(collapsed) {
    const btn = ensureAsideCollapseButton();
    const headerLeft = document.querySelector('.header .gap-24.flex-row');
    const logo = headerLeft?.querySelector('.logo-link');
    const aside = document.getElementById('aside-container');

    if (collapsed) {
        if (headerLeft && logo) {
            headerLeft.insertBefore(btn, logo);
        } else if (headerLeft && !btn.parentElement) {
            headerLeft.insertBefore(btn, headerLeft.firstChild);
        }
        return;
    }

    if (aside) {
        let slot = aside.querySelector('.aside-collapse-corner');
        if (!slot) {
            slot = document.createElement('div');
            slot.className = 'aside-collapse-corner';
            aside.appendChild(slot);
        }
        slot.innerHTML = '';
        slot.appendChild(btn);
    }
}

function setAsideCollapsedState(collapsed) {
    document.body.classList.toggle('aside-collapsed', !!collapsed);
    localStorage.setItem(ASIDE_COLLAPSED_KEY, collapsed ? '1' : '0');
    const btn = ensureAsideCollapseButton();
    if (btn) {
        btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
        btn.setAttribute('aria-label', collapsed ? 'Развернуть меню' : 'Свернуть меню');
    }
    placeAsideToggleButton(!!collapsed);
}

function initAsideCollapseToggle() {
    ensureAsideCollapseButton();
    const saved = localStorage.getItem(ASIDE_COLLAPSED_KEY) === '1';
    setAsideCollapsedState(saved);
}

function handleNavigationClick(e) {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = this.dataset.href;
    if (!url || url === '#') return;

    e.preventDefault();
    if (isCurrentPage(url, this.dataset.contextLink)) {
        if (typeof window.initIndexPage === 'function' && document.getElementById('indexTodoTasks')) {
            window.initIndexPage({ forceFetch: true });
        } else if (typeof window.initAnalyticsPage === 'function' && document.getElementById('analyticsPage')) {
            const targetUrl = new URL(url, window.location.origin);
            history.replaceState(null, '', `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash || ''}`);
            ensureChartJs()
                .then(() => window.initAnalyticsPage())
                .catch((err) => console.error('Chart.js не загружен для аналитики', err));
            updateActiveMenuItem();
        } else if (typeof window.initHelpPage === 'function' && document.getElementById('helpPage')) {
            const targetUrl = new URL(url, window.location.origin);
            history.replaceState(null, '', `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash || ''}`);
            window.initHelpPage().catch((err) => console.error('help init', err));
            updateActiveMenuItem();
        } else if (typeof window.initEventsPage === 'function' && document.getElementById('eventsPage')) {
            const targetUrl = new URL(url, window.location.origin);
            history.replaceState(null, '', `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash || ''}`);
            window.initEventsPage().catch((err) => console.error('events init', err));
            updateActiveMenuItem();
        } else {
            console.log('Уже на этой странице, переход не требуется');
        }
        return;
    }

    const navBase = getContextBaseFromPathname();
    if (navBase && url && !String(url).startsWith(navBase)) {
        const target = new URL(url, window.location.origin);
        const linkMatch = target.pathname.match(/^\/o\/[^/]+\/t\/[^/]+(\/.*)?$/);
        if (linkMatch) {
            const suffix = linkMatch[1] || '';
            const rebuilt = `${navBase}${suffix}${target.search}${target.hash || ''}`;
            loadPage(rebuilt);
            return;
        }
    }

    loadPage(url);
}

const SPA_BODY_FRAGMENT_IDS = ['taskDetailModal', 'eventDetailModal', 'eventFormModal'];

function mountSpaBodyFragments(doc) {
    SPA_BODY_FRAGMENT_IDS.forEach((id) => {
        const fresh = doc.getElementById(id);
        if (!fresh) return;
        document.getElementById(id)?.remove();
        document.body.appendChild(document.importNode(fresh, true));
    });
}

const CHART_JS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

async function ensureChartJs() {
    if (typeof window.Chart === 'function') return true;
    await loadExternalScript(CHART_JS_CDN);
    return typeof window.Chart === 'function';
}

async function loadExternalScript(src) {
    const absoluteSrc = new URL(src, window.location.origin).href;
    const exists = Array.from(document.querySelectorAll('script[src]'))
        .some(s => new URL(s.src, window.location.origin).href === absoluteSrc);
    if (exists) {
        console.log(`Скрипт ${src} уже загружен`);
        return true;
    }
    
    if (src.includes('board_list') && window.initBoardListPage) {
        console.log(`Скрипт ${src} уже инициализирован через window`);
        return true;
    }
    if (src.includes('board_kanban') && window.initBoardKanbanPage) {
        console.log(`Скрипт ${src} уже инициализирован через window`);
        return true;
    }
    if (src.includes('tasks') && window.initTasksPage) {
        console.log(`Скрипт ${src} уже инициализирован через window`);
        return true;
    }
    if (src.includes('index') && window.initIndexPage) {
        console.log(`Скрипт ${src} уже инициализирован через window`);
        return true;
    }
    if (src.includes('projects') && window.initProjectsPage) {
        console.log(`Скрипт ${src} уже инициализирован через window`);
        return true;
    }
    if (src.includes('team') && window.initTeamPage) {
        console.log(`Скрипт ${src} уже инициализирован через window`);
        return true;
    }
    if (src.includes('analytics') && window.initAnalyticsPage) {
        console.log(`Скрипт ${src} уже инициализирован через window`);
        return true;
    }
    if (src.includes('help.js') && window.initHelpPage) {
        console.log(`Скрипт ${src} уже инициализирован через window`);
        return true;
    }
    if (src.includes('events.js') && window.initEventsPage) {
        console.log(`Скрипт ${src} уже инициализирован через window`);
        return true;
    }
    if (src.includes('event_modal.js') && typeof window.tpOpenEventDetail === 'function') {
        return true;
    }
    
    console.log(`Загружаем скрипт: ${src}`);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            console.log(`Скрипт ${src} загружен`);
            resolve(true);
        };
        script.onerror = () => {
            console.error(`Ошибка загрузки ${src}`);
            reject(new Error(`Failed to load ${src}`));
        };
        document.head.appendChild(script);
    });
}

async function loadExternalStylesheet(href) {
    if (!href) return true;
    const absoluteHref = new URL(href, window.location.origin).href;
    const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .some(l => new URL(l.href, window.location.origin).href === absoluteHref);
    if (exists) {
        console.log(`Стили ${href} уже загружены`);
        return true;
    }

    console.log(`Загружаем стили: ${href}`);
    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = () => resolve(true);
        link.onerror = () => reject(new Error(`Failed to load stylesheet ${href}`));
        document.head.appendChild(link);
    });
}

function executeInlineScripts(container) {
    const scripts = container.querySelectorAll('script:not([src])');
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        newScript.textContent = oldScript.textContent;
        document.body.appendChild(newScript);
        document.body.removeChild(newScript);
    });
}

async function loadPage(url) {
    console.log('=== loadPage начат ===', url);
    try {
        const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newContent = doc.querySelector('.app-container');
        
        if (newContent) {
            const currentContent = document.querySelector('.app-container');
            if (currentContent) {
                const stylesheets = doc.querySelectorAll('link[rel="stylesheet"][href]');
                for (const link of stylesheets) {
                    const href = link.getAttribute('href');
                    if (!href) continue;
                    await loadExternalStylesheet(href);
                }

                const externalScripts = doc.querySelectorAll('script[src]');
                
                for (const script of externalScripts) {
                    const src = script.src;
                    if (src.includes('loadComponents.js') || src.includes('app.js')) {
                        continue;
                    }
                    
                    const isPageScript =
                        src.includes('board_list') ||
                        src.includes('board_kanban') ||
                        src.includes('tasks') ||
                        src.includes('index') ||
                        src.includes('projects') ||
                        src.includes('team') ||
                        src.includes('analytics') ||
                        src.includes('help.js') ||
                        src.includes('events.js') ||
                        src.includes('event_modal.js');

                    const alreadyInited =
                        (src.includes('board_list') && window.initBoardListPage) ||
                        (src.includes('board_kanban') && window.initBoardKanbanPage) ||
                        (src.includes('tasks') && window.initTasksPage) ||
                        (src.includes('index') && window.initIndexPage) ||
                        (src.includes('projects') && window.initProjectsPage) ||
                        (src.includes('team') && window.initTeamPage) ||
                        (src.includes('analytics') && window.initAnalyticsPage) ||
                        (src.includes('help.js') && window.initHelpPage) ||
                        (src.includes('events.js') && window.initEventsPage);
                    const forceLoad =
                        (src.includes('task_detail_modal') && typeof window.tpOpenTaskDetailModal !== 'function')
                        || (src.includes('event_modal.js') && typeof window.tpOpenEventDetail !== 'function')
                        || (src.includes('chart.js') && typeof window.Chart !== 'function');

                    if (!isPageScript || !alreadyInited || forceLoad) {
                        await loadExternalScript(src);
                    } else {
                        console.log(`Скрипт ${src} уже инициализирован, пропускаем`);
                    }
                }
                
                currentContent.style.opacity = '0';
                currentContent.style.transition = 'opacity 0.2s ease';
                
                const targetUrl = new URL(url, window.location.origin);
                const goingToAnalytics = isAnalyticsPath(targetUrl.pathname)
                    || Boolean(newContent.classList.contains('analytics-page') || newContent.id === 'analyticsPage');
                if (goingToAnalytics) {
                    await ensureChartJs();
                }

                setTimeout(() => {
                    console.log('Замена контента...');
                    applyAppContainerPageShell(currentContent, newContent);
                    currentContent.innerHTML = newContent.innerHTML;
                    currentContent.style.opacity = '1';
                    history.pushState({}, '', url);
                    const t = doc.title && doc.title.trim();
                    if (t) {
                        document.title = t;
                    }
                    
                    executeInlineScripts(currentContent);
                    mountSpaBodyFragments(doc);
                    if (typeof window.tpInitTaskDetailModal === 'function') {
                        window.tpInitTaskDetailModal();
                    }
                    if (typeof window.tpInitEventModals === 'function') {
                        window.tpInitEventModals();
                    }

                    if (currentContent.querySelector('#tasks-grid') && typeof window.initTasksPage === 'function') {
                        console.log('Вызов initTasksPage');
                        window.initTasksPage();
                    }
                    
                    if (currentContent.querySelector('#indexTodoTasks') && typeof window.initIndexPage === 'function') {
                        console.log('Вызов initIndexPage');
                        window.initIndexPage({ forceFetch: true });
                    }
                    if (currentContent.querySelector('.projects-grid') && typeof window.initProjectsPage === 'function') {
                        console.log('Вызов initProjectsPage');
                        window.initProjectsPage();
                    }
                    if (currentContent.querySelector('#teamMembersGrid') && typeof window.initTeamPage === 'function') {
                        console.log('Вызов initTeamPage');
                        window.initTeamPage();
                    }
                    if (isAnalyticsPage(currentContent) && typeof window.initAnalyticsPage === 'function') {
                        console.log('Вызов initAnalyticsPage');
                        ensureChartJs()
                            .then(() => window.initAnalyticsPage())
                            .catch((err) => console.error('Chart.js не загружен для аналитики', err));
                    }
                    if (isHelpPage(currentContent) && typeof window.initHelpPage === 'function') {
                        console.log('Вызов initHelpPage');
                        window.initHelpPage();
                    }
                    if (isEventsPage(currentContent) && typeof window.initEventsPage === 'function') {
                        console.log('Вызов initEventsPage');
                        window.initEventsPage();
                    }

                    const isBoardList = currentContent.classList.contains('board-list') && !currentContent.classList.contains('board-kanban');
                    const isBoardKanban = currentContent.classList.contains('board-kanban');

                    if (isBoardList && typeof window.initBoardListPage === 'function') {
                        console.log('Вызов initBoardListPage');
                        window.initBoardListPage();
                    }

                    if (isBoardKanban && typeof window.initBoardKanbanPage === 'function') {
                        console.log('Вызов initBoardKanbanPage');
                        window.initBoardKanbanPage();
                    }
                    
                    initSubmenus();
                    initAsideCollapseToggle();
                    const navBaseNow = getContextBaseFromPathname();
                    if (navBaseNow) applyContextNavLinks(navBaseNow);
                    hydrateTeamProjectsMenu().then(() => {
                        initNavigation();
                        updateActiveMenuItem();
                    });
                    ensureGlobalSearchScript().then(initGlobalSearchUi);
                    ensureTeamSwitchScript();
                    
                    console.log('Загрузка страницы завершена');
                }, 200);
            }
        } else {
            window.location.href = url;
        }
    } catch (error) {
        console.error('Ошибка загрузки страницы:', error);
        window.location.href = url;
    }
}

window.addEventListener('popstate', () => {
    loadPage(`${window.location.pathname}${window.location.search}${window.location.hash || ''}`);
});

document.addEventListener('DOMContentLoaded', () => {
    ensureGlobalToast();
    initSubmenus();
    initAsideCollapseToggle();
    hydrateTeamProjectsMenu().then(() => {
        initNavigation();
        updateActiveMenuItem();
    });
    ensureGlobalSearchScript().then(initGlobalSearchUi);
    ensureTeamSwitchScript();
});