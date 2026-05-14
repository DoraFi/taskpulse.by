function getApiBasePath() {
    const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
    if (!m) return '/api';
    return `/o/${m[1]}/t/${m[2]}/api`;
}

function apiUrl(path) {
    return `${getApiBasePath()}${path}`;
}

function openCreateProjectModal(overlay) {
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
}

function closeCreateProjectModal(overlay) {
    const picker = document.getElementById('createProjectTypePicker');
    if (picker) picker.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
}

const CREATE_PROJECT_TYPE_LABELS = {
    list: 'Список',
    kanban: 'Kanban',
    scrum: 'Scrum',
    scrumban: 'Scrumban',
};

function bindCreateProjectTypePicker(displayEl, hiddenEl, picker, closeBtn) {
    if (!picker || !closeBtn || !displayEl || !hiddenEl) return;

    function openPicker() {
        picker.setAttribute('aria-hidden', 'false');
    }

    function closePicker() {
        picker.setAttribute('aria-hidden', 'true');
    }

    displayEl.addEventListener('click', openPicker);
    displayEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
        }
    });
    closeBtn.addEventListener('click', closePicker);
    picker.addEventListener('click', (e) => {
        if (e.target === picker) closePicker();
    });

    picker.querySelectorAll('.project-type-card').forEach((card) => {
        card.addEventListener('click', () => {
            const value = card.dataset.templateValue;
            if (!value) return;
            hiddenEl.value = value;
            displayEl.value = CREATE_PROJECT_TYPE_LABELS[value] || value;
            closePicker();
        });
    });
}

(function bindProjectTypePickerEscapeOnce() {
    if (window._tpProjectTypePickerEscBound) return;
    window._tpProjectTypePickerEscBound = true;
    document.addEventListener(
        'keydown',
        (e) => {
            if (e.key !== 'Escape') return;
            const p = document.getElementById('createProjectTypePicker');
            if (p && p.getAttribute('aria-hidden') === 'false') {
                e.preventDefault();
                e.stopPropagation();
                p.setAttribute('aria-hidden', 'true');
            }
        },
        true,
    );
})();

function setupCreateProjectUi() {
    const overlay = document.getElementById('createProjectModal');
    const btn = document.getElementById('projectsCreateBtn');
    if (!overlay || !btn) return;

    const pathname = window.location.pathname;
    const isArchiveView = pathname.endsWith('/projects/archive');
    const isOrgView = pathname.endsWith('/projects/org');
    btn.hidden = isArchiveView || isOrgView;

    if (btn.dataset.tpCreateUi === '1') return;
    btn.dataset.tpCreateUi = '1';

    const nameEl = document.getElementById('createProjectName');
    const summaryEl = document.getElementById('createProjectSummary');
    const typeHiddenEl = document.getElementById('createProjectType');
    const typeDisplayEl = document.getElementById('createProjectTypeDisplay');
    const typePicker = document.getElementById('createProjectTypePicker');
    const typePickerClose = document.getElementById('createProjectTypePickerClose');
    const codeEl = document.getElementById('createProjectCode');
    const errEl = document.getElementById('createProjectError');
    const closeBtn = document.getElementById('createProjectModalClose');
    const cancelBtn = document.getElementById('createProjectCancel');
    const submitBtn = document.getElementById('createProjectSubmit');

    bindCreateProjectTypePicker(typeDisplayEl, typeHiddenEl, typePicker, typePickerClose);

    function resetForm() {
        if (nameEl) nameEl.value = '';
        if (summaryEl) summaryEl.value = '';
        if (typeHiddenEl) typeHiddenEl.value = 'kanban';
        if (typeDisplayEl) typeDisplayEl.value = CREATE_PROJECT_TYPE_LABELS.kanban;
        if (typePicker) typePicker.setAttribute('aria-hidden', 'true');
        if (codeEl) codeEl.value = '';
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = '';
        }
    }

    function showErr(msg) {
        if (!errEl) return;
        errEl.textContent = msg || '';
        errEl.hidden = !msg;
    }

    btn.addEventListener('click', () => {
        resetForm();
        showErr('');
        openCreateProjectModal(overlay);
        nameEl?.focus();
    });

    const close = () => {
        closeCreateProjectModal(overlay);
        resetForm();
    };

    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    submitBtn?.addEventListener('click', async () => {
        const name = String(nameEl?.value || '').trim();
        if (!name) {
            showErr('Введите название проекта');
            return;
        }
        const body = {
            name,
            summary: String(summaryEl?.value || '').trim(),
            projectType: typeHiddenEl?.value || 'kanban',
        };
        const codeRaw = String(codeEl?.value || '').trim();
        if (codeRaw) body.code = codeRaw;

        submitBtn.disabled = true;
        showErr('');
        try {
            const res = await fetch(apiUrl('/projects/create'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                credentials: 'same-origin',
            });
            const text = await res.text();
            let data = {};
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch {
                    data = {};
                }
            }
            const serverMsg = data.message || data.detail || data.error;
            if (!res.ok || data.ok === false) {
                showErr(
                    serverMsg
                        || (res.status === 401 || res.status === 403
                            ? 'Нужна авторизация или нет доступа к этой команде'
                            : null)
                        || `Запрос не выполнен (${res.status})`,
                );
                return;
            }
            close();
            initProjectsPage();
        } catch (e) {
            console.error(e);
            showErr('Ошибка сети');
        } finally {
            submitBtn.disabled = false;
        }
    });
}

function initProjectsPage() {
    const grid = document.querySelector('.projects-grid');
    if (!grid) return;
    setupCreateProjectUi();
    const searchInput = document.querySelector('.projects-toolbar .projects-search input[type="text"]')
        || document.querySelector('.projects-search input[type="text"]');
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
                grid.querySelectorAll('.project-action').forEach(b => {
                    b.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const code = b.dataset.projectCode;
                        const action = b.dataset.action;
                        const endpoint = action === 'restore-project' ? '/projects/restore' : '/projects/archive';
                        try {
                            const res = await fetch(apiUrl(endpoint), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ projectCode: code }),
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

function bootProjectsPage() {
    initProjectsPage();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootProjectsPage);
} else {
    bootProjectsPage();
}
