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

function initIndexPage() {
    fetch(apiUrl('/index/summary'))
        .then(r => r.ok ? r.json() : Promise.reject(new Error('index summary failed')))
        .then(data => {
            const grid = document.getElementById('indexTodoTasks');
            if (grid) {
                const todo = Array.isArray(data.todo) ? data.todo : [];
                if (todo.length === 0) {
                    grid.innerHTML = '<div class="empty-message">Пока нет задач к выполнению</div>';
                } else {
                    grid.innerHTML = todo.slice(0, 7).map(task => {
                        const overdue = isOverdueDate(task.dueDate);
                        const dueClass = isAttentionDate(task.dueDate) ? 'pink' : 'light-gray';
                        return `
                                <div class="grid-row">
                                    <div class="col-task">
                                        <div class="basic-and-signature">
                                            <p class="text-basic">${task.name || ''}</p>
                                            <p class="text-signature">${task.project || ''}</p>
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
                    recentRoot.innerHTML = actions.slice(0, 5).map((a) => `
                        <div class="grid-row">
                            <div class="col-avatar"><img class="avatar" src="/static/source/user_img/${a.avatar || 'basic_avatar.png'}" alt=""></div>
                            <div class="col-task">
                                <div class="basic-and-signature">
                                    <span class="id-name">
                                        <p class="text-basic" id="tasknumber">${a.id || ''}</p>
                                        <p class="text-basic" id="taskname">${a.name || ''}</p>
                                    </span>
                                    <p class="text-signature" id="projectname">${a.project || ''}</p>
                                </div>
                            </div>
                            <div class="col-status"><span class="status ${a.status || 'neutral'}">${statusName(a.status)}</span></div>
                            <div class="col-date"><p class="text-basic light-gray">${a.date || ''}</p></div>
                        </div>
                    `).join('');
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
        .catch(err => console.error(err));

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

window.initIndexPage = initIndexPage;

document.addEventListener('DOMContentLoaded', initIndexPage);
