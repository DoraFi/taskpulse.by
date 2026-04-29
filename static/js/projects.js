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

    Promise.all([fetch(apiUrl('/projects')), fetch(apiUrl('/me'))])
        .then(([projectsRes, meRes]) => {
            if (!projectsRes.ok) throw new Error('projects api failed');
            if (!meRes.ok) throw new Error('me api failed');
            return Promise.all([projectsRes.json(), meRes.json()]);
        })
        .then(([projects, me]) => {
            if (!Array.isArray(projects) || !projects.length) return;
            const orgId = me.organizationPublicId;
            const teamId = me.teamPublicId;
            grid.innerHTML = projects.map((p, idx) => {
                const isKanban = p.view === 'kanban';
                const projectCode = encodeURIComponent(p.code || '');
                const href = (orgId && teamId && projectCode)
                    ? (isKanban
                        ? `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/p/${projectCode}/kanban?project=${projectCode}`
                        : `/o/${encodeURIComponent(orgId)}/t/${encodeURIComponent(teamId)}/p/${projectCode}/boards?project=${projectCode}`)
                    : (isKanban ? `/kanban?project=${projectCode}` : `/boards?project=${projectCode}`);
                const mode = isKanban ? 'Kanban' : 'List';
                const chip = p.doneCount > 0 ? 'Активен' : 'Новый';
                return `
                    <a class="project-card ${isKanban ? 'project-card--kanban' : 'project-card--list'}" href="${href}" aria-label="Открыть проект">
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
                            <div class="project-card__footer"><button class="button-basic">Открыть проект</button></div>
                        </div>
                    </a>
                `;
            }).join('');
        })
        .catch(err => console.error(err));
}

window.initProjectsPage = initProjectsPage;
document.addEventListener('DOMContentLoaded', initProjectsPage);
