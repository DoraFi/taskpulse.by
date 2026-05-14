(function () {
    const STATIC_COPY = {
        attachmentHint: 'перетащите сюда файлы или'
    };

    function stageToStatusValue(stage) {
        const m = {
            Очередь: 'Новая',
            'В работе': 'В работе',
            Тестирование: 'В работе',
            Готово: 'Готово',
            Отложено: 'Отложено',
            'Новые задачи': 'Новые задачи',
            'Следующий спринт': 'Следующий спринт',
            'Через 2 спринта': 'Через 2 спринта',
            'Через 3+ спринта': 'Через 3+ спринта'
        };
        return m[stage] || stage || 'Новая';
    }

    function statusValueToStage(status) {
        const m = {
            'Новая': 'Очередь',
            'Назначена': 'В работе',
            'В работе': 'В работе',
            'Готово': 'Готово',
            'Отложено': 'Отложено',
            'Новые задачи': 'Новые задачи',
            'Следующий спринт': 'Следующий спринт',
            'Через 2 спринта': 'Через 2 спринта',
            'Через 3+ спринта': 'Через 3+ спринта'
        };
        return m[status] || status || 'Очередь';
    }

    function parseHours(task) {
        if (task.timeEstimateHours != null && !Number.isNaN(Number(task.timeEstimateHours))) {
            return String(task.timeEstimateHours);
        }
        const s = task.timeEstimate || '';
        const m = String(s).match(/(\d+(?:[.,]\d+)?)/);
        return m ? m[1].replace(',', '.') : '';
    }

    function resolveTaskDbId(task) {
        if (!task) return null;
        if (task.taskDbId != null && task.taskDbId !== '') {
            const n = Number(task.taskDbId);
            if (Number.isFinite(n) && n > 0) return n;
        }
        if (typeof task.id === 'number' && Number.isFinite(task.id) && task.id > 0) return task.id;
        const n2 = Number(task.id);
        if (Number.isFinite(n2) && n2 > 0) return n2;
        return null;
    }

    function uiDueToIso(due) {
        if (!due) return null;
        if (typeof due !== 'string') due = String(due);
        due = due.trim();
        if (!due) return null;

        if (due.includes('-') && due.length >= 10) return due.slice(0, 10);

        if (!due.includes('.')) return null;
        const parts = due.split('.');
        if (parts.length === 2) {
            const [d, m] = parts;
            const y = String(new Date().getFullYear());
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        if (parts.length === 3) {
            const [d, m, y] = parts;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return null;
    }

    function bindDeadlineInputs(overlay) {
        if (typeof window.openCustomCalendarRange !== 'function') return;
        const wrap = overlay.querySelector('.task-detail-static__dates .filter-date');
        const dateInputs = wrap ? Array.from(wrap.querySelectorAll('input[type="date"]')) : [];
        if (dateInputs.length !== 2) return;
        const [dateFrom, dateTo] = dateInputs;

        const openRangeCalendar = () => {
            window.openCustomCalendarRange({
                start: dateFrom.value || null,
                end: dateTo.value || null,
                onApply: ({ start, end }) => {
                    dateFrom.value = start || '';
                    dateTo.value = end || '';
                }
            });
        };

        [dateFrom, dateTo].forEach(inp => {
            inp.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                openRangeCalendar();
            });
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openRangeCalendar();
                }
            });
        });
    }

    function setInputValue(input, value) {
        if (!input) return;
        input.value = value || '';
    }

    function closeModal(overlay) {
        if (!overlay) return;
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
    }

    function openModal(overlay) {
        if (!overlay) return;
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
    }

    let currentTask = null;
    let selectedFiles = [];
    let currentOptions = { projects: [], assignees: [], dependencies: [] };
    let currentProjectType = 'kanban';
    let currentProjectCode = null;
    let taskDetailSearchTimer = null;
    const SCRUM_BACKLOG_STAGES = new Set(['Новые задачи', 'Следующий спринт', 'Через 2 спринта', 'Через 3+ спринта', 'Отложено']);
    const SCRUM_SPRINT_STAGES = ['Очередь', 'В работе', 'Тестирование', 'Готово'];

    function isScrumTask(task) {
        return String(task?.projectType || '').trim().toLowerCase() === 'scrum';
    }

    function isScrumBacklogTask(task) {
        return isScrumTask(task) && SCRUM_BACKLOG_STAGES.has(String(task?.stage || '').trim());
    }

    function buildStatusOptionsForTask(task) {
        if (!task) return [];
        if (isScrumBacklogTask(task)) {
            return ['Новые задачи', 'Следующий спринт', 'Через 2 спринта', 'Через 3+ спринта', 'Отложено'];
        }
        if (isScrumTask(task)) {
            return SCRUM_SPRINT_STAGES.slice();
        }
        return ['Очередь', 'В работе', 'Тестирование', 'Готово', 'Отложено'];
    }

    function apiBasePath() {
        const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
        if (!m) return '/api';
        return `/o/${m[1]}/t/${m[2]}/api`;
    }

    function apiUrl(path) {
        return `${apiBasePath()}${path}`;
    }

    function safeShowToast(msg) {
        if (!msg) return;
        if (typeof window.showToast === 'function') window.showToast(msg);
        else console.log(msg);
    }

    function styledConfirm(message) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay show';
            overlay.style.zIndex = '10050';
            overlay.innerHTML = `
                <div class="modal-content" style="width:min(420px,92vw);height:auto;max-height:none;">
                    <div class="modal-header"><p class="text-header">Подтверждение</p></div>
                    <div class="modal-body"><p class="text-basic">${message}</p></div>
                    <div class="modal-footer">
                        <button type="button" class="button-secondary">Отмена</button>
                        <button type="button" class="button-basic">Удалить</button>
                    </div>
                </div>
            `;
            const [cancelBtn, okBtn] = overlay.querySelectorAll('button');
            const done = (val) => {
                overlay.remove();
                resolve(val);
            };
            cancelBtn?.addEventListener('click', () => done(false));
            okBtn?.addEventListener('click', () => done(true));
            overlay.addEventListener('click', e => { if (e.target === overlay) done(false); });
            document.body.appendChild(overlay);
        });
    }

    function bindSearchableMenu(input, menu, sourceItems, toLabel, onPick) {
        if (!input || !menu) return () => {};
        let items = sourceItems || [];
        const render = (query) => {
            const q = String(query || '').trim().toLowerCase();
            const filtered = q
                ? items.filter(it => toLabel(it).toLowerCase().includes(q))
                : items;
            menu.innerHTML = filtered.map(it => `<li class="create-task-deps-suggest__item" tabindex="0">${toLabel(it)}</li>`).join('');
            const isActive = document.activeElement === input;
            menu.style.display = isActive && filtered.length ? 'block' : 'none';
            menu.querySelectorAll('.create-task-deps-suggest__item').forEach((el, idx) => {
                el.addEventListener('click', () => {
                    const picked = filtered[idx];
                    input.value = toLabel(picked);
                    menu.style.display = 'none';
                    if (onPick) onPick(picked);
                });
            });
        };
        const onInput = () => render(input.value);
        const onFocus = () => render(input.value);
        const onBlur = () => setTimeout(() => { menu.style.display = 'none'; }, 120);
        input.addEventListener('input', onInput);
        input.addEventListener('focus', onFocus);
        input.addEventListener('blur', onBlur);
        const parent = input.parentElement;
        if (parent) parent.style.position = 'relative';
        menu.style.position = 'absolute';
        menu.style.left = '0';
        menu.style.right = '0';
        menu.style.top = 'calc(100% + 4px)';
        menu.style.maxHeight = '220px';
        menu.style.overflowY = 'auto';
        menu.style.zIndex = '1205';
        menu.style.background = '#fff';
        menu.style.border = '1px solid #dbe6d3';
        render('');
        return (nextItems) => {
            items = nextItems || [];
            render(input.value);
        };
    }

    function parseProjectCode(value) {
        const m = String(value || '').match(/\[([A-Z0-9]{3,12})\]\s*$/);
        return m ? m[1] : null;
    }

    function getProjectRecordByInput(inputVal) {
        const code = parseProjectCode(inputVal);
        if (code) return (currentOptions.projects || []).find(p => p.code === code) || null;
        return (currentOptions.projects || []).find(p => p.name === inputVal) || null;
    }

    async function loadOptions(projectCode) {
        return loadOptionsWithQuery(projectCode, '');
    }

    async function loadOptionsWithQuery(projectCode, searchQuery) {
        const params = new URLSearchParams();
        if (projectCode) params.set('project', projectCode);
        if (searchQuery && searchQuery.trim()) params.set('q', searchQuery.trim());
        const q = params.toString() ? `?${params.toString()}` : '';
        const res = await fetch(apiUrl(`/task-form/options${q}`));
        if (!res.ok) throw new Error('options failed');
        currentOptions = await res.json();
        if (window._tpTaskDetailUpdateProjects) window._tpTaskDetailUpdateProjects(currentOptions.projects || []);
        if (window._tpTaskDetailUpdateAssignees) window._tpTaskDetailUpdateAssignees(currentOptions.assignees || []);
        if (window._tpTaskDetailUpdateDeps) window._tpTaskDetailUpdateDeps(currentOptions.dependencies || []);
    }

    function renderAttachmentHint() {
        const attHint = document.querySelector('#taskDetailModal .create-task-attachments__hint');
        let list = document.getElementById('taskDetailSelectedFiles');
        if (!list) {
            const field = document.getElementById('taskDetailAttachmentsField');
            const uploaded = document.getElementById('taskDetailAttachmentsList');
            if (field) {
                list = document.createElement('ul');
                list.id = 'taskDetailSelectedFiles';
                list.className = 'create-task-deps-suggest text-basic mt-8';
                list.setAttribute('aria-label', 'Выбранные файлы');
                if (uploaded && uploaded.parentElement === field) field.insertBefore(list, uploaded);
                else field.appendChild(list);
            }
        }
        const isImage = (name) => {
            const ext = String(name || '').split('.').pop().toLowerCase();
            return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
        };
        const extBadge = (name) => {
            const ext = String(name || '').includes('.') ? String(name).split('.').pop() : '';
            return ext ? ext.toUpperCase().slice(0, 4) : 'FILE';
        };
        if (!attHint) return;
        if (selectedFiles.length === 0) {
            attHint.textContent = STATIC_COPY.attachmentHint;
            if (list) list.innerHTML = '';
            return;
        }
        attHint.textContent = `Выбрано файлов: ${selectedFiles.length}`;
        if (list) {
            list.style.display = 'grid';
            list.style.gridTemplateColumns = 'repeat(auto-fill, minmax(100px, 1fr))';
            list.style.gap = '8px';
            list.innerHTML = selectedFiles.map((f, idx) => `
                <li style="position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;border:1px solid #dbe6d3;border-radius:8px;background:#fff;">
                    <button type="button" class="task-detail-file-remove" data-file-index="${idx}" style="position:absolute;top:4px;right:4px;width:18px;height:18px;border:none;border-radius:50%;background:transparent;color:#3e5c2e;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-size:16px;line-height:1;">×</button>
                    ${isImage(f.name)
                        ? `<img src="${URL.createObjectURL(f)}" alt="" style="width:58px;height:42px;object-fit:cover;border-radius:6px;border:1px solid #dbe6d3;">`
                        : `<span style="display:flex;align-items:center;justify-content:center;width:58px;height:42px;border:1px solid #dbe6d3;border-radius:6px;background:#f7faf5;font-size:10px;color:#3e5c2e;">${extBadge(f.name)}</span>`
                    }
                    <span style="font-size:11px;text-align:center;word-break:break-word;line-height:1.2;">${f.name}</span>
                </li>
            `).join('');
            list.querySelectorAll('.task-detail-file-remove').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const index = Number(btn.getAttribute('data-file-index'));
                    if (!Number.isNaN(index)) {
                        const ok = await styledConfirm('Удалить файл из выбранных?');
                        if (!ok) return;
                        selectedFiles.splice(index, 1);
                        renderAttachmentHint();
                    }
                });
            });
        }
    }

    async function fetchTaskAttachments(taskId) {
        if (!taskId) return [];
        const res = await fetch(apiUrl(`/kanban/tasks/attachments?taskId=${encodeURIComponent(String(taskId))}`));
        if (!res.ok) return [];
        const data = await res.json().catch(() => []);
        return Array.isArray(data) ? data : [];
    }

    function renderUploadedAttachments(items) {
        const host = document.getElementById('taskDetailAttachmentsList');
        if (!host) return;
        const rows = Array.isArray(items) ? items : [];
        const isImage = (name) => {
            const ext = String(name || '').split('.').pop().toLowerCase();
            return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
        };
        const extBadge = (name) => {
            const ext = String(name || '').includes('.') ? String(name).split('.').pop() : '';
            return ext ? ext.toUpperCase().slice(0, 4) : 'FILE';
        };
        const dt = (iso) => {
            if (!iso) return '';
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return '';
            return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        };
        if (!rows.length) {
            host.innerHTML = '<li class="text-basic color-dark-1">Пока нет загруженных файлов</li>';
            return;
        }
        host.style.display = 'grid';
        host.style.gridTemplateColumns = 'repeat(auto-fill, minmax(110px, 1fr))';
        host.style.gap = '8px';
        host.innerHTML = rows.map(it => {
            const name = String(it.name || 'Файл');
            const url = String(it.url || '#');
            const created = dt(it.createdAt);
            const attachmentId = Number(it.id || 0);
            return `<li style="position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;border:1px solid #dbe6d3;border-radius:8px;background:#fff;">
                <button type="button" class="task-detail-uploaded-remove" data-attachment-id="${attachmentId}" style="position:absolute;top:4px;right:4px;z-index:3;width:18px;height:18px;border:none;border-radius:50%;background:transparent;color:#3e5c2e;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-size:16px;line-height:1;">×</button>
                <a class="text-link" style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;text-decoration:none;" href="${url}" target="_blank" rel="noopener noreferrer">
                    ${isImage(name)
                        ? `<img src="${url}" alt="" style="width:58px;height:42px;object-fit:cover;border-radius:6px;border:1px solid #dbe6d3;">`
                        : `<span style="display:flex;align-items:center;justify-content:center;width:58px;height:42px;border:1px solid #dbe6d3;border-radius:6px;background:#f7faf5;font-size:10px;color:#3e5c2e;">${extBadge(name)}</span>`
                    }
                    <span style="font-size:11px;text-align:center;word-break:break-word;line-height:1.2;">${name}</span>
                </a>
                <span class="text-signature" style="white-space:nowrap;font-size:10px;">${created}</span>
            </li>`;
        }).join('');
        if (!host.dataset.deleteBind) {
            host.addEventListener('click', async (e) => {
                const btn = e.target.closest('.task-detail-uploaded-remove');
                if (!btn) return;
                e.preventDefault();
                e.stopPropagation();
                const attachmentId = Number(btn.getAttribute('data-attachment-id'));
                if (!attachmentId || !resolveTaskDbId(currentTask)) {
                    safeShowToast('Не удалось определить вложение для удаления');
                    return;
                }
                const ok = await styledConfirm('Удалить уже загруженное вложение?');
                if (!ok) return;
                let res = await fetch(apiUrl(`/kanban/tasks/attachments/delete?attachmentId=${attachmentId}`), { method: 'POST' });
                if (!res.ok) {
                    res = await fetch(apiUrl(`/kanban/tasks/attachments/delete?attachmentId=${attachmentId}`), { method: 'GET' });
                }
                if (!res.ok) {
                    safeShowToast('Не удалось удалить вложение');
                    return;
                }
                safeShowToast('Вложение удалено');
                const refreshed = await fetchTaskAttachments(resolveTaskDbId(currentTask));
                renderUploadedAttachments(refreshed);
            });
            host.dataset.deleteBind = '1';
        }
    }

    async function uploadAttachments(taskId) {
        if (!taskId || !selectedFiles.length) return { ok: 0, failed: 0 };
        let ok = 0;
        let failed = 0;
        for (const file of selectedFiles) {
            const fd = new FormData();
            fd.append('taskId', String(taskId));
            fd.append('file', file);
            const res = await fetch(apiUrl('/kanban/tasks/attachments/upload'), { method: 'POST', body: fd });
            if (res.ok) ok += 1;
            else failed += 1;
        }
        return { ok, failed };
    }

    function applyModeUI(projectType, task = null) {
        const isList = projectType === 'list';
        currentProjectType = isList ? 'list' : (projectType || 'kanban');
        const root = document.getElementById('taskDetailModal');
        if (!root) return;
        const depField = root.querySelector('#taskDetailDepType')?.closest('.auth-field');
        const hoursField = root.querySelector('#taskDetailHours')?.closest('.auth-field');
        const spField = root.querySelector('#taskDetailSp')?.closest('.auth-field');
        const deadlineField = root.querySelector('#taskDetailDeadlineFrom')?.closest('.filter-section');
        if (depField) depField.style.display = isList ? 'none' : '';
        if (hoursField) hoursField.style.display = isList ? 'none' : '';
        if (spField) spField.style.display = isList ? 'none' : '';
        if (deadlineField) deadlineField.style.display = currentProjectType === 'scrum' ? 'none' : '';
        const status = document.getElementById('taskDetailStatus');
        if (!status) return;
        if (isList) {
            status.innerHTML = '<option value="todo">Не готово</option><option value="done">Готово</option>';
        } else {
            const options = buildStatusOptionsForTask(task);
            status.innerHTML = options.map(v => `<option value="${v}">${v}</option>`).join('');
        }
        const sideCol = root.querySelector('.task-detail-static__col-side');
        if (sideCol) sideCol.style.display = '';
    }

    window.tpOpenTaskDetailModal = function tpOpenTaskDetailModal(task) {
        const dbId = resolveTaskDbId(task);
        if (!task || dbId == null) return;
        currentTask = task;

        const overlay = document.getElementById('taskDetailModal');
        if (!overlay) return;

        applyModeUI(task.projectType || 'kanban', task);
        const displayId = task.displayId || task.publicId || task.taskCode
            || (typeof task.id === 'string' && task.id.trim() ? task.id.trim() : '')
            || ('#' + dbId);
        const titleEl = document.getElementById('taskDetailTitle');
        if (titleEl) titleEl.textContent = `${displayId} · ${task.name || ''}`;

        setInputValue(document.getElementById('taskDetailProject'), task.project || '');
        loadOptions().then(() => {
            const rec = getProjectRecordByInput(task.project || '');
            if (rec) {
                currentProjectCode = rec.code;
                const input = document.getElementById('taskDetailProject');
                if (input) input.value = `${rec.name} [${rec.code}]`;
                return loadOptions(rec.code);
            }
            return null;
        }).catch(() => {});

        const nameInput = document.getElementById('taskDetailName');
        if (nameInput) nameInput.value = task.name || '';

        const desc = document.getElementById('taskDetailDesc');
        if (desc) desc.value = task.description || '';

        const statusSelect = document.getElementById('taskDetailStatus');
        if (statusSelect) {
            if (currentProjectType === 'list') statusSelect.value = task.stage === 'Готово' ? 'done' : 'todo';
            else {
                const stageValue = stageToStatusValue(task.stage);
                if (![...statusSelect.options].some(o => o.value === stageValue)) {
                    const opt = document.createElement('option');
                    opt.value = stageValue;
                    opt.textContent = stageValue;
                    statusSelect.appendChild(opt);
                }
                statusSelect.value = stageValue;
            }
        }
        const prioritySelect = document.getElementById('taskDetailPriority');
        if (prioritySelect) prioritySelect.value = task.priority || 'обычный';
        setInputValue(document.getElementById('taskDetailAssignee'), task.assignee || '');

        const hours = document.getElementById('taskDetailHours');
        if (hours) hours.value = parseHours(task);

        const sp = task.storyPoints != null ? String(task.storyPoints) : '';
        const spSelect = document.getElementById('taskDetailSp');
        if (spSelect) spSelect.value = sp;

        const hFrom = document.getElementById('taskDetailDeadlineFrom');
        const hTo = document.getElementById('taskDetailDeadlineTo');
        const isoStart = uiDueToIso(task.startDate || task.dueDate);
        const isoEnd = uiDueToIso(task.endDate || task.dueDate);
        if (hFrom) hFrom.value = isoStart || '';
        if (hTo) hTo.value = isoEnd || '';

        const depSearch = document.getElementById('taskDetailDepSearch');
        if (depSearch) depSearch.value = task.dependencyLabel || '';
        const depType = document.getElementById('taskDetailDepType');
        if (depType) depType.value = task.dependencyType || 'relates';

        selectedFiles = [];
        renderAttachmentHint();
        fetchTaskAttachments(resolveTaskDbId(task)).then(renderUploadedAttachments).catch(() => renderUploadedAttachments([]));

        openModal(overlay);
    };

    function init() {
        const overlay = document.getElementById('taskDetailModal');
        if (!overlay) return;

        bindDeadlineInputs(overlay);
        loadOptions().catch(() => {});

        const projectInput = document.getElementById('taskDetailProject');
        const projectMenu = document.getElementById('taskDetailProjectMenu');
        const assigneeInput = document.getElementById('taskDetailAssignee');
        const assigneeMenu = document.getElementById('taskDetailAssigneeMenu');
        const depInput = document.getElementById('taskDetailDepSearch');
        const depMenu = document.getElementById('taskDetailDepSuggest');
        window._tpTaskDetailUpdateProjects = bindSearchableMenu(
            projectInput,
            projectMenu,
            [],
            p => `${p.name} [${p.code}]`,
            async picked => { currentProjectCode = picked.code; await loadOptions(picked.code); }
        );
        window._tpTaskDetailUpdateAssignees = bindSearchableMenu(
            assigneeInput,
            assigneeMenu,
            [],
            a => a.name
        );
        window._tpTaskDetailUpdateDeps = bindSearchableMenu(
            depInput,
            depMenu,
            [],
            d => `${d.displayId} — ${d.name}`
        );
        projectInput?.addEventListener('change', async () => {
            const rec = getProjectRecordByInput(projectInput.value);
            if (!rec) return;
            currentProjectCode = rec.code;
            await loadOptions(rec.code);
        });
        const bindDetailDbSearch = (input) => {
            if (!input) return;
            input.addEventListener('input', () => {
                if (taskDetailSearchTimer) clearTimeout(taskDetailSearchTimer);
                taskDetailSearchTimer = setTimeout(() => {
                    loadOptionsWithQuery(currentProjectCode, input.value).catch(() => {});
                }, 180);
            });
        };
        bindDetailDbSearch(projectInput);
        bindDetailDbSearch(assigneeInput);
        bindDetailDbSearch(depInput);

        const attachBtn = overlay.querySelector('.create-task-attachments__btn');
        const attachZone = overlay.querySelector('.create-task-attachments');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.hidden = true;
        overlay.appendChild(fileInput);
        attachBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });
        fileInput.addEventListener('change', () => {
            const incoming = Array.from(fileInput.files || []);
            const map = new Map(selectedFiles.map(f => [`${f.name}|${f.size}|${f.lastModified}`, f]));
            incoming.forEach(f => map.set(`${f.name}|${f.size}|${f.lastModified}`, f));
            selectedFiles = Array.from(map.values());
            renderAttachmentHint();
        });
        attachZone?.addEventListener('dragover', e => {
            e.preventDefault();
            attachZone.classList.add('create-task-attachments--drag');
        });
        attachZone?.addEventListener('click', e => e.stopPropagation());
        attachZone?.addEventListener('dragleave', () => attachZone.classList.remove('create-task-attachments--drag'));
        attachZone?.addEventListener('drop', e => {
            e.preventDefault();
            attachZone.classList.remove('create-task-attachments--drag');
            const incoming = Array.from(e.dataTransfer?.files || []);
            const map = new Map(selectedFiles.map(f => [`${f.name}|${f.size}|${f.lastModified}`, f]));
            incoming.forEach(f => map.set(`${f.name}|${f.size}|${f.lastModified}`, f));
            selectedFiles = Array.from(map.values());
            renderAttachmentHint();
        });

        const closeBtn = document.getElementById('taskDetailModalClose');
        const footerClose = document.getElementById('taskDetailFooterClose');
        const doClose = () => closeModal(overlay);

        if (closeBtn) closeBtn.addEventListener('click', doClose);
        if (footerClose) footerClose.addEventListener('click', doClose);

        overlay.addEventListener('click', e => {
            if (e.target === overlay) doClose();
        });

        const saveBtn = document.getElementById('taskDetailSaveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                if (!currentTask) return;

                const name = document.getElementById('taskDetailName')?.value?.trim() || '';
                if (!name) {
                    safeShowToast('Введите название задачи.');
                    return;
                }

                const statusVal = document.getElementById('taskDetailStatus')?.value || 'Новая';
                const stage = currentProjectType === 'list'
                    ? (statusVal === 'done' ? 'Готово' : 'Очередь')
                    : statusValueToStage(statusVal);

                const priority = document.getElementById('taskDetailPriority')?.value || 'обычный';

                const from = currentProjectType === 'scrum' ? '' : (document.getElementById('taskDetailDeadlineFrom')?.value || '');
                const to = currentProjectType === 'scrum' ? '' : (document.getElementById('taskDetailDeadlineTo')?.value || '');
                const dueDate = currentProjectType === 'scrum' ? null : ((to || from) || null);
                const depLabel = document.getElementById('taskDetailDepSearch')?.value?.trim() || '';
                const depMatch = (currentOptions.dependencies || []).find(d => `${d.displayId} — ${d.name}` === depLabel);

                const assigneeVal = document.getElementById('taskDetailAssignee')?.value || '';
                const assignee = assigneeVal && String(assigneeVal).trim() ? String(assigneeVal).trim() : null;

                const description = document.getElementById('taskDetailDesc')?.value || '';

                const spRaw = document.getElementById('taskDetailSp')?.value || '';
                const storyPoints = spRaw ? parseInt(spRaw, 10) : null;

                const hoursRaw = document.getElementById('taskDetailHours')?.value || '';
                const estimateHours = hoursRaw ? Number(hoursRaw) : null;

                try {
                    const tid = resolveTaskDbId(currentTask);
                    if (tid == null) throw new Error('task id');
                    const res = await fetch(apiUrl('/kanban/tasks/update'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            taskId: tid,
                            name,
                            description,
                            stage,
                            priority,
                            dueDate,
                            startDate: from || null,
                            endDate: to || null,
                            assignee,
                            storyPoints,
                            estimateHours,
                            dependencyType: currentProjectType === 'list' ? null : (document.getElementById('taskDetailDepType')?.value || null),
                            dependencyTaskId: currentProjectType === 'list' ? null : (depMatch?.id || null)
                        })
                    });
                    if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.error || 'Ошибка сохранения');
                    }

                    safeShowToast('Изменения сохранены');
                    const uploadResult = await uploadAttachments(tid);
                    if (uploadResult.failed > 0) safeShowToast(`Не загрузилось файлов: ${uploadResult.failed}`);
                    const attachmentList = await fetchTaskAttachments(tid);
                    renderUploadedAttachments(attachmentList);
                    closeModal(overlay);
                    currentTask = null;
                    let navRefreshed = false;
                    if (document.getElementById('tasks-grid') && typeof window.tpRefreshTasksPage === 'function') {
                        await window.tpRefreshTasksPage();
                        navRefreshed = true;
                    }
                    if (!navRefreshed && document.getElementById('indexTodoTasks') && typeof window.tpRefreshIndexPage === 'function') {
                        await window.tpRefreshIndexPage();
                        navRefreshed = true;
                    }
                    if (!navRefreshed) {
                        if (typeof window.tpRefreshKanban === 'function') {
                            await window.tpRefreshKanban();
                        } else if (typeof window.tpRefreshBoardList === 'function') {
                            await window.tpRefreshBoardList();
                        }
                    }
                } catch (err) {
                    console.error(err);
                    safeShowToast('Не удалось сохранить задачу');
                }
            });
        }

        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            if (!overlay.classList.contains('show')) return;
            if (document.querySelector('.modal-overlay.custom-calendar-modal.show')) return;
            doClose();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
