function initProjectsPage() {
    const grid = document.querySelector('.projects-grid');
    if (!grid) return;

    fetch('/api/projects')
        .then(r => r.ok ? r.json() : Promise.reject(new Error('projects api failed')))
        .then(projects => {
            if (!Array.isArray(projects) || !projects.length) return;
            grid.innerHTML = projects.map((p, idx) => {
                const isKanban = idx % 2 === 0;
                const href = isKanban ? '/kanban' : '/boards';
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
                                <div class="project-card__stat"><span class="text-signature">Команда</span><span class="text-basic">${p.teamCount ?? 0}</span></div>
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
