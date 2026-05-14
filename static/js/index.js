function getApiBasePath() {
    const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
    if (!m) return '/api';
    return `/o/${m[1]}/t/${m[2]}/api`;
}

function apiUrl(path) {
    return `${getApiBasePath()}${path}`;
}

function getContextBasePath() {
    const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
    if (m) return `/o/${m[1]}/t/${m[2]}`;
    return null;
}

async function resolveContextBasePath() {
    const fromPath = getContextBasePath();
    if (fromPath) return fromPath;
    try {
        const res = await fetch('/api/bootstrap/context');
        if (!res.ok) return null;
        const data = await res.json();
        return data?.basePath || null;
    } catch {
        return null;
    }
}

function navigateTo(url) {
    if (!url) return;
    if (typeof window.loadPage === 'function') window.loadPage(url);
    else window.location.href = url;
}

function escapeIndexHtml(s) {
    if (s == null || s === '') return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function indexTodoTaskForModal(t) {
    if (!t || t.taskDbId == null) return null;
    const pt = String(t.projectType || 'list').toLowerCase();
    return {
        taskDbId: t.taskDbId,
        id: t.taskDbId,
        displayId: t.id,
        name: t.name,
        project: t.project,
        projectType: pt === 'scrum' ? 'scrum' : (pt === 'kanban' ? 'kanban' : 'list'),
        stage: t.stage || 'Очередь',
        priority: t.priority || 'обычный',
        dueDate: t.dueDate,
        description: t.description || ''
    };
}

function wireIndexTodoClicks(grid, todo) {
    if (!grid || !Array.isArray(todo)) return;
    grid.querySelectorAll('.index-todo-row').forEach((row) => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('button,a')) return;
            const idx = Number(row.getAttribute('data-todo-idx'));
            const task = todo[idx];
            const payload = indexTodoTaskForModal(task);
            if (payload && typeof window.tpOpenTaskDetailModal === 'function') {
                window.tpOpenTaskDetailModal(payload);
            }
        });
    });
}

function initIndexPage(options) {
    const forceFetch = options && options.forceFetch === true;
    if (forceFetch) {
        window._tpIndexSummaryLast = null;
        window._tpIndexSummaryLastAt = null;
    }
    if (!document.getElementById('indexTodoTasks')) return Promise.resolve();

    if (!window._tpIndexNavBound) {
        window._tpIndexNavBound = true;
        resolveContextBasePath().then((base) => {
            if (!base) return;
            const hrefByNav = {
                'tasks-all': `${base}/tasks`,
                'tasks-history': `${base}/tasks`,
                'tasks-calendar': `${base}/tasks`,
                'projects-team': `${base}/projects`
            };
            document.querySelectorAll('[data-index-nav]').forEach((el) => {
                const key = el.getAttribute('data-index-nav');
                const href = hrefByNav[key];
                if (!href) return;
                el.onclick = (e) => {
                    e.preventDefault();
                    navigateTo(href);
                };
            });
        });
    }

    const usePrefetch = !forceFetch && window._tpIndexSummaryLast != null;
    if (!usePrefetch) {
        const loadingHtml = '<div class="empty-message">Загрузка…</div>';
        const todoEl = document.getElementById('indexTodoTasks');
        if (todoEl) todoEl.innerHTML = loadingHtml;
        const recentEl = document.getElementById('indexRecentActions');
        if (recentEl) recentEl.innerHTML = loadingHtml;
        const eventsEl = document.querySelector('.events-grid');
        if (eventsEl) eventsEl.innerHTML = loadingHtml;
        const teamList = document.querySelector('.card.team .team-members-list');
        if (teamList) teamList.innerHTML = loadingHtml;
    }

    const summaryUrl = `${apiUrl('/index/summary')}${usePrefetch ? '' : `?_=${Date.now()}`}`;
    const dataPromise = usePrefetch
        ? Promise.resolve(window._tpIndexSummaryLast).then((d) => {
            window._tpIndexSummaryLast = null;
            window._tpIndexSummaryLastAt = null;
            return d;
        })
        : fetch(summaryUrl, { cache: 'no-store', credentials: 'same-origin' })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('index summary failed'))));

    return dataPromise
        .then((data) => {
            const gridEl = document.getElementById('indexTodoTasks');
            if (gridEl) {
                const todo = Array.isArray(data.todo) ? data.todo : [];
                if (todo.length === 0) {
                    gridEl.innerHTML = '<div class="empty-message">Пока нет задач к выполнению</div>';
                } else {
                    gridEl.innerHTML = todo.slice(0, 7).map((task, idx) => {
                        const overdue = isOverdueDate(task.dueDate);
                        const dueClass = isAttentionDate(task.dueDate) ? 'pink' : 'light-gray';
                        return `
                                <div class="grid-row index-todo-row" data-todo-idx="${idx}" role="button" tabindex="0" style="cursor:pointer">
                                    <div class="col-task">
                                        <div class="basic-and-signature">
                                            <p class="text-basic">${escapeIndexHtml(task.name || '')}</p>
                                            <p class="text-signature">${escapeIndexHtml(task.project || '')}</p>
                                        </div>
                                    </div>
                                    <div class="col-date">
                                        ${overdue
                                            ? `<div class="due-attention"><p class="text-basic">Просрочено</p><p class="text-signature">${formatRelativeDate(task.dueDate) || '—'}</p></div>`
                                            : `<p class="text-basic ${dueClass}">${formatRelativeDate(task.dueDate) || '—'}</p>`
                                        }
                                    </div>
                                </div>
                            `;
                    }).join('');
                    wireIndexTodoClicks(gridEl, todo);
                }
            }

            const teamCard = document.querySelector('.card.team');
            if (teamCard && Array.isArray(data.team) && data.team.length > 0) {
                const teamList = teamCard.querySelector('.team-members-list');
                if (teamList) {
                    teamList.innerHTML = data.team.map((m) => `
                        <div class="user-img-text">
                            ${m.online ? `<div class="status-online"><img src="/static/source/user_img/${m.avatar || 'basic_avatar.png'}" alt=""></div>` : `<img src="/static/source/user_img/${m.avatar || 'basic_avatar.png'}" alt="">`}
                            <div class="basic-and-signature">
                                <p class="text-basic">${m.name || ''}</p>
                                <p class="text-signature">${m.role || ''}</p>
                            </div>
                        </div>
                    `).join('');
                }
            }

            const recentRoot = document.getElementById('indexRecentActions');
            if (recentRoot) {
                const actions = Array.isArray(data.recentActions) ? data.recentActions : [];
                if (actions.length === 0) {
                    recentRoot.innerHTML = '<div class="empty-message">Пока нет последних действий</div>';
                } else {
                    recentRoot.innerHTML = actions.slice(0, 5).map((a) => {
                        const idPart = (a.id != null && String(a.id).trim() !== '') ? String(a.id).trim() : '';
                        const namePart = (a.name != null && String(a.name).trim() !== '') ? String(a.name).trim() : '';
                        const titleLine = [idPart, namePart].filter(Boolean).join(' — ');
                        return `
                        <div class="grid-row">
                            <div class="col-avatar"><img class="avatar" src="/static/source/user_img/${a.avatar || 'basic_avatar.png'}" alt=""></div>
                            <div class="col-task">
                                <div class="basic-and-signature">
                                    <p class="text-basic index-recent-title-line">${escapeIndexHtml(titleLine)}</p>
                                    <p class="text-signature index-recent-project-line">${escapeIndexHtml(a.project)}</p>
                                </div>
                            </div>
                            <div class="col-status"><span class="status ${a.status || 'neutral'}">${statusName(a.status)}</span></div>
                            <div class="col-date"><p class="text-basic light-gray">${escapeIndexHtml(a.date)}</p></div>
                        </div>
                    `;
                    }).join('');
                }
            }

            const eventsGrid = document.querySelector('.events-grid');
            if (eventsGrid) {
                const todoList = Array.isArray(data.todo) ? data.todo : [];
                const upcoming = todoList
                    .filter(t => t && t.dueDate)
                    .slice(0, 6);

                if (upcoming.length === 0) {
                    eventsGrid.innerHTML = '<div class="empty-message">Пока нет ближайших событий</div>';
                } else {
                    eventsGrid.innerHTML = upcoming.map(e => {
                        const dueClass = isAttentionDate(e.dueDate) ? 'pink' : 'light-gray';
                        return `
                                <div class="grid-row">
                                    <div class="col-event">
                                        <p class="text-basic">${e.name || ''}</p>
                                    </div>
                                    <div class="col-date">
                                        <p class="text-basic ${dueClass}">${formatRelativeDate(e.dueDate) || ''}</p>
                                    </div>
                                </div>
                            `;
                    }).join('');
                }
            }
        })
        .catch((err) => console.error(err));
}

window.tpRefreshIndexPage = async function tpRefreshIndexPage() {
    await initIndexPage({ forceFetch: true });
};

window.initIndexPage = initIndexPage;

document.addEventListener('DOMContentLoaded', () => initIndexPage({ forceFetch: true }));

function statusName(status) {
    switch (status) {
        case 'inprocess': return 'В работе';
        case 'done': return 'Завершено';
        case 'exit': return 'Отложено';
        default: return 'Назначена';
    }
}

function parseDateValue(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    if (dateStr.includes('.')) {
        const parts = dateStr.split('.');
        let day, month, year;
        if (parts.length === 2) {
            [day, month] = parts;
            year = String(new Date().getFullYear());
        } else {
            [day, month, year] = parts;
        }
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (dateStr.includes('-')) {
        const [year, month, day] = dateStr.split('-');
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
}

function daysDiffFromToday(dateStr) {
    const date = parseDateValue(dateStr);
    if (!date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return Math.round((date - today) / 86400000);
}

function formatRelativeDate(dateStr) {
    const diff = daysDiffFromToday(dateStr);
    if (diff == null) return dateStr || '';
    if (diff === -1) return 'Вчера';
    if (diff === 0) return 'Сегодня';
    if (diff === 1) return 'Завтра';
    return dateStr;
}

function isAttentionDate(dateStr) {
    const diff = daysDiffFromToday(dateStr);
    if (diff == null) return false;
    return diff <= 2;
}

function isOverdueDate(dateStr) {
    const diff = daysDiffFromToday(dateStr);
    if (diff == null) return false;
    return diff < 0;
}
