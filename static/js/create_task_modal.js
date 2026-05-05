(function () {
    if (window.__createTaskModalBoot) return;
    window.__createTaskModalBoot = true;

    const MODAL_URL = '/templates/components/create_task_modal.html';

    function getApiBasePath() {
        const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
        if (!m) return '/api';
        return `/o/${m[1]}/t/${m[2]}/api`;
    }

    function apiUrl(path) {
        return `${getApiBasePath()}${path}`;
    }

    function showToast(message) {
        if (!message) return;
        if (typeof window.showToast === 'function') window.showToast(message);
        else console.log(message);
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

    let selectedFiles = [];
    let formOptions = { projects: [], boards: [], assignees: [], dependencies: [] };
    let currentProjectType = 'kanban';
    let currentProjectCode = null;
    let searchDebounceTimer = null;

    function bindDeadline(modal) {
        if (typeof window.openCustomCalendarRange !== 'function') return;
        const wrap = modal.querySelector('.filter-date');
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
        });
    }

    function renderFileHint(modal) {
        const hint = modal.querySelector('.create-task-attachments__hint');
        const list = modal.querySelector('#createTaskSelectedFiles');
        const isImage = (name) => {
            const ext = String(name || '').split('.').pop().toLowerCase();
            return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
        };
        const extBadge = (name) => {
            const ext = String(name || '').includes('.') ? String(name).split('.').pop() : '';
            return ext ? ext.toUpperCase().slice(0, 4) : 'FILE';
        };
        if (!hint) return;
        if (selectedFiles.length === 0) {
            hint.textContent = 'Перетащите сюда файлы или';
            if (list) list.innerHTML = '';
            return;
        }
        hint.textContent = `Выбрано файлов: ${selectedFiles.length}`;
        if (list) {
            list.style.display = 'grid';
            list.style.gridTemplateColumns = 'repeat(auto-fill, minmax(100px, 1fr))';
            list.style.gap = '8px';
            list.innerHTML = selectedFiles.map((f, idx) => `
                <li style="position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;border:1px solid #dbe6d3;border-radius:8px;background:#fff;">
                    <button type="button" class="create-task-file-remove" data-file-index="${idx}" style="position:absolute;top:4px;right:4px;width:18px;height:18px;border:none;border-radius:50%;background:transparent;color:#3e5c2e;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-size:16px;line-height:1;">×</button>
                    ${isImage(f.name)
                        ? `<img src="${URL.createObjectURL(f)}" alt="" style="width:58px;height:42px;object-fit:cover;border-radius:6px;border:1px solid #dbe6d3;">`
                        : `<span style="display:flex;align-items:center;justify-content:center;width:58px;height:42px;border:1px solid #dbe6d3;border-radius:6px;background:#f7faf5;font-size:10px;color:#3e5c2e;">${extBadge(f.name)}</span>`
                    }
                    <span style="font-size:11px;text-align:center;word-break:break-word;line-height:1.2;">${f.name}</span>
                </li>
            `).join('');
            list.querySelectorAll('.create-task-file-remove').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const index = Number(btn.getAttribute('data-file-index'));
                    if (!Number.isNaN(index)) {
                        const ok = await styledConfirm('Удалить файл из выбранных?');
                        if (!ok) return;
                        selectedFiles.splice(index, 1);
                        renderFileHint(modal);
                    }
                });
            });
        }
    }

    function bindAttachments(modal) {
        const zone = modal.querySelector('.create-task-attachments');
        const btn = modal.querySelector('.create-task-attachments__btn');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.hidden = true;
        modal.appendChild(fileInput);

        const setFiles = files => {
            const incoming = Array.from(files || []);
            if (!incoming.length) return;
            const map = new Map(selectedFiles.map(f => [`${f.name}|${f.size}|${f.lastModified}`, f]));
            incoming.forEach(f => map.set(`${f.name}|${f.size}|${f.lastModified}`, f));
            selectedFiles = Array.from(map.values());
            renderFileHint(modal);
        };

        btn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });
        fileInput.addEventListener('change', () => setFiles(fileInput.files));
        zone?.addEventListener('click', e => e.stopPropagation());
        zone?.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('create-task-attachments--drag');
        });
        zone?.addEventListener('dragleave', () => zone.classList.remove('create-task-attachments--drag'));
        zone?.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('create-task-attachments--drag');
            if (e.dataTransfer?.files) setFiles(e.dataTransfer.files);
        });
    }

    function bindSearchableMenu(input, menu, sourceItems, toLabel, onPick) {
        if (!input || !menu) return () => {};
        let items = sourceItems || [];
        const parent = input.parentElement;
        const setParentLayer = (enabled) => {
            if (!parent) return;
            parent.style.position = 'relative';
            parent.style.overflow = 'visible';
            parent.style.zIndex = enabled ? '9100' : '';
        };
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
        const onFocus = () => {
            setParentLayer(true);
            render(input.value);
        };
        const onBlur = () => setTimeout(() => {
            menu.style.display = 'none';
            setParentLayer(false);
        }, 120);
        input.addEventListener('input', onInput);
        input.addEventListener('focus', onFocus);
        input.addEventListener('blur', onBlur);
        if (parent) {
            parent.style.position = 'relative';
            parent.style.overflow = 'visible';
        }
        menu.style.position = 'absolute';
        menu.style.left = '0';
        menu.style.right = '0';
        menu.style.top = 'calc(100% + 4px)';
        menu.style.maxHeight = '220px';
        menu.style.overflowY = 'auto';
        menu.style.zIndex = '9000';
        menu.style.background = '#fff';
        menu.style.border = '1px solid #dbe6d3';
        render('');
        return (nextItems) => {
            items = nextItems || [];
            render(input.value);
        };
    }

    function forceOpenMenu(input, menu, update) {
        if (!input || !menu) return;
        const open = () => {
            if (typeof update === 'function') update();
            if (menu.children.length > 0) menu.style.display = 'block';
        };
        input.addEventListener('focus', open);
        input.addEventListener('click', open);
        input.addEventListener('keyup', open);
    }

    function renderDependencyHints(modal, dependencies) {
        const list = modal.querySelector('#createTaskDepSuggest');
        if (!list) return;
        list.innerHTML = dependencies.map(d => (
            `<li class="create-task-deps-suggest__item" tabindex="0" data-task-id="${d.id}">${d.displayId} — ${d.name}</li>`
        )).join('');
        list.querySelectorAll('.create-task-deps-suggest__item').forEach(el => {
            el.addEventListener('click', () => {
                const inp = modal.querySelector('#createTaskDepSearch');
                if (inp) inp.value = el.textContent.trim();
                list.querySelectorAll('.create-task-deps-suggest__item').forEach(i => i.classList.remove('is-active'));
                el.classList.add('is-active');
            });
        });
    }

    async function loadOptions(modal, projectCode) {
        return loadOptionsWithQuery(modal, projectCode, '');
    }

    async function loadOptionsWithQuery(modal, projectCode, searchQuery) {
        const params = new URLSearchParams();
        if (projectCode) params.set('project', projectCode);
        if (searchQuery && searchQuery.trim()) params.set('q', searchQuery.trim());
        const q = params.toString() ? `?${params.toString()}` : '';
        const res = await fetch(apiUrl(`/task-form/options${q}`));
        if (!res.ok) throw new Error('Не удалось загрузить опции формы');
        formOptions = await res.json();
        const projects = Array.isArray(formOptions.projects) ? formOptions.projects : [];
        const boards = Array.isArray(formOptions.boards) ? formOptions.boards : [];
        const assignees = Array.isArray(formOptions.assignees) ? formOptions.assignees : [];
        const dependencies = Array.isArray(formOptions.dependencies) ? formOptions.dependencies : [];
        if (modal._updateProjectMenu) modal._updateProjectMenu(projects);
        if (modal._updateBoardMenu) modal._updateBoardMenu(boards);
        if (modal._updateAssigneeMenu) modal._updateAssigneeMenu(assignees);
        if (modal._updateDependencyMenu) modal._updateDependencyMenu(dependencies);
        renderDependencyHints(modal, dependencies);
    }

    function parseProjectCode(value) {
        const m = String(value || '').match(/\[([A-Z0-9]{3,12})\]\s*$/);
        return m ? m[1] : null;
    }

    function getProjectRecordByInput(inputVal) {
        const raw = String(inputVal || '').trim();
        if (!raw) return null;
        const code = parseProjectCode(raw);
        if (code) return (formOptions.projects || []).find(p => p.code === code) || null;
        const exactByName = (formOptions.projects || []).find(p => p.name === raw);
        if (exactByName) return exactByName;
        const exactByCode = (formOptions.projects || []).find(p => String(p.code || '').toLowerCase() === raw.toLowerCase());
        if (exactByCode) return exactByCode;
        return (formOptions.projects || []).find(p => {
            const n = String(p.name || '').toLowerCase();
            const c = String(p.code || '').toLowerCase();
            const q = raw.toLowerCase();
            return n.includes(q) || c.includes(q);
        }) || null;
    }

    async function resolveBoardIdForProject(projectCode) {
        const kanbanRes = await fetch(apiUrl(`/kanban/boards?project=${encodeURIComponent(projectCode)}`));
        if (kanbanRes.ok) {
            const k = await kanbanRes.json();
            const kb = Array.isArray(k.boards) ? k.boards : [];
            if (kb.length > 0) return kb[0].id;
        }
        const listRes = await fetch(apiUrl(`/boards?project=${encodeURIComponent(projectCode)}`));
        if (!listRes.ok) return null;
        const l = await listRes.json();
        const lb = Array.isArray(l.boards) ? l.boards : [];
        return lb.length > 0 ? lb[0].id : null;
    }

    async function uploadAttachments(taskId) {
        if (!taskId || !selectedFiles.length) return { ok: 0, failed: 0 };
        let ok = 0;
        let failed = 0;
        for (const file of selectedFiles) {
            const fd = new FormData();
            fd.append('taskId', String(taskId));
            fd.append('file', file);
            const res = await fetch(apiUrl('/kanban/tasks/attachments/upload'), {
                method: 'POST',
                body: fd
            });
            if (res.ok) ok += 1;
            else failed += 1;
        }
        return { ok, failed };
    }

    function resetForm(modal) {
        modal.querySelector('#createTaskName').value = '';
        modal.querySelector('#createTaskDesc').value = '';
        modal.querySelector('#createTaskAssignee').value = '';
        modal.querySelector('#createTaskHours').value = '';
        modal.querySelector('#createTaskSp').value = '';
        modal.querySelector('#createTaskDeadlineFrom').value = '';
        modal.querySelector('#createTaskDeadlineTo').value = '';
        modal.querySelector('#createTaskDepSearch').value = '';
        modal.querySelector('#createTaskBoard').value = '';
        selectedFiles = [];
        renderFileHint(modal);
    }

    function applyModeUI(modal, projectType) {
        const isList = projectType === 'list';
        currentProjectType = isList ? 'list' : (projectType || 'kanban');
        const depField = modal.querySelector('#createTaskDepType')?.closest('.auth-field');
        const hoursField = modal.querySelector('#createTaskHours')?.closest('.auth-field');
        const spField = modal.querySelector('#createTaskSp')?.closest('.auth-field');
        const deadlineField = modal.querySelector('#createTaskDeadlineFrom')?.closest('.filter-section');
        if (depField) depField.style.display = isList ? 'none' : '';
        if (hoursField) hoursField.style.display = isList ? 'none' : '';
        if (spField) spField.style.display = isList ? 'none' : '';
        if (deadlineField) deadlineField.style.display = currentProjectType === 'scrum' ? 'none' : '';

        const statusSelect = modal.querySelector('#createTaskStatus');
        if (statusSelect) {
            if (isList) {
                statusSelect.innerHTML = '<option value="todo">Не готово</option><option value="done">Готово</option>';
            } else if (statusSelect.options.length <= 2) {
                statusSelect.innerHTML = '<option value="Новая" selected>Новая</option><option value="Назначена">Назначена</option><option value="В работе">В работе</option><option value="Готово">Готово</option><option value="Отложено">Отложено</option>';
            }
        }
    }

    function openModal(overlay) {
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function closeModal(overlay) {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
    }

    function initModal(overlay) {
        if (overlay._createTaskModalInited) return;
        const modal = overlay.querySelector('.create-task-modal');
        if (!modal) return;
        overlay._createTaskModalInited = true;

        bindDeadline(overlay);
        bindAttachments(overlay);

        const projectInput = overlay.querySelector('#createTaskProject');
        const projectMenu = overlay.querySelector('#createTaskProjectMenu');
        const boardInput = overlay.querySelector('#createTaskBoard');
        const boardMenu = overlay.querySelector('#createTaskBoardMenu');
        const assigneeInput = overlay.querySelector('#createTaskAssignee');
        const assigneeMenu = overlay.querySelector('#createTaskAssigneeMenu');
        const depInput = overlay.querySelector('#createTaskDepSearch');
        const depMenu = overlay.querySelector('#createTaskDepSuggest');
        modal._updateProjectMenu = bindSearchableMenu(
            projectInput,
            projectMenu,
            [],
            p => `${p.name} [${p.code}]`,
            async picked => {
                currentProjectCode = picked.code;
                if (boardInput) boardInput.value = '';
                applyModeUI(overlay, picked.type);
                await loadOptions(overlay, picked.code);
                const boards = Array.isArray(formOptions.boards) ? formOptions.boards : [];
                if (boardInput && boards.length === 1) {
                    boardInput.value = `${boards[0].name} [#${boards[0].id}]`;
                }
            }
        );
        modal._updateBoardMenu = bindSearchableMenu(
            boardInput,
            boardMenu,
            [],
            b => `${b.name} [#${b.id}]`
        );
        modal._updateAssigneeMenu = bindSearchableMenu(
            assigneeInput,
            assigneeMenu,
            [],
            a => a.name
        );
        modal._updateDependencyMenu = bindSearchableMenu(
            depInput,
            depMenu,
            [],
            d => `${d.displayId} — ${d.name}`
        );
        forceOpenMenu(projectInput, projectMenu, () => modal._updateProjectMenu?.(formOptions.projects || []));
        forceOpenMenu(boardInput, boardMenu, () => modal._updateBoardMenu?.(formOptions.boards || []));
        forceOpenMenu(assigneeInput, assigneeMenu, () => modal._updateAssigneeMenu?.(formOptions.assignees || []));
        forceOpenMenu(depInput, depMenu, () => modal._updateDependencyMenu?.(formOptions.dependencies || []));
        const bindDbSearch = (input, scope = 'projectScoped') => {
            if (!input) return;
            input.addEventListener('input', () => {
                if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => {
                    const projectForQuery = scope === 'global' ? null : currentProjectCode;
                    loadOptionsWithQuery(overlay, projectForQuery, input.value).catch(() => {});
                }, 180);
            });
        };
        bindDbSearch(projectInput, 'global');
        bindDbSearch(boardInput, 'projectScoped');
        bindDbSearch(assigneeInput, 'projectScoped');
        bindDbSearch(depInput, 'projectScoped');
        projectInput?.addEventListener('change', async () => {
            const rec = getProjectRecordByInput(projectInput.value);
            if (!rec) return;
            currentProjectCode = rec.code;
            if (boardInput) boardInput.value = '';
            await loadOptions(overlay, rec.code);
            const boards = Array.isArray(formOptions.boards) ? formOptions.boards : [];
            if (boardInput && boards.length === 1) boardInput.value = `${boards[0].name} [#${boards[0].id}]`;
        });

        overlay.querySelector('#createTaskModalClose')?.addEventListener('click', e => {
            e.preventDefault();
            closeModal(overlay);
        });
        overlay.querySelector('#createTaskModalCancel')?.addEventListener('click', e => {
            e.preventDefault();
            closeModal(overlay);
        });
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeModal(overlay);
        });

        overlay.querySelector('#createTaskModalSubmit')?.addEventListener('click', async () => {
            try {
                const rec = getProjectRecordByInput(projectInput?.value || '');
                if (!rec) {
                    showToast('Выберите проект из списка.');
                    return;
                }
                const boardValue = (boardInput?.value || '').trim();
                const board = (formOptions.boards || []).find(b => `${b.name} [#${b.id}]` === boardValue);
                const boardId = board ? Number(board.id) : null;
                if (!boardId) {
                    showToast('Выберите доску из списка.');
                    return;
                }

                const name = overlay.querySelector('#createTaskName')?.value?.trim() || '';
                if (!name) {
                    showToast('Введите название задачи.');
                    return;
                }

                const dateFrom = currentProjectType === 'scrum' ? '' : (overlay.querySelector('#createTaskDeadlineFrom')?.value || '');
                const dateTo = currentProjectType === 'scrum' ? '' : (overlay.querySelector('#createTaskDeadlineTo')?.value || '');
                const assignee = overlay.querySelector('#createTaskAssignee')?.value?.trim() || null;
                const hoursRaw = overlay.querySelector('#createTaskHours')?.value || '';
                const spRaw = overlay.querySelector('#createTaskSp')?.value || '';
                const priority = overlay.querySelector('#createTaskPriority')?.value || 'обычный';
                const status = overlay.querySelector('#createTaskStatus')?.value || 'Новая';
                const stage = currentProjectType === 'list'
                    ? (status === 'done' ? 'Готово' : 'Очередь')
                    : (status === 'Новая' ? 'Очередь' : status);
                const depLabel = overlay.querySelector('#createTaskDepSearch')?.value?.trim() || '';
                const depMatch = (formOptions.dependencies || []).find(d => `${d.displayId} — ${d.name}` === depLabel);

                const res = await fetch(apiUrl('/kanban/tasks/create'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        boardId,
                        name,
                        description: overlay.querySelector('#createTaskDesc')?.value || '',
                        stage,
                        priority,
                        dueDate: currentProjectType === 'scrum' ? null : (dateTo || dateFrom || null),
                        startDate: currentProjectType === 'scrum' ? null : (dateFrom || null),
                        endDate: currentProjectType === 'scrum' ? null : (dateTo || null),
                        assignee,
                        storyPoints: currentProjectType === 'list' ? null : (spRaw ? Number(spRaw) : null),
                        estimateHours: currentProjectType === 'list' ? null : (hoursRaw ? Number(hoursRaw) : null),
                        dependencyType: currentProjectType === 'list' ? null : (overlay.querySelector('#createTaskDepType')?.value || null),
                        dependencyTaskId: currentProjectType === 'list' ? null : (depMatch?.id || null)
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    showToast(data.error || 'Не удалось создать задачу.');
                    return;
                }

                const taskId = Number(data.taskId || 0);
                if (taskId > 0 && selectedFiles.length) {
                    const uploadResult = await uploadAttachments(taskId);
                    if (uploadResult.failed > 0) showToast(`Задача создана, но не загрузилось файлов: ${uploadResult.failed}`);
                }

                showToast('Задача создана');
                resetForm(overlay);
                closeModal(overlay);
                if (typeof window.tpRefreshKanban === 'function') await window.tpRefreshKanban();
                else if (typeof window.tpRefreshBoardList === 'function') await window.tpRefreshBoardList();
            } catch (e) {
                console.error(e);
                showToast('Не удалось сохранить задачу.');
            }
        });
    }

    async function ensureModal() {
        let overlay = document.getElementById('createTaskModal');
        if (overlay) return overlay;

        const res = await fetch(MODAL_URL);
        if (!res.ok) throw new Error('create_task_modal load failed');
        const html = await res.text();
        const tmp = document.createElement('div');
        tmp.innerHTML = html.trim();
        overlay = tmp.querySelector('#createTaskModal');
        if (!overlay) return null;
        document.body.appendChild(overlay);
        initModal(overlay);
        return overlay;
    }

    function bindHeader() {
        const btn = document.getElementById('headerCreateTaskBtn');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            try {
                const overlay = await ensureModal();
                if (!overlay) return;
                currentProjectCode = null;
                await loadOptions(overlay, null);
                applyModeUI(overlay, 'kanban');
                const projectInput = overlay.querySelector('#createTaskProject');
                const boardInput = overlay.querySelector('#createTaskBoard');
                const pathProjectMatch = window.location.pathname.match(/\/p\/([^/]+)/);
                const qsProject = new URLSearchParams(window.location.search).get('project');
                const preferredProjectCode = qsProject || (pathProjectMatch ? decodeURIComponent(pathProjectMatch[1]) : null);
                if (preferredProjectCode) {
                    const rec = (formOptions.projects || []).find(p => p.code === preferredProjectCode);
                    if (rec) {
                        projectInput.value = `${rec.name} [${rec.code}]`;
                        currentProjectCode = rec.code;
                        applyModeUI(overlay, rec.type);
                        await loadOptions(overlay, rec.code);
                    }
                }
                if (!projectInput.value && (formOptions.projects || []).length === 1) {
                    const only = formOptions.projects[0];
                    projectInput.value = `${only.name} [${only.code}]`;
                    currentProjectCode = only.code;
                    applyModeUI(overlay, only.type);
                    await loadOptions(overlay, only.code);
                }
                if (!boardInput.value && (formOptions.boards || []).length === 1) {
                    const onlyBoard = formOptions.boards[0];
                    boardInput.value = `${onlyBoard.name} [#${onlyBoard.id}]`;
                }
                openModal(overlay);
            } catch (err) {
                console.error(err);
                showToast('Не удалось открыть форму создания задачи');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindHeader);
    } else {
        bindHeader();
    }
})();
