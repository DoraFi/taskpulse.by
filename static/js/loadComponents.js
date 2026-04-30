(function() {
    const asideContainer = document.getElementById('aside-container');
    if (asideContainer && asideContainer.innerHTML.trim() === '') {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/templates/components/aside.html', false);
        xhr.send();
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

function apiUrl(path) {
    return `${getApiBasePath()}${path}`;
}

function apiUrlForBase(basePath, path) {
    if (!basePath) return `/api${path}`;
    return `${basePath}/api${path}`;
}

async function resolveContextBase() {
    try {
        const res = await fetch('/api/bootstrap/context');
        if (!res.ok) return null;
        const data = await res.json();
        return data && data.basePath ? data.basePath : null;
    } catch {
        return null;
    }
}

function applyContextNavLinks(base) {
    if (!base) return;
    document.querySelectorAll('[data-context-link="home"]').forEach(el => el.dataset.href = base);
    document.querySelectorAll('[data-context-link="tasks"]').forEach(el => el.dataset.href = `${base}/tasks`);
    document.querySelectorAll('[data-context-link="projects"]').forEach(el => el.dataset.href = `${base}/projects`);
    document.querySelectorAll('[data-context-link="projects-org"]').forEach(el => el.dataset.href = `${base}/projects/org`);
    document.querySelectorAll('[data-context-link="projects-archive"]').forEach(el => el.dataset.href = `${base}/projects/archive`);
    document.querySelectorAll('a.logo-link, .header .logo[href="/"], .header a[href="/"]').forEach(a => a.setAttribute('href', base));
}

function isErrorPage() {
    return Boolean(document.querySelector('.tp-error-details'));
}

function clearActiveMenuState() {
    document.querySelectorAll('.nav-link.active').forEach(link => {
        link.classList.remove('active');
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
        applyContextNavLinks(base);
        const [meRes, projectsRes] = await Promise.all([
            fetch(apiUrlForBase(base, '/me')),
            fetch(apiUrlForBase(base, '/projects'))
        ]);
        if (!meRes.ok || !projectsRes.ok) {
            renderFallbackMenu(null, null);
            return;
        }
        const me = await meRes.json();
        const projects = await projectsRes.json();
        const orgId = me.organizationPublicId;
        const teamId = me.teamPublicId;
        if (orgId && teamId) applyContextNavLinks(`/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}`);
        if (!Array.isArray(projects) || !projects.length) {
            renderFallbackMenu(orgId, teamId);
            return;
        }
        const projectsLinks = projects.map((p) => {
            const projectCode = encodeURIComponent(p.code || '');
            const fallback = '#';
            const href = orgId && teamId && projectCode
                ? (p.view === 'kanban'
                    ? `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/p/${projectCode}/kanban?project=${projectCode}`
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

function isCurrentPage(url) {
    const currentUrl = new URL(window.location.href);
    const targetUrl = new URL(url, window.location.origin);
    if (currentUrl.pathname !== targetUrl.pathname) return false;
    if (!targetUrl.search) return true;
    return currentUrl.search === targetUrl.search;
}

function updateActiveMenuItem() {
    clearActiveMenuState();

    if (isErrorPage()) {
        return;
    }

    const currentUrl = new URL(window.location.href);
    
    document.querySelectorAll('.nav-link[data-href]').forEach(link => {
        const linkUrl = new URL(link.dataset.href, window.location.origin);
        
        const samePath = currentUrl.pathname === linkUrl.pathname;
        const sameSearch = !linkUrl.search || currentUrl.search === linkUrl.search;
        if (samePath && sameSearch) {
            link.classList.add('active');
        }
    });
}

function initNavigation() {
    document.querySelectorAll('.nav-link[data-href]').forEach(link => {
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
        // В свернутом режиме кнопка в хедере слева от логотипа.
        if (headerLeft && logo) {
            headerLeft.insertBefore(btn, logo);
        } else if (headerLeft && !btn.parentElement) {
            headerLeft.insertBefore(btn, headerLeft.firstChild);
        }
        return;
    }

    // В развернутом режиме кнопка внутри бокового меню.
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
    e.preventDefault();
    const url = this.dataset.href;
    
    if (isCurrentPage(url)) {
        console.log('Уже на этой странице, переход не требуется');
        return;
    }
    
    loadPage(url);
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
        const response = await fetch(url);
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
                        src.includes('projects');

                    const alreadyInited =
                        (src.includes('board_list') && window.initBoardListPage) ||
                        (src.includes('board_kanban') && window.initBoardKanbanPage) ||
                        (src.includes('tasks') && window.initTasksPage) ||
                        (src.includes('index') && window.initIndexPage) ||
                        (src.includes('projects') && window.initProjectsPage);

                    if (!isPageScript || !alreadyInited) {
                        await loadExternalScript(src);
                    } else {
                        console.log(`Скрипт ${src} уже инициализирован, пропускаем`);
                    }
                }
                
                currentContent.style.opacity = '0';
                currentContent.style.transition = 'opacity 0.2s ease';
                
                setTimeout(() => {
                    console.log('Замена контента...');
                    currentContent.className = newContent.className;
                    currentContent.innerHTML = newContent.innerHTML;
                    currentContent.style.opacity = '1';
                    history.pushState({}, '', url);
                    
                    executeInlineScripts(currentContent);
                    
                    if (currentContent.querySelector('#tasks-grid') && typeof window.initTasksPage === 'function') {
                        console.log('Вызов initTasksPage');
                        window.initTasksPage();
                    }
                    
                    if (currentContent.querySelector('#miniChart') && typeof window.initIndexPage === 'function') {
                        console.log('Вызов initIndexPage');
                        window.initIndexPage();
                    }
                    if (currentContent.querySelector('.projects-grid') && typeof window.initProjectsPage === 'function') {
                        console.log('Вызов initProjectsPage');
                        window.initProjectsPage();
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
                    hydrateTeamProjectsMenu().then(() => {
                        initNavigation();
                        updateActiveMenuItem();
                    });
                    
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
    loadPage(window.location.pathname);
});

document.addEventListener('DOMContentLoaded', () => {
    initSubmenus();
    initAsideCollapseToggle();
    hydrateTeamProjectsMenu().then(() => {
        initNavigation();
        updateActiveMenuItem();
    });
});