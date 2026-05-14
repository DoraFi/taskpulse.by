function getApiBasePath() {
    const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
    if (!m) return '/api';
    return `/o/${m[1]}/t/${m[2]}/api`;
}

function apiUrl(path) {
    return `${getApiBasePath()}${path}`;
}

function initProjectsPage() {
    const grid = document.querySelector('.projects-grid');
    if (!grid) return;
    const searchInput = document.querySelector('.projects-search input[type="text"]');
    const pathname = window.location.pathname;
    const isArchiveView = pathname.endsWith('/projects/archive');
    const isOrgView = pathname.endsWith('/projects/org');
    const scope = isOrgView || isArchiveView ? 'organization' : 'team';
    const archived = isArchiveView ? 'true' : 'false';
    Promise.all([fetch(apiUrl(`/projects?scope=${encodeURIComponent(scope)}&archived=${archived}`)), fetch(apiUrl('/me'))])
        .then(([projectsRes, meRes]) => {
            if (!projectsRes.ok) throw new Error('projects api failed');
            if (!meRes.ok) throw new Error('me api failed');
            return Promise.all([projectsRes.json(), meRes.json()]);
        })
        .then(([projects, me]) => {
            const orgId = me.organizationPublicId;
            const teamId = me.teamPublicId;
            const allProjects = Array.isArray(projects) ? projects : [];
            const renderProjects = (query = '') => {
                const q = String(query || '').trim().toLowerCase();
                const filtered = !q ? allProjects : allProjects.filter(p => {
                    const name = String(p.name || '').toLowerCase();
                    return name.includes(q);
                });
                if (!filtered.length) {
                    grid.innerHTML = `<p class="text-basic">${allProjects.length ? 'Ничего не найдено' : 'Список пуст'}</p>`;
                    return;
                }
                grid.innerHTML = filtered.map((p) => {
                    const isKanban = p.view === 'kanban';
                    const isScrum = p.view === 'scrum';
                    const projectCode = encodeURIComponent(p.code || '');
                    const totalTasks = Number(p.taskCount ?? 0);
                    const doneTasks = Number(p.doneCount ?? 0);
                    const inProcessTasks = Number(p.inProgressCount ?? 0);
                    const fallbackTodo = Math.max(0, totalTasks - doneTasks - inProcessTasks);
                    const todoTasks = Number.isFinite(Number(p.todoCount)) ? Number(p.todoCount) : fallbackTodo;
                    const donePct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
                    const inProcessPct = totalTasks > 0 ? Math.round((inProcessTasks / totalTasks) * 100) : 0;
                    const todoPct = Math.max(0, 100 - donePct - inProcessPct);
                    const href = (orgId && teamId && projectCode)
                        ? (isKanban
                            ? `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/p/${projectCode}/kanban?project=${projectCode}`
                            : isScrum
                                ? `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/p/${projectCode}/scrum?project=${projectCode}`
                                : `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/p/${projectCode}/boards?project=${projectCode}`)
                        : (isKanban ? `/kanban?project=${projectCode}` : isScrum ? `/scrum?project=${projectCode}` : `/boards?project=${projectCode}`);
                    const mode = isKanban ? 'Kanban' : isScrum ? 'Scrum' : 'List';
                    const chip = doneTasks > 0 ? 'Активен' : 'Новый';
                    const projectAction = isArchiveView
                        ? `<button class="button-basic project-action" data-project-code="${p.code}" data-action="restore-project">Восстановить</button>`
                        : `<button class="button-secondary project-action" data-project-code="${p.code}" data-action="archive-project">В архив</button>`;
                    return `
                        <a class="project-card ${(isKanban || isScrum) ? 'project-card--kanban' : 'project-card--list'}" href="${href}" aria-label="Открыть проект">
                            <div class="project-card__body">
                                <div class="project-card__head">
                                    <div class="project-card__icon" aria-hidden="true">${(p.code || 'PRJ').slice(0,1)}</div>
                                    <div class="project-card__titles">
                                        <p class="text-header project-card__title">${p.name || ''}</p>
                                        <p class="text-signature project-card__subtitle">${mode} · ${p.code || ''}</p>
                                    </div>
                                    <span class="project-card__chip text-signature">${chip}</span>
                                </div>
                                <p class="text-signature project-card__desc">${p.summary || ''}</p>
                                <div class="project-card__stats">
                                    <div class="project-card__stat"><span class="text-signature">Команда</span><span class="text-basic">${p.teamName || me.teamName || '—'}</span></div>
                                    <div class="project-card__stat"><span class="text-signature">Доски</span><span class="text-basic">${p.boardCount ?? 0}</span></div>
                                    <div class="project-card__stat"><span class="text-signature">Задачи</span><span class="text-basic">${p.taskCount ?? 0}</span></div>
                                    <div class="project-card__stat"><span class="text-signature">Готово</span><span class="text-basic">${p.doneCount ?? 0}</span></div>
                                </div>
                                <div class="project">
                                    <div class="project-percents">
                                        <div class="done" style="width:${donePct}%;">${donePct}%</div>
                                        <div class="inprocess" style="width:${inProcessPct}%;">${inProcessPct}%</div>
                                        <div class="todo" style="width:${todoPct}%;">${todoPct}%</div>
                                    </div>
                                    <div class="legends">
                                        <div class="legend"><div class="circle bg-dark-green"></div><p>Завершено</p></div>
                                        <div class="legend"><div class="circle bg-green"></div><p>В работе</p></div>
                                        <div class="legend"><div class="circle bg-light-gray"></div><p>Не начато</p></div>
                                    </div>
                                </div>
                                <div class="project-card__footer">${projectAction}<button class="button-basic">Открыть проект</button></div>
                            </div>
                        </a>
                    `;
                }).join('');
                grid.querySelectorAll('.project-action').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const code = btn.dataset.projectCode;
                        const action = btn.dataset.action;
                        const endpoint = action === 'restore-project' ? '/projects/restore' : '/projects/archive';
                        try {
                            const res = await fetch(apiUrl(endpoint), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ projectCode: code })
                            });
                            if (!res.ok) throw new Error('project action failed');
                            initProjectsPage();
                        } catch (err) {
                            console.error(err);
                        }
                    });
                });
            };
            renderProjects(searchInput?.value || '');
            if (searchInput) {
                searchInput.oninput = () => renderProjects(searchInput.value);
            }
        })
        .catch(err => {
            console.error(err);
            grid.innerHTML = '<p class="text-basic">Не удалось загрузить проекты для текущего контекста</p>';
        });
}

window.initProjectsPage = initProjectsPage;
document.addEventListener('DOMContentLoaded', initProjectsPage);
