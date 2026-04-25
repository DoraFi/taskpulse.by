(() => {
    let kanbanBoards = [];
    let kanbanTasks = [];
    let teamMembers = [];
    let currentView = 'board';

    const KANBAN_STORAGE_KEY = 'kanbanBoardsData';
    const KANBAN_DATA_VERSION_KEY = 'kanbanDataVersion';
    const KANBAN_DATA_VERSION = '5';
    const KANBAN_COLLAPSE_KEY = 'kanbanBoardCollapsed';
    const KANBAN_SECTION_COLLAPSE_KEY = 'kanbanSectionCollapsed';
    const KANBAN_TIMELINE_SHOW_DONE_KEY = 'kanbanTimelineShowDone';

    function getTimelineShowDone() {
        const v = localStorage.getItem(KANBAN_TIMELINE_SHOW_DONE_KEY);
        if (v == null) return true;
        return v === 'true';
    }

    function setTimelineShowDone(next) {
        localStorage.setItem(KANBAN_TIMELINE_SHOW_DONE_KEY, String(!!next));
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function parseDateBoard(dateStr) {
        if (!dateStr) return new Date(9999, 11, 31);
        if (typeof dateStr === 'string' && dateStr.includes('.')) {
            const parts = dateStr.split('.');
            if (parts.length === 3) {
                const [day, month, year] = parts;
                const date = new Date(year, month - 1, day);
                return isNaN(date.getTime()) ? new Date(9999, 11, 31) : date;
            }
        }
        if (typeof dateStr === 'string' && dateStr.includes('-')) {
            const [year, month, day] = dateStr.split('-');
            const date = new Date(year, month - 1, day);
            return isNaN(date.getTime()) ? new Date(9999, 11, 31) : date;
        }
        return new Date(9999, 11, 31);
    }

    function getTaskDisplayId(task) {
        return task?.displayId || task?.id || '';
    }

    function formatDueDate(dateStr) {
        if (!dateStr) return '';
        let year, month, day;
        if (dateStr.includes('.')) {
            const parts = dateStr.split('.');
            if (parts.length === 3) {
                day = parts[0];
                month = parts[1];
                year = parts[2];
            }
        } else if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                year = parts[0];
                month = parts[1];
                day = parts[2];
            }
        } else {
            return dateStr;
        }
        const currentYear = new Date().getFullYear();
        if (parseInt(year) === currentYear) return `${day}.${month}`;
        return `${day}.${month}.${year}`;
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    function closeKanbanModal(overlay) {
        if (!overlay) return;
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 200);
    }

    function openKanbanModal({ title, bodyEl, footerEl }) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.width = '28vw';
        content.style.height = 'auto';
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `
        <p class="text-header">${escapeHtml(title)}</p>
        <button type="button" class="modal-close">
            <img src="/static/source/icons/cross.svg" alt="Закрыть">
        </button>
    `;
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.style.gap = '0.75rem';
        if (typeof bodyEl === 'string') body.innerHTML = bodyEl;
        else if (bodyEl) body.appendChild(bodyEl);
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        if (footerEl) footer.appendChild(footerEl);
        content.append(header, body, footer);
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));
        const close = () => closeKanbanModal(overlay);
        header.querySelector('.modal-close').addEventListener('click', close);
        overlay.addEventListener('click', e => {
            if (e.target === overlay) close();
        });
        return { overlay, close, body, footer };
    }

    function showKanbanTextModal({ title, label, value, submitLabel, onSubmit }) {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.gap = '0.5rem';
        if (label) {
            const lb = document.createElement('label');
            lb.className = 'text-basic';
            lb.textContent = label;
            wrap.appendChild(lb);
        }
        const input = document.createElement('input');
        input.type = 'text';
        input.style.width = '100%';
        input.value = value || '';
        wrap.appendChild(input);
        const footer = document.createElement('div');
        footer.style.display = 'flex';
        footer.style.gap = '0.5rem';
        footer.style.justifyContent = 'flex-end';
        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'button-secondary';
        btnCancel.textContent = 'Отмена';
        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.className = 'button-basic';
        btnOk.textContent = submitLabel || 'Применить';
        footer.append(btnCancel, btnOk);
        const { overlay, close, body } = openKanbanModal({ title, bodyEl: wrap, footerEl: footer });
        btnCancel.addEventListener('click', close);
        btnOk.addEventListener('click', () => {
            const v = input.value.trim();
            onSubmit(v, close);
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                btnOk.click();
            }
        });
        setTimeout(() => input.focus(), 50);
        return overlay;
    }

    function showKanbanConfirmModal({ title, message, confirmLabel, danger, onConfirm }) {
        const p = document.createElement('p');
        p.className = 'text-basic';
        p.textContent = message;
        const footer = document.createElement('div');
        footer.style.display = 'flex';
        footer.style.gap = '0.5rem';
        footer.style.justifyContent = 'flex-end';
        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'button-secondary';
        btnCancel.textContent = 'Отмена';
        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.className = danger ? 'button-basic' : 'button-basic';
        if (danger) btnOk.style.color = '#F8085C';
        btnOk.textContent = confirmLabel || 'OK';
        footer.append(btnCancel, btnOk);
        const { close, body } = openKanbanModal({ title, bodyEl: p, footerEl: footer });
        btnCancel.addEventListener('click', close);
        btnOk.addEventListener('click', () => {
            onConfirm();
            close();
        });
    }

    function showKanbanTextareaModal({ title, value, onSubmit }) {
        const ta = document.createElement('textarea');
        ta.className = 'text-basic';
        ta.rows = 5;
        ta.style.width = '100%';
        ta.value = value || '';
        const footer = document.createElement('div');
        footer.style.display = 'flex';
        footer.style.gap = '0.5rem';
        footer.style.justifyContent = 'flex-end';
        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'button-secondary';
        btnCancel.textContent = 'Отмена';
        const btnOk = document.createElement('button');
        btnOk.type = 'button';
        btnOk.className = 'button-basic';
        btnOk.textContent = 'Сохранить';
        footer.append(btnCancel, btnOk);
        const { close } = openKanbanModal({ title: title || 'Описание доски', bodyEl: ta, footerEl: footer });
        btnCancel.addEventListener('click', close);
        btnOk.addEventListener('click', () => {
            onSubmit(ta.value.trim());
            close();
        });
    }

    const KANBAN_TABLE_COLS_DEFAULT = { id: true, name: true, priority: true, dueDate: true, assignee: true };
    const KANBAN_TABLE_COL_LABELS = { id: 'ID', name: 'Название', priority: 'Приоритет', dueDate: 'Срок', assignee: 'Исполнитель' };

    function getKanbanTableColumnVisibility(boardId) {
        const key = `kanbanTableCols_${boardId}`;
        try {
            const s = localStorage.getItem(key);
            if (!s) return { ...KANBAN_TABLE_COLS_DEFAULT };
            return { ...KANBAN_TABLE_COLS_DEFAULT, ...JSON.parse(s) };
        } catch {
            return { ...KANBAN_TABLE_COLS_DEFAULT };
        }
    }

    function setKanbanTableColumnVisibility(boardId, vis) {
        localStorage.setItem(`kanbanTableCols_${boardId}`, JSON.stringify(vis));
    }

    function showKanbanTableColumnsModal(boardId) {
        const vis = getKanbanTableColumnVisibility(boardId);
        const wrap = document.createElement('div');
        wrap.style.gap = '0.75rem';
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        Object.keys(KANBAN_TABLE_COLS_DEFAULT).forEach(key => {
            const label = document.createElement('label');
            label.className = 'column-option checkbox-item';
            label.style.margin = '0';
            label.innerHTML = `
            <input type="checkbox" data-column="${key}" ${vis[key] !== false ? 'checked' : ''}>
            <span class="custom-checkbox"></span>
            <span class="checkbox-text">${escapeHtml(KANBAN_TABLE_COL_LABELS[key])}</span>
        `;
            wrap.appendChild(label);
        });
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'button-secondary';
        resetBtn.textContent = 'Показать все';
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'button-basic';
        applyBtn.textContent = 'Применить';
        footer.append(resetBtn, applyBtn);
        const { close } = openKanbanModal({ title: 'Настройка колонок таблицы', bodyEl: wrap, footerEl: footer });
        resetBtn.addEventListener('click', () => {
            wrap.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = true;
            });
        });
        applyBtn.addEventListener('click', () => {
            const next = { ...KANBAN_TABLE_COLS_DEFAULT };
            wrap.querySelectorAll('input[type="checkbox"][data-column]').forEach(cb => {
                next[cb.dataset.column] = cb.checked;
            });
            setKanbanTableColumnVisibility(boardId, next);
            close();
            renderCurrentView();
        });
    }

    function nextGlobalTaskId() {
        const ids = kanbanTasks.map(t => t.id);
        const arch = kanbanBoards.flatMap(b => (b.archivedTasks || []).map(t => t.id));
        const all = [...ids, ...arch].filter(id => typeof id === 'number');
        return (all.length ? Math.max(...all) : 0) + 1;
    }

    function duplicateKanbanBoard(boardIndex) {
        const board = kanbanBoards[boardIndex];
        if (!board) return;
        const newId = Math.max(...kanbanBoards.map(b => b.id), 0) + 1;
        const newBoard = JSON.parse(JSON.stringify(board));
        newBoard.id = newId;
        newBoard.name = `${board.name || 'Доска'} (копия)`;
        newBoard.archivedTasks = [];
        let nid = nextGlobalTaskId();
        const sourceTasks = kanbanTasks.filter(t => Number(t.boardId) === Number(board.id));
        sourceTasks.forEach(t => {
            const nt = JSON.parse(JSON.stringify(t));
            nt.id = nid++;
            nt.boardId = newId;
            kanbanTasks.push(nt);
        });
        kanbanBoards.splice(boardIndex + 1, 0, newBoard);
        saveKanbanToLocalStorage();
        showToast('Доска скопирована');
        renderCurrentView();
    }

    function createNewKanbanBoard(name) {
        const newId = Math.max(...kanbanBoards.map(b => Number(b.id)), 0) + 1;
        const board = {
            id: newId,
            name: name && name.trim() ? name.trim() : `Доска ${newId}`,
            stages: ['Очередь', 'В работе', 'Готово'],
            archivedTasks: []
        };
        kanbanBoards.push(board);
        saveKanbanToLocalStorage();
        renderCurrentView();
    }

    function moveKanbanStage(boardIndex, stageName, dir) {
        const board = kanbanBoards[boardIndex];
        if (!board) return;
        const i = board.stages.indexOf(stageName);
        if (i === -1) return;
        const j = dir === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= board.stages.length) {
            showToast('Нельзя сдвинуть дальше');
            return;
        }
        const s = board.stages;
        [s[i], s[j]] = [s[j], s[i]];
        saveKanbanToLocalStorage();
        renderCurrentView();
    }

    function clearKanbanStageTasks(boardIndex, stageName) {
        const bid = Number(kanbanBoards[boardIndex]?.id);
        if (!bid) return;
        kanbanTasks.forEach(t => {
            if (Number(t.boardId) === bid && t.stage === stageName) t.stage = 'Очередь';
        });
        saveKanbanToLocalStorage();
        renderCurrentView();
    }

    function saveKanbanToLocalStorage() {
        localStorage.setItem(KANBAN_STORAGE_KEY, JSON.stringify({ boards: kanbanBoards, tasks: kanbanTasks }));
    }

    function ensureBoardsForTasks() {
        const existing = new Set(kanbanBoards.map(b => Number(b.id)));
        const taskBoardIds = Array.from(new Set(kanbanTasks.map(t => Number(t.boardId)).filter(id => !Number.isNaN(id))));
        taskBoardIds.forEach(id => {
            if (existing.has(id)) return;
            const stagesFromTasks = Array.from(
                new Set(kanbanTasks.filter(t => Number(t.boardId) === id).map(t => t.stage).filter(Boolean))
            );
            const stages = stagesFromTasks.length ? stagesFromTasks : ['Очередь', 'В работе', 'Готово'];
            kanbanBoards.push({
                id,
                name: `Доска ${id}`,
                stages,
                archivedTasks: []
            });
            existing.add(id);
        });
    }

    function migrateKanbanData() {
        kanbanTasks.forEach(t => {
            if (t && t.boardId == null) t.boardId = 1;
            if (t && !t.displayId) {
                t.displayId = t.publicId || t.taskCode || String(t.id ?? '');
            }
        });
        kanbanBoards.forEach(b => {
            if (!Array.isArray(b.archivedTasks)) b.archivedTasks = [];
            b.archivedTasks.forEach(t => {
                if (t && !t.displayId) {
                    t.displayId = t.publicId || t.taskCode || String(t.id ?? '');
                }
            });
        });
        ensureBoardsForTasks();
    }

    function loadKanbanFromLocalStorage() {
        const saved = localStorage.getItem(KANBAN_STORAGE_KEY);
        if (!saved) return false;
        try {
            const parsed = JSON.parse(saved);
            kanbanBoards = parsed.boards || [];
            kanbanTasks = parsed.tasks || [];
            migrateKanbanData();
            return true;
        } catch {
            return false;
        }
    }

    function getCollapseMap(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || '{}');
        } catch {
            return {};
        }
    }

    function setCollapsed(key, id, collapsed) {
        const map = getCollapseMap(key);
        map[String(id)] = collapsed;
        localStorage.setItem(key, JSON.stringify(map));
    }

    function isCollapsed(key, id) {
        return getCollapseMap(key)[String(id)] === true;
    }

    async function loadTeamData() {
        try {
            const res = await fetch('/api/team');
            if (!res.ok) throw new Error('Ошибка загрузки команды');
            teamMembers = await res.json();
        } catch {
            teamMembers = [];
        }
    }

    async function loadKanbanData() {
        const res = await fetch('/api/kanban/boards');
        if (!res.ok) throw new Error('Ошибка загрузки kanban boards');
        const data = await res.json();
        kanbanBoards = data.boards || [];
        kanbanTasks = [];
        kanbanBoards.forEach(b => {
            if (!Array.isArray(b.stages) || b.stages.length === 0) b.stages = ['Очередь', 'В работе', 'Готово'];
            if (!Array.isArray(b.archivedTasks)) b.archivedTasks = [];
        });

        const boardSources = kanbanBoards.map(b => b.tasksSource).filter(Boolean);
        const sources = new Set(boardSources.length ? boardSources : ['/api/kanban/tasks']);
        const seenTasks = new Set();
        for (const url of sources) {
            const tRes = await fetch(url);
            if (!tRes.ok) continue;
            const tData = await tRes.json();
            const tasks = tData.tasks || [];
            tasks.forEach(t => {
                const normalized = { ...t, boardId: t.boardId != null ? t.boardId : 1 };
                const dedupeKey = `${normalized.boardId}:${normalized.id}`;
                if (seenTasks.has(dedupeKey)) return;
                seenTasks.add(dedupeKey);
                kanbanTasks.push(normalized);
            });
        }
        migrateKanbanData();
    }

    function getBoardListNavButtons() {
        return document.querySelectorAll('.board-kanban .tabs .tab-btn[data-tab], .board-kanban .tabs-buttons > .button-basic[data-tab]');
    }

    function initViewSwitching() {
        getBoardListNavButtons().forEach(btn => {
            btn.removeEventListener('click', handleTabClick);
            btn.addEventListener('click', handleTabClick);
        });
    }

    function handleTabClick(e) {
        const tab = e.currentTarget.dataset.tab;
        if (tab === 'board') currentView = 'board';
        else if (tab === 'tables') currentView = 'tables';
        else if (tab === 'timeline') currentView = 'timeline';
        else if (tab === 'reports') currentView = 'reports';
        else if (tab === 'archive') currentView = 'archive';
        getBoardListNavButtons().forEach(btn => btn.classList.remove('active'));
        e.currentTarget.classList.add('active');
        renderCurrentView();
    }

    function destroyKanbanBoardsSortable() {
        const c = document.querySelector('#cards-container');
        if (c?.kanbanBoardsSortable) {
            try {
                c.kanbanBoardsSortable.destroy();
            } catch (_) { }
            c.kanbanBoardsSortable = null;
        }
    }

    function initKanbanBoardsSortable() {
        const container = document.querySelector('#cards-container');
        if (!container) return;
        const cards = container.querySelectorAll('[data-draggable-board]');
        if (cards.length < 1) return;
        destroyKanbanBoardsSortable();
        const sortable = new Sortable(container, {
            animation: 150,
            draggable: '[data-draggable-board]',
            handle: '.kanban-board-drag-handle',
            filter: 'input, textarea, button, select, .dropdown-menu, .modal-overlay, .kanban-task-list, .table-rows, .form-add-task',
            preventOnFilter: true,
            forceFallback: true,
            fallbackOnBody: true,
            fallbackTolerance: 0,
            ghostClass: 'dragging',
            chosenClass: 'dragging',
            dragClass: 'drag-over',
            onEnd() {
                const rows = Array.from(container.querySelectorAll('[data-draggable-board]'));
                const newOrder = rows.map(el => Number(el.dataset.boardId));
                if (newOrder.some(id => Number.isNaN(id))) return;
                const ordered = newOrder.map(id => kanbanBoards.find(b => Number(b.id) === id)).filter(Boolean);
                if (ordered.length !== newOrder.length) return;
                kanbanBoards = ordered;
                saveKanbanToLocalStorage();
                renderCurrentView();
            }
        });
        container.kanbanBoardsSortable = sortable;
    }

    function renderCurrentView() {
        destroyKanbanBoardsSortable();
        if (currentView === 'board') renderKanbanBoardView();
        else if (currentView === 'tables') renderKanbanTablesView();
        else if (currentView === 'timeline') renderKanbanTimelineView();
        else if (currentView === 'reports') renderKanbanReportsView();
        else if (currentView === 'archive') renderKanbanArchiveView();
    }

    function findKanbanTask(taskId, boardId) {
        return kanbanTasks.find(t => Number(t.id) === Number(taskId) && Number(t.boardId) === Number(boardId));
    }

    function nextKanbanTaskId(boardId) {
        const ids = kanbanTasks.filter(t => Number(t.boardId) === Number(boardId)).map(t => t.id);
        const b = kanbanBoards.find(x => Number(x.id) === Number(boardId));
        const arch = (b && b.archivedTasks) ? b.archivedTasks.map(t => t.id) : [];
        const all = [...ids, ...arch].filter(id => typeof id === 'number');
        return (all.length ? Math.max(...all) : 0) + 1;
    }

    function createKanbanDropdownMenu(board, boardIndex) {
        const dropdown = document.createElement('div');
        dropdown.className = 'dropdown-menu border-dark-1 br-5';
        dropdown.id = `actionsMenu-kanban-${boardIndex}`;
        dropdown.dataset.boardId = board.id;
        const timelineToggle = `
            <li class="dropdown-item text-basic kanban-timeline-toggle-item" data-action="toggle-timeline-done">
                <span class="kanban-timeline-toggle-label">Скрыть выполненные (таймлайн)</span>
            </li>
        `;
        dropdown.innerHTML = `
        <div class="dropdown-header">
            <p class="text-header">Настройка доски</p>
            <button type="button" class="dropdown-close">
                <img src="/static/source/icons/cross.svg" alt="Закрыть">
            </button>
        </div>
        <ul>
            <li class="dropdown-item text-basic" data-action="create-board">
                <span>Создать доску</span>
            </li>
            <li class="dropdown-item text-basic" data-action="rename">
                <span>Переименовать</span>
            </li>
            <li class="dropdown-item text-basic" data-action="duplicate-board">
                <span>Дублировать доску</span>
            </li>
            <li class="dropdown-item text-basic" data-action="copy-board-link">
                <span>Скопировать ссылку</span>
            </li>
            <li class="dropdown-item text-basic" data-action="add-stage">
                <span>Добавить этап</span>
            </li>
            <li class="dropdown-item text-basic" data-action="table-columns">
                <span>Колонки таблицы</span>
            </li>
            ${timelineToggle}
            <li class="dropdown-item text-basic" data-action="board-export-json">
            <span>Экспорт данных (JSON)</span>
        </li>
            <li class="dropdown-item text-basic pink" data-action="archive-board">
                <span>Архивировать доску</span>
            </li>
            <li class="dropdown-item text-basic pink" data-action="reset-stages">
                <span>Сбросить этапы</span>
            </li>
        </ul>
    `;
        return dropdown;
    }

    function createKanbanStageDropdown(boardIndex, stageName) {
        const dropdown = document.createElement('div');
        dropdown.className = 'dropdown-menu border-dark-1 br-5 kanban-stage-dropdown';
        dropdown.dataset.boardIndex = boardIndex;
        dropdown.dataset.stageName = stageName;
        dropdown.innerHTML = `
        <div class="dropdown-header">
            <p class="text-header">Этап</p>
            <button type="button" class="dropdown-close">
                <img src="/static/source/icons/cross.svg" alt="Закрыть">
            </button>
        </div>
        <ul>
            <li class="dropdown-item text-basic" data-action="rename-stage">
                <span>Переименовать этап</span>
            </li>
            <li class="dropdown-item text-basic" data-action="stage-move-up">
                <span>Поднять выше</span>
            </li>
            <li class="dropdown-item text-basic" data-action="stage-move-down">
                <span>Опустить ниже</span>
            </li>
            <li class="dropdown-item text-basic" data-action="stage-collapse-toggle">
                <span>Свернуть колонку (скоро)</span>
            </li>
            <li class="dropdown-item text-basic" data-action="clear-stage">
                <span>Очистить колонку</span>
            </li>
            <li class="dropdown-item text-basic pink" data-action="delete-stage">
                <span>Удалить этап</span>
            </li>
        </ul>
    `;
        return dropdown;
    }

    function createKanbanCardHeader(board, boardIndex, opts = {}) {
        const showBoardDrag = opts.boardDrag !== false;
        const header = document.createElement('div');
        header.className = 'tasks-header flex-row-between';

        const left = document.createElement('div');
        left.className = 'board-header-left';

        const collapsed = isCollapsed(KANBAN_COLLAPSE_KEY, board.id);
        const collapseToggle = document.createElement('button');
        collapseToggle.type = 'button';
        collapseToggle.className = 'archive-collapse-toggle board-section-collapse-toggle';
        if (!collapsed) collapseToggle.classList.add('open');
        collapseToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        const arrow = document.createElement('span');
        arrow.className = 'archive-collapse-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        collapseToggle.appendChild(arrow);

        const title = document.createElement('p');
        title.className = 'text-header';
        title.textContent = board.name;

        left.appendChild(collapseToggle);
        if (showBoardDrag) {
            const dragHandle = document.createElement('div');
            dragHandle.className = 'kanban-board-drag-handle';
            dragHandle.title = 'Перетащить доску';
            dragHandle.style.cursor = 'grab';
            dragHandle.appendChild(title);
            left.appendChild(dragHandle);
        } else {
            left.appendChild(title);
        }
        header.appendChild(left);

        const right = document.createElement('div');
        right.className = 'info';
        right.style.position = 'relative';
        right.innerHTML = `
        <ul class="gap-24 flex-row">
            <li class="kanban-add-stage" data-board-index="${boardIndex}">
                <img class="h-32" src="/static/source/icons/plus.svg" alt="Добавить этап">
            </li>
            <li class="more-actions" data-board-index="${boardIndex}">
                <img class="h-32" src="/static/source/icons/info.svg" alt="Действия">
            </li>
        </ul>
    `;
        header.appendChild(right);

        const dropdown = createKanbanDropdownMenu(board, boardIndex);
        header.appendChild(dropdown);

        const bodyToggle = bodyEl => {
            bodyEl.style.display = collapsed ? 'none' : '';
            collapseToggle.addEventListener('click', e => {
                e.stopPropagation();
                const isOpen = collapseToggle.classList.toggle('open');
                collapseToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                bodyEl.style.display = isOpen ? '' : 'none';
                setCollapsed(KANBAN_COLLAPSE_KEY, board.id, !isOpen);
            });
        };

        header._attachCollapse = bodyToggle;
        return header;
    }

    function appendStageSeparator(container) {
        const line = document.createElement('div');
        line.className = 'kanban-stage-sep-line';
        line.setAttribute('aria-hidden', 'true');
        container.appendChild(line);
    }

    function createKanbanStageGroup({ stageName, childEl, withSeparator }) {
        const group = document.createElement('div');
        group.className = 'kanban-stage-group';
        group.dataset.stageName = stageName;
        group.appendChild(childEl);
        if (withSeparator) appendStageSeparator(group);
        return group;
    }

    function createColumnHeadContent(board, boardIndex, stageName, count) {
        const wrap = document.createElement('div');
        wrap.className = 'kanban-column-head-inner';

        const titles = document.createElement('div');
        titles.className = 'kanban-column-head-titles';
        titles.innerHTML = `
        <span class="text-basic">${escapeHtml(stageName)}</span>
        <span class="kanban-count-badge">${count}</span>
    `;

        const info = document.createElement('div');
        info.className = 'info';
        info.style.position = 'relative';
        info.innerHTML = `
        <ul class="gap-24 flex-row">
            <li class="kanban-stage-more-actions" data-board-index="${boardIndex}" data-stage-name="${escapeHtml(stageName)}">
                <img src="/static/source/icons/info.svg" alt="Действия этапа">
            </li>
        </ul>
    `;
        const dd = createKanbanStageDropdown(boardIndex, stageName);
        info.appendChild(dd);
        wrap.appendChild(titles);
        wrap.appendChild(info);
        return wrap;
    }

    function createColumnsHeader(board, boardIndex, tasksForBoard) {
        const row = document.createElement('div');
        row.className = 'kanban-columns-head';
        board.stages.forEach((stage, idx) => {
            const el = document.createElement('div');
            el.className = 'kanban-column-head';
            const count = tasksForBoard.filter(t => t.stage === stage).length;
            el.appendChild(createColumnHeadContent(board, boardIndex, stage, count));
            row.appendChild(
                createKanbanStageGroup({
                    stageName: stage,
                    childEl: el,
                    withSeparator: idx !== board.stages.length - 1
                })
            );
        });
        return row;
    }

    function createKanbanQueueTaskForm(boardId, boardIndex, priorityKey) {
        const form = document.createElement('form');
        form.className = 'form-add-task';
        form.dataset.boardId = boardId;
        form.dataset.boardIndex = boardIndex;
        form.dataset.priorityKey = priorityKey;
        form.style.position = 'relative';

        form.innerHTML = `
        <input type="text" placeholder="Создайте краткое описание задачи">
        <div class="tag" style="display: none;">
            <div class="assignee-wrapper" style="display: flex; align-items: center; gap: 0.25rem;">
                <img src="/static/source/icons/profile_select.svg" alt="Исполнитель" class="assignee-icon" style="cursor: pointer;">
                <span class="assignee-name text-signature"></span>
            </div>
            <div class="calendar-trigger" style="display: inline-flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                <img src="/static/source/icons/calendar.svg" alt="Срок" class="calendar-icon">
                <span class="calendar-value text-signature"></span>
            </div>
            <button type="button" class="button-small">Создать</button>
        </div>
    `;

        const input = form.querySelector('input');
        const tagDiv = form.querySelector('.tag');
        const assigneeIcon = form.querySelector('.assignee-icon');
        const assigneeNameSpan = form.querySelector('.assignee-name');
        const calendarTrigger = form.querySelector('.calendar-trigger');
        const calendarIcon = calendarTrigger.querySelector('.calendar-icon');
        const calendarValueSpan = calendarTrigger.querySelector('.calendar-value');
        const createBtn = form.querySelector('button');

        let selectedAssignee = null;
        let selectedDueDate = null;

        function formatDate(dateStr) {
            if (!dateStr) return '';
            const [year, month, day] = dateStr.split('-');
            const currentYear = new Date().getFullYear();
            if (parseInt(year) === currentYear) return `${day}.${month}`;
            return `${day}.${month}.${year}`;
        }

        function formatDateRange(start, end) {
            if (start && end && start !== end) return `${formatDate(start)} - ${formatDate(end)}`;
            if (end) return `до ${formatDate(end)}`;
            if (start) return `с ${formatDate(start)}`;
            return '';
        }

        function updateCalendarDisplay() {
            if (selectedDueDate) {
                if (typeof selectedDueDate === 'string') {
                    calendarValueSpan.textContent = formatDateRange(null, selectedDueDate);
                    calendarIcon.style.display = 'none';
                } else if (selectedDueDate.start && selectedDueDate.end) {
                    calendarValueSpan.textContent = formatDateRange(selectedDueDate.start, selectedDueDate.end);
                    calendarIcon.style.display = 'none';
                } else if (selectedDueDate.end) {
                    calendarValueSpan.textContent = formatDateRange(null, selectedDueDate.end);
                    calendarIcon.style.display = 'none';
                }
            } else {
                calendarValueSpan.textContent = '';
                calendarIcon.style.display = 'inline';
            }
        }

        let currentYear = new Date().getFullYear();
        let currentMonth = new Date().getMonth();
        let selectionStart = null;
        let selectionEnd = null;

        function buildMonthCalendar(container, year, month, isFirstMonth) {
            const date = new Date(year, month, 1);
            const firstDay = date.getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const prevMonthDays = new Date(year, month, 0).getDate();
            const startOffset = firstDay === 0 ? 6 : firstDay - 1;
            const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
            let html = `
            <div class="custom-calendar-month">
                <div class="month-header">
                    <button class="change-month" data-month="${month}" data-year="${year}" data-dir="${isFirstMonth ? 'prev' : 'next'}">
                        ${monthNames[month]} ${year}
                    </button>
                </div>
                <div class="weekdays">
                    <div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Вс</div>
                </div>
                <div class="days">
        `;
            for (let i = 0; i < startOffset; i++) {
                const prevDate = prevMonthDays - startOffset + i + 1;
                const prevYear = month === 0 ? year - 1 : year;
                const prevMonth = month === 0 ? 11 : month - 1;
                const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(prevDate).padStart(2, '0')}`;
                html += `<div class="other-month" data-date="${dateStr}">${prevDate}</div>`;
            }
            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                let classes = 'day';
                if (selectionStart === dateStr) classes += ' selected-start';
                if (selectionEnd === dateStr) classes += ' selected-end';
                if (selectionStart && selectionEnd && dateStr > selectionStart && dateStr < selectionEnd) classes += ' in-range';
                html += `<div class="${classes}" data-date="${dateStr}">${d}</div>`;
            }
            const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
            const remaining = totalCells - (startOffset + daysInMonth);
            for (let i = 1; i <= remaining; i++) {
                const nextYear = month === 11 ? year + 1 : year;
                const nextMonth = month === 11 ? 0 : month + 1;
                const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                html += `<div class="other-month" data-date="${dateStr}">${i}</div>`;
            }
            html += `</div></div>`;
            container.innerHTML = html;
            container.querySelectorAll('.day').forEach(dayEl => {
                dayEl.addEventListener('click', e => {
                    e.stopPropagation();
                    const dateStr = dayEl.dataset.date;
                    if (!selectionStart || (selectionStart && selectionEnd)) {
                        selectionStart = dateStr;
                        selectionEnd = null;
                    } else if (dateStr < selectionStart) {
                        selectionEnd = selectionStart;
                        selectionStart = dateStr;
                    } else {
                        selectionEnd = dateStr;
                    }
                    renderBothMonths();
                    if (selectionEnd) selectedDueDate = { start: selectionStart, end: selectionEnd };
                    else if (selectionStart) selectedDueDate = selectionStart;
                    else selectedDueDate = null;
                    updateCalendarDisplay();
                });
            });
            const monthBtn = container.querySelector('.change-month');
            if (monthBtn) {
                monthBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    const dir = monthBtn.dataset.dir;
                    if (dir === 'prev') {
                        if (currentMonth === 0) {
                            currentMonth = 11;
                            currentYear--;
                        } else currentMonth--;
                    } else if (currentMonth === 11) {
                        currentMonth = 0;
                        currentYear++;
                    } else currentMonth++;
                    renderBothMonths();
                });
            }
        }

        function renderBothMonths() {
            const monthsContainer = document.querySelector('.custom-calendar-months');
            if (!monthsContainer) return;
            monthsContainer.innerHTML = '';
            const firstMonth = document.createElement('div');
            buildMonthCalendar(firstMonth, currentYear, currentMonth, true);
            monthsContainer.appendChild(firstMonth);
            let secondYear = currentYear;
            let secondMonth = currentMonth + 1;
            if (secondMonth === 12) {
                secondMonth = 0;
                secondYear++;
            }
            const secondMonthDiv = document.createElement('div');
            buildMonthCalendar(secondMonthDiv, secondYear, secondMonth, false);
            monthsContainer.appendChild(secondMonthDiv);
        }

        function openCustomCalendar() {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay custom-calendar-modal';
            const calendarWrapper = document.createElement('div');
            calendarWrapper.className = 'custom-calendar';
            calendarWrapper.innerHTML = `
            <div class="custom-calendar-header">
                <button class="prev-both">←</button>
                <div class="custom-calendar-title">Выберите диапазон дат</div>
                <button class="next-both">→</button>
            </div>
            <div class="custom-calendar-months"></div>
            <div class="custom-calendar-footer">
                <button class="button-secondary reset-dates">Сбросить</button>
                <button class="button-basic apply-dates">Применить</button>
            </div>
        `;
            modal.appendChild(calendarWrapper);
            document.body.appendChild(modal);
            modal.classList.add('show');
            if (selectedDueDate) {
                if (typeof selectedDueDate === 'string') {
                    selectionEnd = selectedDueDate;
                    selectionStart = null;
                } else {
                    selectionStart = selectedDueDate.start;
                    selectionEnd = selectedDueDate.end;
                }
            } else {
                selectionStart = null;
                selectionEnd = null;
            }
            if (selectionEnd) {
                const endDate = new Date(selectionEnd);
                currentYear = endDate.getFullYear();
                currentMonth = endDate.getMonth();
            } else {
                const now = new Date();
                currentYear = now.getFullYear();
                currentMonth = now.getMonth();
            }
            renderBothMonths();
            calendarWrapper.querySelector('.prev-both').addEventListener('click', () => {
                if (currentMonth === 0) {
                    currentMonth = 11;
                    currentYear--;
                } else currentMonth--;
                renderBothMonths();
            });
            calendarWrapper.querySelector('.next-both').addEventListener('click', () => {
                if (currentMonth === 11) {
                    currentMonth = 0;
                    currentYear++;
                } else currentMonth++;
                renderBothMonths();
            });
            calendarWrapper.querySelector('.reset-dates').addEventListener('click', () => {
                selectionStart = null;
                selectionEnd = null;
                selectedDueDate = null;
                renderBothMonths();
                updateCalendarDisplay();
            });
            calendarWrapper.querySelector('.apply-dates').addEventListener('click', () => {
                if (selectionStart && selectionEnd) selectedDueDate = { start: selectionStart, end: selectionEnd };
                else if (selectionEnd) selectedDueDate = selectionEnd;
                else if (selectionStart) selectedDueDate = selectionStart;
                else selectedDueDate = null;
                updateCalendarDisplay();
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 200);
            });
            modal.addEventListener('click', ev => {
                if (ev.target === modal) {
                    modal.classList.remove('show');
                    setTimeout(() => modal.remove(), 200);
                }
            });
        }

        calendarTrigger.addEventListener('click', e => {
            e.stopPropagation();
            openCustomCalendar();
        });

        function openAssigneeModal() {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
            <div class="modal-content" style="width: 28vw; height: auto; max-height: 70vh;">
                <div class="modal-header">
                    <p class="text-header">Выберите исполнителя</p>
                    <button class="modal-close">
                        <img src="/static/source/icons/cross.svg" alt="Закрыть">
                    </button>
                </div>
                <div class="modal-body" style="gap: 0.75rem;">
                    ${teamMembers.map(member => `
                        <div class="user-img-text assignee-option" data-name="${member.name}" data-avatar="${member.avatar}" style="cursor: pointer;">
                            <img src="/static/source/user_img/${member.avatar}" alt="">
                            <div class="basic-and-signature">
                                <p class="text-basic">${escapeHtml(member.name)}</p>
                                <p class="text-signature">${escapeHtml(member.role)}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="modal-footer">
                    <button class="button-secondary modal-cancel">Отмена</button>
                </div>
            </div>
        `;
            document.body.appendChild(modal);
            modal.classList.add('show');
            const closeModal = () => {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 200);
            };
            modal.querySelector('.modal-close').addEventListener('click', closeModal);
            modal.querySelector('.modal-cancel').addEventListener('click', closeModal);
            modal.addEventListener('click', ev => {
                if (ev.target === modal) closeModal();
            });
            modal.querySelectorAll('.assignee-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    selectedAssignee = { name: opt.dataset.name, avatar: opt.dataset.avatar };
                    assigneeIcon.src = `/static/source/user_img/${opt.dataset.avatar}`;
                    assigneeIcon.style.borderRadius = '50%';
                    assigneeNameSpan.textContent = opt.dataset.name;
                    closeModal();
                });
            });
        }

        assigneeIcon.addEventListener('click', e => {
            e.preventDefault();
            if (teamMembers.length) openAssigneeModal();
            else showToast('Список команды не загружен');
        });

        function showTag() {
            tagDiv.style.display = 'flex';
        }

        function hideTagAndReset() {
            tagDiv.style.display = 'none';
            input.value = '';
            selectedAssignee = null;
            selectedDueDate = null;
            assigneeIcon.src = '/static/source/icons/profile_select.svg';
            assigneeIcon.style.borderRadius = '0';
            assigneeNameSpan.textContent = '';
            calendarValueSpan.textContent = '';
            calendarIcon.style.display = 'inline';
        }

        input.addEventListener('focus', showTag);
        form.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            showTag();
            if (document.activeElement !== input) input.focus();
        });
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                createBtn.click();
            }
        });

        createBtn.addEventListener('click', e => {
            e.preventDefault();
            const taskName = input.value.trim();
            if (!taskName) {
                showToast('Введите название задачи');
                return;
            }
            const board = kanbanBoards[boardIndex];
            if (!board) return;
            const pr = priorityKey === 'urgent' ? 'срочно' : 'обычный';
            let dueDate = null;
            if (selectedDueDate) {
                if (typeof selectedDueDate === 'string') dueDate = selectedDueDate;
                else if (selectedDueDate.end) dueDate = selectedDueDate.end;
            }
            const newTask = {
                id: nextKanbanTaskId(board.id),
                boardId: board.id,
                name: taskName,
                priority: pr,
                stage: 'Очередь',
                dueDate,
                assignee: selectedAssignee ? selectedAssignee.name : null,
                assigneeAvatar: selectedAssignee ? selectedAssignee.avatar : null,
                subtasks: []
            };
            kanbanTasks.push(newTask);
            saveKanbanToLocalStorage();
            renderCurrentView();
            showToast(`Задача «${taskName}» добавлена в очередь`);
            hideTagAndReset();
        });

        document.addEventListener('click', e => {
            if (e.target.closest('.modal-overlay')) return;
            if (!form.contains(e.target) && tagDiv.style.display === 'flex') hideTagAndReset();
        });

        hideTagAndReset();
        return form;
    }

    function subtasksReadOnly(stage) {
        return stage === 'Готово';
    }

    function createSubtasksBlockKanban(task, stage) {
        const subtasksBlock = document.createElement('div');
        subtasksBlock.className = 'subtasks text-signature';
        const completedCount = task.subtasks.filter(st => st.completed).length;
        const totalCount = task.subtasks.length;
        const percent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
        subtasksBlock.innerHTML = `
        <div class="count">
            <p class="name" style="cursor: pointer;">Подзадачи</p>
            <p>${completedCount} / ${totalCount}</p>
        </div>
        <div class="progress-line">
            <div class="completed" style="width: ${percent}%;"></div>
            <div class="todo" style="width: ${100 - percent}%;"></div>
        </div>
    `;
        const subtasksList = document.createElement('div');
        subtasksList.className = 'subtasks-list';
        subtasksList.style.display = 'none';
        const ro = subtasksReadOnly(stage);
        task.subtasks.forEach(subtask => {
            const subtaskItem = document.createElement('div');
            subtaskItem.className = 'subtask-item';
            subtaskItem.innerHTML = `
            <label class="checkbox-item">
                <input type="checkbox" ${subtask.completed ? 'checked' : ''} ${ro ? 'disabled' : ''}>
                <span class="custom-checkbox"></span>
                <span class="checkbox-text">${escapeHtml(subtask.name)}</span>
            </label>
        `;
            if (!ro) {
                const cb = subtaskItem.querySelector('input');
                cb.addEventListener('change', e => {
                    e.stopPropagation();
                    subtask.completed = cb.checked;
                    saveKanbanToLocalStorage();
                    renderCurrentView();
                });
            }
            subtasksList.appendChild(subtaskItem);
        });
        subtasksBlock.appendChild(subtasksList);
        const nameElement = subtasksBlock.querySelector('.name');
        nameElement.addEventListener('click', () => {
            const isOpen = subtasksList.style.display === 'flex';
            subtasksList.style.display = isOpen ? 'none' : 'flex';
            nameElement.classList.toggle('open', !isOpen);
        });
        return subtasksBlock;
    }

    function createTagBlock(task) {
        const hasAssignee = task.assignee && String(task.assignee).trim();
        const hasDueDate = task.dueDate && String(task.dueDate).trim();
        if (!hasAssignee && !hasDueDate) return null;
        const tagBlock = document.createElement('div');
        tagBlock.className = 'tag';
        if (hasAssignee) {
            let avatar = task.assigneeAvatar || '';
            if (!avatar) {
                const m = teamMembers.find(x => x.name === task.assignee);
                if (m) avatar = m.avatar;
            }
            const executor = document.createElement('div');
            executor.className = 'executor';
            executor.innerHTML = `<img src="/static/source/user_img/${escapeHtml(avatar || 'basic_avatar.png')}" alt="${escapeHtml(task.assignee)}">`;
            tagBlock.appendChild(executor);
        }
        if (hasDueDate) {
            const deadlineDiv = document.createElement('div');
            deadlineDiv.className = 'deadline';
            deadlineDiv.textContent = formatDueDate(task.dueDate);
            tagBlock.appendChild(deadlineDiv);
        }
        return tagBlock;
    }

    function createKanbanTaskItem(task) {
        const item = document.createElement('div');
        item.className = 'item kanban-task-item';
        item.dataset.taskId = task.id;
        item.dataset.boardId = task.boardId;

        const nameSpan = document.createElement('span');
        nameSpan.className = `${task.stage === 'Готово' ? 'text-basic-line-through' : 'text-basic'} kanban-task-title`;
        nameSpan.textContent = task.name;
        nameSpan.style.cursor = 'pointer';
        nameSpan.addEventListener('click', e => {
            e.stopPropagation();
            if (task.name === 'Обновить документацию API Gateway' && typeof window.tpOpenTaskDetailModal === 'function') {
                window.tpOpenTaskDetailModal(task);
            }
        });
        item.appendChild(nameSpan);

        if (task.subtasks && task.subtasks.length > 0) {
            item.appendChild(createSubtasksBlockKanban(task, task.stage));
        }
        const tag = createTagBlock(task);
        if (tag) item.appendChild(tag);

        return item;
    }

    function createKanbanTableNameCell(task, row) {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '8px';

        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.alignItems = 'center';
        topRow.style.gap = '8px';
        topRow.style.flexWrap = 'wrap';

        const nameSpan = document.createElement('span');
        nameSpan.className = `${task.stage === 'Готово' ? 'text-basic-line-through' : 'text-basic'} kanban-task-title`;
        nameSpan.textContent = task.name;
        nameSpan.style.cursor = 'pointer';
        nameSpan.addEventListener('click', e => {
            e.stopPropagation();
            if (task.name === 'Обновить документацию API Gateway' && typeof window.tpOpenTaskDetailModal === 'function') {
                window.tpOpenTaskDetailModal(task);
            }
        });
        topRow.appendChild(nameSpan);

        let subtasksList = null;
        let trigger = null;
        const ro = subtasksReadOnly(task.stage);
        if (task.subtasks && task.subtasks.length > 0) {
            const totalCount = task.subtasks.length;
            const completedCount = task.subtasks.filter(st => st.completed).length;
            trigger = document.createElement('span');
            trigger.className = 'name';
            trigger.textContent = `${completedCount} / ${totalCount}`;
            trigger.style.cursor = 'pointer';
            trigger.style.display = 'inline-flex';
            trigger.style.alignItems = 'center';
            trigger.style.gap = '0.25rem';
            topRow.appendChild(trigger);
            subtasksList = document.createElement('div');
            subtasksList.className = 'subtasks-list';
            subtasksList.style.display = 'none';
            task.subtasks.forEach(subtask => {
                const subtaskItem = document.createElement('div');
                subtaskItem.className = 'subtask-item';
                subtaskItem.innerHTML = `
                <label class="checkbox-item">
                    <input type="checkbox" ${subtask.completed ? 'checked' : ''} ${ro ? 'disabled' : ''}>
                    <span class="custom-checkbox"></span>
                    <span class="checkbox-text">${escapeHtml(subtask.name)}</span>
                </label>
            `;
                if (!ro) {
                    const cb = subtaskItem.querySelector('input');
                    cb.addEventListener('change', () => {
                        subtask.completed = cb.checked;
                        saveKanbanToLocalStorage();
                        renderCurrentView();
                    });
                }
                subtasksList.appendChild(subtaskItem);
            });
            trigger.addEventListener('click', () => {
                const isOpen = subtasksList.style.display === 'flex';
                subtasksList.style.display = isOpen ? 'none' : 'flex';
                trigger.classList.toggle('open', !isOpen);
                if (!isOpen) row.classList.add('subtasks-open');
                else row.classList.remove('subtasks-open');
            });
        }
        container.appendChild(topRow);
        if (subtasksList) container.appendChild(subtasksList);
        return container;
    }

    function createPrioritySection(board, priorityLabel, priorityKey, tasks, boardIndex) {
        const section = document.createElement('div');
        section.className = `kanban-priority-section ${priorityKey === 'urgent' ? 'urgent' : 'normal'}`;
        const collapsed = isCollapsed(KANBAN_SECTION_COLLAPSE_KEY, `${board.id}:${priorityKey}`);

        const head = document.createElement('div');
        head.className = 'kanban-priority-head';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.classList.add('kanban-priority-toggle', priorityKey === 'urgent' ? 'kanban-priority-toggle--urgent' : 'kanban-priority-toggle--normal');
        if (!collapsed) toggle.classList.add('open');
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

        const arrow = document.createElement('span');
        arrow.className = 'kanban-priority-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'text-basic';
        label.textContent = priorityLabel;
        const badge = document.createElement('span');
        badge.className = 'kanban-count-chip';
        badge.textContent = String(tasks.length);

        toggle.append(arrow, label, badge);
        head.appendChild(toggle);
        section.appendChild(head);

        const body = document.createElement('div');
        body.className = 'kanban-priority-body';
        body.style.display = collapsed ? 'none' : '';

        const stagesRow = document.createElement('div');
        stagesRow.className = 'kanban-stages-row';

        board.stages.forEach((stage, idx) => {
            const col = document.createElement('div');
            col.className = 'kanban-stage-col';

            const list = document.createElement('div');
            list.className = 'kanban-task-list';
            list.dataset.boardId = board.id;
            list.dataset.boardIndex = boardIndex;
            list.dataset.priorityKey = priorityKey;
            list.dataset.stage = stage;

            const stageTasks = tasks.filter(t => t.stage === stage);
            const sortedStageTasks = [...stageTasks].sort((a, b) => {
                const ad = a.dueDate ? parseDateBoard(a.dueDate).getTime() : 9999999999999;
                const bd = b.dueDate ? parseDateBoard(b.dueDate).getTime() : 9999999999999;
                if (ad !== bd) return ad - bd;
                return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
            });
            sortedStageTasks.forEach(t => list.appendChild(createKanbanTaskItem(t)));

            if (stage === 'Очередь') {
                list.appendChild(createKanbanQueueTaskForm(board.id, boardIndex, priorityKey));
            }

            col.appendChild(list);
            stagesRow.appendChild(
                createKanbanStageGroup({
                    stageName: stage,
                    childEl: col,
                    withSeparator: idx !== board.stages.length - 1
                })
            );
        });

        body.appendChild(stagesRow);
        section.appendChild(body);

        toggle.addEventListener('click', () => {
            const isOpen = toggle.classList.toggle('open');
            toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            body.style.display = isOpen ? '' : 'none';
            setCollapsed(KANBAN_SECTION_COLLAPSE_KEY, `${board.id}:${priorityKey}`, !isOpen);
        });

        return section;
    }

    function initKanbanDnD(container) {
        if (!container) return;
        if (container.sortable) {
            container.sortable.destroy();
            delete container.sortable;
        }
        const cardsContainer = document.querySelector('#cards-container');
        const sortable = new Sortable(container, {
            animation: 150,
            group: { name: 'kanban-tasks', pull: true, put: true },
            draggable: '.item',
            filter: '.form-add-task, .kanban-task-title',
            preventOnFilter: false,
            forceFallback: true,
            fallbackOnBody: true,
            fallbackTolerance: 3,
            ghostClass: 'task-dragging',
            dragClass: 'task-drag-over',
            onStart() {
                if (cardsContainer) cardsContainer.classList.add('dragging-active');
            },
            onEnd(evt) {
                if (cardsContainer) cardsContainer.classList.remove('dragging-active');
                const toList = evt.to;
                const fromList = evt.from;
                const taskId = Number(evt.item?.dataset?.taskId);
                const boardId = Number(toList.dataset.boardId);
                if (!taskId) return;

                const task = findKanbanTask(taskId, boardId);
                if (!task) return;

                const toStage = toList.dataset.stage;
                const toPriorityKey = toList.dataset.priorityKey;
                const fromStage = fromList.dataset.stage;

                task.stage = toStage;
                task.priority = toPriorityKey === 'urgent' ? 'срочно' : 'обычный';

                const movedToDone = toStage === 'Готово' && fromStage !== 'Готово';
                const movedFromDone = fromStage === 'Готово' && toStage !== 'Готово';
                if (task.subtasks && task.subtasks.length) {
                    if (movedToDone) task.subtasks = task.subtasks.map(st => ({ ...st, completed: true }));
                    if (movedFromDone) task.subtasks = task.subtasks.map(st => ({ ...st, completed: false }));
                }

                saveKanbanToLocalStorage();
                renderCurrentView();
            },
            onCancel() {
                if (cardsContainer) cardsContainer.classList.remove('dragging-active');
            }
        });
        container.sortable = sortable;
    }

    function initKanbanTableRowsSortable() {
        const containers = document.querySelectorAll('#cards-container .kanban-stage-table .table-rows');
        const cardsContainer = document.querySelector('#cards-container');
        const TABLE_ROW_FALLBACK_CLASS = 'tp-table-row-fallback';
        const buildFallbackRowInnerHtml = (row) => row?.innerHTML || '';
        const applyTableRowComputedStylesToClone = (row, clone, { isFallback = false } = {}) => {
            if (!row || !clone) return;
            clone.classList.add('board-list');
            const table = row.closest('.tasks-grid');
            const gridCols = table ? getComputedStyle(table).gridTemplateColumns : '';
            if (!isFallback) {
                clone.style.setProperty('display', 'grid', 'important');
                if (gridCols) clone.style.setProperty('grid-template-columns', gridCols, 'important');
            } else {
                clone.style.setProperty('display', 'grid');
                clone.style.setProperty('grid-template-columns', 'auto auto 1fr auto auto auto');
                clone.style.setProperty('gap', '0.75rem');
                clone.style.setProperty('padding', '0');
                clone.style.setProperty('border', 'none');
                clone.style.setProperty('background', 'transparent');
            }
            const rect = row.getBoundingClientRect();
            clone.style.width = `${rect.width}px`;
            clone.style.boxSizing = 'border-box';
            clone.style.opacity = '1';
            clone.style.visibility = 'visible';
            clone.style.zIndex = '3000';

            const copyAllComputed = (fromEl, toEl) => {
                const s = getComputedStyle(fromEl);
                const skip = isFallback ? new Set([
                    'position', 'top', 'right', 'bottom', 'left',
                    'inset', 'inset-block', 'inset-inline',
                    'transform', 'translate', 'rotate', 'scale',
                    'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
                    'animation', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count',
                    'will-change',
                ]) : null;
                for (let i = 0; i < s.length; i++) {
                    const prop = s[i];
                    if (skip && skip.has(prop)) continue;
                    const val = s.getPropertyValue(prop);
                    if (val) toEl.style.setProperty(prop, val, 'important');
                }
            };
            const fromNodes = [];
            const toNodes = [];
            const walk = (root, acc) => {
                const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
                let n = w.currentNode;
                while (n) {
                    acc.push(n);
                    n = w.nextNode();
                }
            };
            const toRoot = isFallback ? (clone.querySelector('.grid-row') || clone) : clone;
            walk(row, fromNodes);
            walk(toRoot, toNodes);
            const n = Math.min(fromNodes.length, toNodes.length);
            for (let i = 0; i < n; i++) copyAllComputed(fromNodes[i], toNodes[i]);
        };
        const freezeFallbackStyles = (container, row) => {
            if (container._kanbanTableRowStyleRaf) cancelAnimationFrame(container._kanbanTableRowStyleRaf);
            container._kanbanTableRowStyleRaf = null;

            let tries = 0;
            const startWhenReady = () => {
                const fallback = container._kanbanTableRowDragEl || document.querySelector(`.${TABLE_ROW_FALLBACK_CLASS}`);
                if (!fallback) {
                    tries += 1;
                    if (tries < 20) setTimeout(startWhenReady, 16);
                    return;
                }

                const tick = () => {
                    const fb = container._kanbanTableRowDragEl || document.querySelector(`.${TABLE_ROW_FALLBACK_CLASS}`);
                    if (!fb) return;
                    if (container._kanbanTableRowCtxHtml && fb.innerHTML !== container._kanbanTableRowCtxHtml) {
                        fb.innerHTML = container._kanbanTableRowCtxHtml;
                    }
                    applyTableRowComputedStylesToClone(row, fb, { isFallback: true });
                    fb.style.setProperty('margin', '0', 'important');
                    fb.style.setProperty('margin-top', '0', 'important');
                    fb.style.setProperty('margin-right', '0', 'important');
                    fb.style.setProperty('margin-bottom', '0', 'important');
                    fb.style.setProperty('margin-left', '0', 'important');
                    container._kanbanTableRowStyleRaf = requestAnimationFrame(tick);
                };
                container._kanbanTableRowStyleRaf = requestAnimationFrame(tick);
            };

            setTimeout(startWhenReady, 0);
        };
        containers.forEach(container => {
            const wrap = container.closest('.kanban-stage-table');
            const boardId = Number(wrap?.dataset?.boardId);
            const stage = wrap?.dataset?.stage;
            if (container.sortable) container.sortable.destroy();
            const sortable = new Sortable(container, {
                animation: 0,
                group: { name: 'kanban-table-rows', pull: true, put: true },
                handle: '.grid-row',
                draggable: '.grid-row',
                forceFallback: true,
                fallbackOnBody: true,
                fallbackTolerance: 0,
                fallbackClass: TABLE_ROW_FALLBACK_CLASS,
                ghostClass: '',
                dragClass: '',
                onClone(evt) {
                    container._kanbanTableRowDragEl = evt.clone;
                    evt.clone?.classList?.add(TABLE_ROW_FALLBACK_CLASS);
                    container._kanbanTableRowCtxHtml = buildFallbackRowInnerHtml(evt.item);
                    evt.clone.innerHTML = container._kanbanTableRowCtxHtml;
                    evt.clone.style.setProperty('background', 'transparent');
                    evt.clone.style.setProperty('border', 'none');
                    evt.clone.style.setProperty('padding', '0');
                    evt.clone.style.setProperty('display', 'grid');
                    evt.clone.style.setProperty('box-sizing', 'border-box');
                    evt.clone.style.setProperty('pointer-events', 'none');
                    applyTableRowComputedStylesToClone(evt.item, evt.clone, { isFallback: true });
                },
                onStart(evt) {
                    if (cardsContainer) cardsContainer.classList.add('dragging-active');
                    freezeFallbackStyles(container, evt.item);
                },
                onEnd(evt) {
                    if (cardsContainer) cardsContainer.classList.remove('dragging-active');
                    if (container._kanbanTableRowStyleRaf) cancelAnimationFrame(container._kanbanTableRowStyleRaf);
                    container._kanbanTableRowStyleRaf = null;
                    container._kanbanTableRowDragEl = null;
                    container._kanbanTableRowCtxHtml = null;
                    const toC = evt.to;
                    const fromC = evt.from;
                    const toWrap = toC.closest('.kanban-stage-table');
                    const fromWrap = fromC.closest('.kanban-stage-table');
                    const toStage = toWrap?.dataset?.stage;
                    const fromStage = fromWrap?.dataset?.stage;
                    const toBid = Number(toWrap?.dataset?.boardId);
                    const fromBid = Number(fromWrap?.dataset?.boardId);
                    const row = evt.item;
                    const taskId = Number(row.dataset.taskId);
                    if (!taskId || !toStage) return;
                    const task = kanbanTasks.find(t => Number(t.id) === taskId && Number(t.boardId) === fromBid);
                    if (!task) return;
                    task.stage = toStage;
                    task.boardId = toBid;
                    if (fromStage !== toStage || fromBid !== toBid) {
                        const movedToDone = toStage === 'Готово' && fromStage !== 'Готово';
                        const movedFromDone = fromStage === 'Готово' && toStage !== 'Готово';
                        if (task.subtasks && task.subtasks.length) {
                            if (movedToDone) task.subtasks = task.subtasks.map(st => ({ ...st, completed: true }));
                            if (movedFromDone) task.subtasks = task.subtasks.map(st => ({ ...st, completed: false }));
                        }
                    }
                    if (fromBid === toBid && fromStage === toStage) {
                        const order = Array.from(toC.children)
                            .map(r => Number(r.dataset.taskId))
                            .filter(Boolean);
                        const stageTasks = kanbanTasks.filter(t => Number(t.boardId) === toBid && t.stage === toStage);
                        const reordered = order.map(id => stageTasks.find(t => Number(t.id) === id)).filter(Boolean);
                        const firstIdx = kanbanTasks.findIndex(t => Number(t.boardId) === toBid && t.stage === toStage);
                        const without = kanbanTasks.filter(t => !(Number(t.boardId) === toBid && t.stage === toStage));
                        let insertAt = 0;
                        for (let i = 0; i < firstIdx; i++) {
                            if (!(Number(kanbanTasks[i].boardId) === toBid && kanbanTasks[i].stage === toStage)) insertAt++;
                        }
                        kanbanTasks = [...without.slice(0, insertAt), ...reordered, ...without.slice(insertAt)];
                    }
                    saveKanbanToLocalStorage();
                    renderCurrentView();
                },
                onCancel() {
                    if (cardsContainer) cardsContainer.classList.remove('dragging-active');
                    if (container._kanbanTableRowStyleRaf) cancelAnimationFrame(container._kanbanTableRowStyleRaf);
                    container._kanbanTableRowStyleRaf = null;
                    container._kanbanTableRowDragEl = null;
                    container._kanbanTableRowCtxHtml = null;
                }
            });
            container.sortable = sortable;
        });
    }

    function initKanbanEvents() {
        document.querySelectorAll('.board-kanban .more-actions').forEach(btn => {
            btn.removeEventListener('click', handleMoreActionsClick);
            btn.addEventListener('click', handleMoreActionsClick);
        });
        document.querySelectorAll('.board-kanban .kanban-stage-more-actions').forEach(btn => {
            btn.removeEventListener('click', handleStageMoreClick);
            btn.addEventListener('click', handleStageMoreClick);
        });
        document.querySelectorAll('.board-kanban .dropdown-item').forEach(item => {
            item.removeEventListener('click', handleDropdownItemClick);
            item.addEventListener('click', handleDropdownItemClick);
        });
        document.querySelectorAll('.board-kanban .dropdown-close').forEach(btn => {
            btn.removeEventListener('click', handleDropdownClose);
            btn.addEventListener('click', handleDropdownClose);
        });
        document.removeEventListener('click', handleOutsideClick);
        document.addEventListener('click', handleOutsideClick);

        document.querySelectorAll('.board-kanban .kanban-add-stage').forEach(btn => {
            btn.removeEventListener('click', handleAddStageClick);
            btn.addEventListener('click', handleAddStageClick);
        });

        document.querySelectorAll('.board-kanban .kanban-task-list').forEach(list => initKanbanDnD(list));

        const label = getTimelineShowDone() ? 'Скрыть выполненные (таймлайн)' : 'Показать выполненные (таймлайн)';
        document.querySelectorAll('.board-kanban .kanban-timeline-toggle-label').forEach(el => {
            el.textContent = label;
        });
        document.querySelectorAll('.board-kanban .kanban-timeline-toggle-item').forEach(el => {
            el.style.display = currentView === 'timeline' ? '' : 'none';
        });

        initKanbanStagesSortable();
    }

    function initKanbanStagesSortable() {
        const heads = document.querySelectorAll('#cards-container .kanban-board-card .kanban-columns-head');
        heads.forEach(head => {
            const card = head.closest('.kanban-board-card');
            const boardIndex = Number(card?.dataset?.boardIndex);
            if (Number.isNaN(boardIndex)) return;
            if (head.sortable) {
                head.sortable.destroy();
                head.sortable = null;
            }
            const sortable = new Sortable(head, {
                animation: 150,
                draggable: '.kanban-stage-group',
                handle: '.kanban-column-head-inner',
                forceFallback: true,
                fallbackOnBody: true,
                fallbackTolerance: 3,
                ghostClass: '',
                dragClass: '',
                onEnd() {
                    const stages = Array.from(head.querySelectorAll('.kanban-stage-group'))
                        .map(g => g.dataset.stageName)
                        .filter(Boolean);
                    const b = kanbanBoards[boardIndex];
                    if (!b || stages.length !== b.stages.length) return;
                    b.stages = stages;
                    saveKanbanToLocalStorage();
                    renderCurrentView();
                }
            });
            head.sortable = sortable;
        });
    }

    function handleDropdownClose(e) {
        e.stopPropagation();
        const dropdown = this.closest('.dropdown-menu');
        if (dropdown) dropdown.classList.remove('show');
    }

    function handleMoreActionsClick(e) {
        e.stopPropagation();
        const card = e.currentTarget.closest('.card');
        const dropdown = card?.querySelector('.dropdown-menu:not(.kanban-stage-dropdown)');
        if (!dropdown) return;
        const isOpen = dropdown.classList.contains('show');
        document.querySelectorAll('.board-kanban .dropdown-menu').forEach(m => {
            if (m !== dropdown) m.classList.remove('show');
        });
        dropdown.classList.toggle('show', !isOpen);
    }

    function handleStageMoreClick(e) {
        e.stopPropagation();
        const li = e.currentTarget;
        const info = li.closest('.info');
        const dropdown = info?.querySelector('.kanban-stage-dropdown');
        if (!dropdown) return;
        document.querySelectorAll('.board-kanban .dropdown-menu').forEach(m => {
            if (m !== dropdown) m.classList.remove('show');
        });
        dropdown.classList.toggle('show', !dropdown.classList.contains('show'));
    }

    function handleOutsideClick(e) {
        if (e.target.closest('.modal-overlay')) return;
        if (
            !e.target.closest('.more-actions') &&
            !e.target.closest('.kanban-stage-more-actions') &&
            !e.target.closest('.dropdown-menu')
        ) {
            document.querySelectorAll('.board-kanban .dropdown-menu').forEach(menu => menu.classList.remove('show'));
        }
    }

    function handleAddStageClick(e) {
        e.stopPropagation();
        const boardIndex = Number(e.currentTarget.dataset.boardIndex);
        addStageToBoard(boardIndex);
    }

    function handleDropdownItemClick(e) {
        e.stopPropagation();
        const item = e.currentTarget;
        const action = item.dataset.action;
        const dropdown = item.closest('.dropdown-menu');
        const isStage = dropdown?.classList.contains('kanban-stage-dropdown');

        if (isStage) {
            const boardIndex = Number(dropdown.dataset.boardIndex);
            const oldName = dropdown.dataset.stageName;
            dropdown.classList.remove('show');
            const board = kanbanBoards[boardIndex];
            if (!board) return;
            if (action === 'rename-stage') {
                showKanbanTextModal({
                    title: 'Переименовать этап',
                    label: 'Название этапа',
                    value: oldName,
                    onSubmit: (nn, close) => {
                        if (!nn || nn === oldName) {
                            close();
                            return;
                        }
                        const n = nn;
                        const idx = board.stages.indexOf(oldName);
                        if (idx !== -1) board.stages[idx] = n;
                        kanbanTasks.forEach(t => {
                            if (Number(t.boardId) === Number(board.id) && t.stage === oldName) t.stage = n;
                        });
                        saveKanbanToLocalStorage();
                        close();
                        renderCurrentView();
                    }
                });
                return;
            }
            if (action === 'stage-move-up') {
                moveKanbanStage(boardIndex, oldName, 'up');
                return;
            }
            if (action === 'stage-move-down') {
                moveKanbanStage(boardIndex, oldName, 'down');
                return;
            }
            if (action === 'stage-collapse-toggle') {
                showToast('Настройка появится в следующей версии');
                return;
            }
            if (action === 'clear-stage') {
                showKanbanConfirmModal({
                    title: 'Очистить колонку',
                    message: `Переместить все задачи этапа «${oldName}» в «Очередь»?`,
                    confirmLabel: 'Переместить',
                    danger: false,
                    onConfirm: () => clearKanbanStageTasks(boardIndex, oldName)
                });
                return;
            }
            if (action === 'delete-stage') {
                if (board.stages.length <= 1) {
                    showToast('Нельзя удалить последний этап');
                    return;
                }
                showKanbanConfirmModal({
                    title: 'Удалить этап',
                    message: `Удалить этап «${oldName}»? Задачи будут перенесены в «Очередь» (или в первый доступный этап).`,
                    confirmLabel: 'Удалить',
                    danger: true,
                    onConfirm: () => {
                        const fallback = board.stages.includes('Очередь') ? 'Очередь' : board.stages[0];
                        board.stages = board.stages.filter(s => s !== oldName);
                        kanbanTasks.forEach(t => {
                            if (Number(t.boardId) === Number(board.id) && t.stage === oldName) t.stage = fallback;
                        });
                        saveKanbanToLocalStorage();
                        renderCurrentView();
                    }
                });
            }
            return;
        }

        const card = item.closest('.card');
        const boardIndex = Number(card?.dataset?.boardIndex);
        const b = kanbanBoards[boardIndex];
        if (dropdown) dropdown.classList.remove('show');

        if (action === 'create-board') {
            showKanbanTextModal({
                title: 'Новая доска',
                label: 'Название доски',
                value: '',
                submitLabel: 'Создать',
                onSubmit: (name, close) => {
                    createNewKanbanBoard(name);
                    close();
                    showToast('Доска создана');
                }
            });
            return;
        }
        if (action === 'rename') {
            if (!b) return;
            showKanbanTextModal({
                title: 'Переименовать доску',
                label: 'Название',
                value: b.name || '',
                onSubmit: (newName, close) => {
                    if (!newName) return;
                    b.name = newName;
                    saveKanbanToLocalStorage();
                    close();
                    renderCurrentView();
                }
            });
            return;
        }
        if (action === 'add-stage') {
            addStageToBoard(boardIndex);
            return;
        }
        if (action === 'table-columns') {
            if (!b) return;
            showKanbanTableColumnsModal(b.id);
            return;
        }
        if (action === 'board-description') {
            if (!b) return;
            if (b.description == null) b.description = '';
            showKanbanTextareaModal({
                title: 'Описание доски',
                value: b.description,
                onSubmit: text => {
                    b.description = text;
                    saveKanbanToLocalStorage();
                    showToast('Описание сохранено');
                }
            });
            return;
        }
        if (action === 'archive-board') {
            if (!b) return;
            showKanbanConfirmModal({
                title: 'Архивировать доску',
                message: 'Переместить доску в архив? Задачи и настройки будут сохранены.',
                confirmLabel: 'Архивировать',
                danger: true,
                onConfirm: () => {
                    const archived = JSON.parse(localStorage.getItem('archivedKanbanBoards') || '[]');
                    const tasks = kanbanTasks.filter(t => Number(t.boardId) === Number(b.id));
                    archived.push({ board: { ...b }, tasks, archivedAt: new Date().toISOString() });
                    localStorage.setItem('archivedKanbanBoards', JSON.stringify(archived));
                    kanbanBoards.splice(boardIndex, 1);
                    kanbanTasks = kanbanTasks.filter(t => Number(t.boardId) !== Number(b.id));
                    saveKanbanToLocalStorage();
                    renderCurrentView();
                    showToast('Доска архивирована');
                }
            });
            return;
        }
        if (action === 'duplicate-board') {
            duplicateKanbanBoard(boardIndex);
            return;
        }
        if (action === 'toggle-timeline-done') {
            const next = !getTimelineShowDone();
            setTimelineShowDone(next);
            showToast(next ? 'Выполненные показаны (таймлайн)' : 'Выполненные скрыты (таймлайн)');
            renderCurrentView();
            return;
        }
        if (action === 'copy-board-link') {
            const url = typeof window !== 'undefined' ? window.location.href : '';
            if (navigator.clipboard && url) {
                navigator.clipboard.writeText(url).then(() => showToast('Ссылка скопирована')).catch(() => showToast('Не удалось скопировать'));
            } else {
                showToast(url || 'Нет URL');
            }
            return;
        }
        if (action === 'reset-stages') {
            if (!b) return;
            showKanbanConfirmModal({
                title: 'Сбросить этапы',
                message: 'Сбросить этапы к стандартным: Очередь / В работе / Готово?',
                confirmLabel: 'Сбросить',
                danger: true,
                onConfirm: () => {
                    b.stages = ['Очередь', 'В работе', 'Готово'];
                    saveKanbanToLocalStorage();
                    renderCurrentView();
                }
            });
            return;
        }
        if (action === 'board-export-json') {
            if (!b) return;
            const payload = {
                board: b,
                tasks: kanbanTasks.filter(t => Number(t.boardId) === Number(b.id))
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `kanban-board-${b.id}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            showToast('Файл сохранён');
        }
    }

    function addStageToBoard(boardIndex) {
        const board = kanbanBoards[boardIndex];
        if (!board) return;
        showKanbanTextModal({
            title: 'Новый этап',
            label: 'Название этапа',
            value: 'Тестирование',
            submitLabel: 'Добавить',
            onSubmit: (name, close) => {
                if (!name) return;
                if (board.stages.includes(name)) {
                    showToast('Такой этап уже есть');
                    return;
                }
                const doneIdx = board.stages.indexOf('Готово');
                if (doneIdx !== -1) board.stages.splice(doneIdx, 0, name);
                else board.stages.push(name);
                saveKanbanToLocalStorage();
                close();
                renderCurrentView();
            }
        });
    }

    function createKanbanStageTable(board, boardIndex, stageName, tasks) {
        const wrap = document.createElement('div');
        wrap.className = 'kanban-stage-table';
        wrap.dataset.boardId = board.id;
        wrap.dataset.boardIndex = boardIndex;
        wrap.dataset.stage = stageName;

        const head = document.createElement('div');
        head.className = 'kanban-stage-table-head';
        const left = document.createElement('div');
        left.className = 'kanban-stage-table-head-main';
        left.innerHTML = `<p class="text-basic">${escapeHtml(stageName)}</p><span class="kanban-count-badge">${tasks.length}</span>`;
        const info = document.createElement('div');
        info.className = 'info';
        info.style.position = 'relative';
        info.innerHTML = `
        <ul class="gap-24 flex-row">
            <li class="kanban-stage-more-actions" data-board-index="${boardIndex}" data-stage-name="${escapeHtml(stageName)}">
                <img src="/static/source/icons/info.svg" alt="Действия этапа">
            </li>
        </ul>
    `;
        const dd = createKanbanStageDropdown(boardIndex, stageName);
        info.appendChild(dd);
        head.appendChild(left);
        head.appendChild(info);
        wrap.appendChild(head);

        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'tasks-grid-wrapper';
        const table = document.createElement('div');
        table.className = 'tasks-grid kanban-tasks-grid';
        const vis = getKanbanTableColumnVisibility(board.id);
        const allKeys = ['id', 'name', 'priority', 'dueDate', 'assignee'];
        let columns = allKeys.filter(k => vis[k] !== false);
        if (!columns.length) columns = ['name'];
        const columnNames = { id: 'ID', name: 'Название', priority: 'Приоритет', dueDate: 'Срок', assignee: 'Исполнитель' };
        const colWidths = { id: 'auto', name: 'minmax(10rem, 1fr)', priority: 'auto', dueDate: 'auto', assignee: 'auto' };
        table.style.gridTemplateColumns = columns.map(c => colWidths[c] || 'auto').join(' ');

        const headerRow = document.createElement('div');
        headerRow.className = 'grid-header';
        columns.forEach(col => {
            const cell = document.createElement('div');
            cell.className = `col-${col}`;
            cell.innerHTML = `<span class="header-title">${columnNames[col]}</span>`;
            headerRow.appendChild(cell);
        });
        if (tasks.length) table.appendChild(headerRow);

        const rowsContainer = document.createElement('div');
        rowsContainer.className = 'table-rows';

        if (!tasks.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-task';
            empty.textContent = 'Нет задач';
            rowsContainer.appendChild(empty);
        }

        tasks.forEach(task => {
            const row = document.createElement('div');
            row.className = 'grid-row';
            row.dataset.taskId = task.id;
            columns.forEach(col => {
                const cell = document.createElement('div');
                cell.className = `col-${col}`;
                if (col === 'id') cell.textContent = getTaskDisplayId(task);
                if (col === 'name') cell.appendChild(createKanbanTableNameCell(task, row));
                if (col === 'priority') {
                    const p = document.createElement('p');
                    p.className = task.priority === 'срочно' ? 'priority-high' : 'priority-normal';
                    p.textContent = task.priority === 'срочно' ? 'Срочно' : 'Обычный';
                    cell.appendChild(p);
                }
                if (col === 'dueDate') {
                    const p = document.createElement('p');
                    p.textContent = task.dueDate ? formatDueDate(task.dueDate) : '—';
                    if (task.dueDate && parseDateBoard(task.dueDate) < new Date()) p.classList.add('overdue');
                    cell.appendChild(p);
                }
                if (col === 'assignee') {
                    if (task.assignee) {
                        let av = task.assigneeAvatar || '';
                        if (!av) {
                            const m = teamMembers.find(x => x.name === task.assignee);
                            if (m) av = m.avatar;
                        }
                        cell.innerHTML = `
                        <div class="user-img-text">
                            <img src="/static/source/user_img/${escapeHtml(av || 'basic_avatar.png')}" alt="">
                            <div class="basic-and-signature">
                                <p class="text-basic">${escapeHtml(task.assignee)}</p>
                            </div>
                        </div>
                    `;
                    } else {
                        cell.textContent = '—';
                    }
                }
                row.appendChild(cell);
            });
            rowsContainer.appendChild(row);
        });

        table.appendChild(rowsContainer);
        tableWrapper.appendChild(table);

        if (stageName === 'Очередь') {
            const queueForms = document.createElement('div');
            queueForms.className = 'kanban-stage-table-queue-forms';
            queueForms.appendChild(createKanbanQueueTaskForm(board.id, boardIndex, 'normal'));
            tableWrapper.appendChild(queueForms);
        }

        wrap.appendChild(tableWrapper);
        return wrap;
    }

    function renderKanbanBoardView() {
        const container = document.querySelector('#cards-container');
        if (!container) return;
        container.className = 'cards board-view';
        container.innerHTML = '';

        kanbanBoards.forEach((board, boardIndex) => {
            const tasksForBoard = kanbanTasks.filter(t => Number(t.boardId) === Number(board.id));
            const card = document.createElement('div');
            card.className = 'card kanban-board-card';
            card.dataset.boardId = board.id;
            card.dataset.boardIndex = boardIndex;
            card.setAttribute('data-draggable-board', 'true');
            if (board.stages && board.stages.length > 3) {
                card.setAttribute('data-kanban-scroll', 'true');
            } else {
                card.removeAttribute('data-kanban-scroll');
            }

            const header = createKanbanCardHeader(board, boardIndex);
            card.appendChild(header);

            const body = document.createElement('div');
            body.className = 'board-card-collapsible';

            body.appendChild(createColumnsHeader(board, boardIndex, tasksForBoard));

            const urgentTasks = tasksForBoard.filter(t => t.priority === 'срочно');
            const normalTasks = tasksForBoard.filter(t => (t.priority || 'обычный') !== 'срочно');

            body.appendChild(createPrioritySection(board, 'Срочно', 'urgent', urgentTasks, boardIndex));
            body.appendChild(createPrioritySection(board, 'Обычный приоритет', 'normal', normalTasks, boardIndex));

            card.appendChild(body);
            header._attachCollapse(body);

            container.appendChild(card);
        });

        initKanbanEvents();
        initKanbanBoardsSortable();
    }

    function renderKanbanTablesView() {
        const container = document.querySelector('#cards-container');
        if (!container) return;
        container.className = 'cards tables-view';
        container.innerHTML = '';

        kanbanBoards.forEach((board, boardIndex) => {
            const tasksForBoard = kanbanTasks.filter(t => Number(t.boardId) === Number(board.id));
            const card = document.createElement('div');
            card.className = 'card kanban-board-card';
            card.dataset.boardId = board.id;
            card.dataset.boardIndex = boardIndex;
            card.setAttribute('data-draggable-board', 'true');

            const header = createKanbanCardHeader(board, boardIndex);
            card.appendChild(header);

            const body = document.createElement('div');
            body.className = 'board-card-collapsible kanban-tables-body';

            board.stages.forEach((stage, idx) => {
                const stageTasks = tasksForBoard.filter(t => t.stage === stage);
                body.appendChild(createKanbanStageTable(board, boardIndex, stage, stageTasks));
                if (idx !== board.stages.length - 1) {
                    const hr = document.createElement('div');
                    hr.className = 'kanban-divider';
                    body.appendChild(hr);
                }
            });

            card.appendChild(body);
            header._attachCollapse(body);
            container.appendChild(card);
        });

        initKanbanEvents();
        initKanbanTableRowsSortable();
        initKanbanBoardsSortable();
    }

    function renderKanbanTimelineView() {
        const container = document.querySelector('#cards-container');
        if (!container) return;
        container.className = 'cards timeline-view';
        container.innerHTML = '';

        const showDone = getTimelineShowDone();
        kanbanBoards.forEach((board, boardIndex) => {
            const tasksForBoard = kanbanTasks.filter(
                t =>
                    Number(t.boardId) === Number(board.id) &&
                    t.dueDate &&
                    (showDone ? true : t.stage !== 'Готово')
            );
            if (!tasksForBoard.length) return;

            const tasksWithDates = tasksForBoard.map(t => ({ ...t, dueDateObj: parseDateBoard(t.dueDate) }));
            tasksWithDates.sort((a, b) => a.dueDateObj - b.dueDateObj);

            const card = document.createElement('div');
            card.className = 'card board-timeline-card';
            const header = createKanbanCardHeader(board, boardIndex, { boardDrag: false });
            card.appendChild(header);

            const body = document.createElement('div');
            body.className = 'board-card-collapsible';

            const groups = {};
            tasksWithDates.forEach(task => {
                const key = formatDueDate(task.dueDate);
                if (!groups[key]) groups[key] = [];
                groups[key].push(task);
            });

            const timeline = document.createElement('div');
            timeline.className = 'timeline-board';
            const track = document.createElement('div');
            track.className = 'timeline-track';

            for (const [label, tasks] of Object.entries(groups)) {
                const milestone = document.createElement('div');
                milestone.className = 'timeline-milestone';
                const node = document.createElement('div');
                node.className = 'timeline-node';
                const chip = document.createElement('div');
                chip.className = 'timeline-date-chip';
                chip.textContent = label;
                const list = document.createElement('div');
                list.className = 'timeline-milestone-tasks';
                tasks.forEach(t => list.appendChild(createKanbanTaskItem(t)));
                milestone.append(node, chip, list);
                track.appendChild(milestone);
            }
            timeline.appendChild(track);
            body.appendChild(timeline);

            card.appendChild(body);
            header._attachCollapse(body);
            container.appendChild(card);
        });

        if (!container.children.length) {
            container.innerHTML = '<div class="empty-message">Нет задач с указанными сроками</div>';
            return;
        }

        initKanbanEvents();
    }

    function renderKanbanReportsView() {
        const container = document.querySelector('#cards-container');
        if (!container) return;
        container.className = 'cards reports-view';
        container.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'card board-reports-card';
        const header = document.createElement('div');
        header.className = 'tasks-header flex-row-between';
        header.innerHTML = '<p class="text-header">Отчёты (Kanban)</p>';
        card.appendChild(header);

        const wip = kanbanTasks.filter(t => t.stage === 'В работе' || t.stage === 'Тестирование');
        const done = kanbanTasks.filter(t => t.stage === 'Готово');
        const queue = kanbanTasks.filter(t => t.stage === 'Очередь');
        const urgent = kanbanTasks.filter(t => t.priority === 'срочно' && t.stage !== 'Готово');

        const summary = document.createElement('div');
        summary.className = 'reports-summary';
        summary.innerHTML = `
        <div class="reports-summary-grid">
            <div class="reports-stat-chip"><span class="reports-stat-value">${kanbanBoards.length}</span><span class="reports-stat-label">досок</span></div>
            <div class="reports-stat-chip"><span class="reports-stat-value">${queue.length}</span><span class="reports-stat-label">в очереди</span></div>
            <div class="reports-stat-chip"><span class="reports-stat-value">${wip.length}</span><span class="reports-stat-label">в работе / тест</span></div>
            <div class="reports-stat-chip"><span class="reports-stat-value">${done.length}</span><span class="reports-stat-label">готово</span></div>
            <div class="reports-stat-chip"><span class="reports-stat-value">${urgent.length}</span><span class="reports-stat-label">срочных не завершено</span></div>
        </div>
        <p class="reports-hint text-signature">Метрики по всем Kanban-доскам. «Готово» — задачи в последней колонке этапа.</p>
    `;
        card.appendChild(summary);

        const gridWrap = document.createElement('div');
        gridWrap.className = 'tasks-grid-wrapper';
        const grid = document.createElement('div');
        grid.className = 'tasks-grid reports-assignee-grid reports-kanban-grid';

        const headerRow = document.createElement('div');
        headerRow.className = 'grid-header';
        ['Доска', 'WIP', 'Готово', 'Срочные (активные)', 'Lead time (дней)', 'Загрузка'].forEach((title, i) => {
            const cell = document.createElement('div');
            cell.className = `col-${['board', 'wip', 'done', 'urgent', 'lead', 'load'][i]}`;
            const titleSpan = document.createElement('span');
            titleSpan.className = 'header-title';
            titleSpan.textContent = title;
            cell.appendChild(titleSpan);
            headerRow.appendChild(cell);
        });
        grid.appendChild(headerRow);

        kanbanBoards.forEach(board => {
            const tf = kanbanTasks.filter(t => Number(t.boardId) === Number(board.id));
            const w = tf.filter(t => t.stage !== 'Очередь' && t.stage !== 'Готово').length;
            const d = tf.filter(t => t.stage === 'Готово').length;
            const u = tf.filter(t => t.priority === 'срочно' && t.stage !== 'Готово').length;
            const loadPct = tf.length ? Math.min(100, Math.round((w / tf.length) * 100)) : 0;

            const gridRow = document.createElement('div');
            gridRow.className = 'grid-row';
            gridRow.innerHTML = `
            <div class="col-board"><p class="text-basic">${escapeHtml(board.name)}</p></div>
            <div class="col-wip"><p>${w}</p></div>
            <div class="col-done"><p>${d}</p></div>
            <div class="col-urgent"><p>${u}</p></div>
            <div class="col-lead"><p>—</p></div>
            <div class="col-load"><p>${loadPct}%</p></div>
        `;
            grid.appendChild(gridRow);
        });

        gridWrap.appendChild(grid);
        card.appendChild(gridWrap);

        container.appendChild(card);
    }

    function renderKanbanArchiveView() {
        const container = document.querySelector('#cards-container');
        if (!container) return;
        container.className = 'cards archive-view';
        container.innerHTML = '';

        kanbanBoards.forEach((board, boardIndex) => {
            const archived = board.archivedTasks || [];
            const section = document.createElement('div');
            section.className = 'card board-archive-section kanban-archive-board';
            section.dataset.boardId = board.id;
            section.dataset.boardIndex = boardIndex;

            const boardTitle = document.createElement('p');
            boardTitle.className = 'text-header';
            boardTitle.textContent = board.name;
            section.appendChild(boardTitle);

            const body = document.createElement('div');
            body.className = 'archive-board-body';

            if (!archived.length) {
                body.innerHTML = '<div class="empty-state">Пусто</div>';
            } else {
                const byStage = {};
                archived.forEach(t => {
                    const st = t.stage || '—';
                    if (!byStage[st]) byStage[st] = [];
                    byStage[st].push(t);
                });

                Object.entries(byStage).forEach(([stageName, items]) => {
                    const headMain = document.createElement('div');
                    headMain.className = 'kanban-stage-table-head-main';
                    headMain.innerHTML = `<p class="text-basic">${escapeHtml(stageName)}</p><span class="kanban-count-badge">${items.length}</span>`;
                    body.appendChild(headMain);

                    const wrap = document.createElement('div');
                    wrap.className = 'tasks-grid-wrapper';
                    const grid = document.createElement('div');
                    grid.className = 'tasks-grid archive-tasks-grid';
                    const hdr = document.createElement('div');
                    hdr.className = 'grid-header';
                    [
                        { cls: 'col-id', title: 'ID' },
                        { cls: 'col-name', title: 'Название' },
                        { cls: 'col-priority', title: 'Приоритет' },
                        { cls: 'col-archivedAt', title: 'Архивировано' },
                        { cls: 'col-reason', title: 'Причина' }
                    ].forEach(({ cls, title }) => {
                        const c = document.createElement('div');
                        c.className = cls;
                        c.innerHTML = `<span class="header-title">${title}</span>`;
                        hdr.appendChild(c);
                    });
                    grid.appendChild(hdr);
                    items.forEach(t => {
                        const row = document.createElement('div');
                        row.className = 'grid-row';
                        row.innerHTML = `
                        <div class="col-id">${getTaskDisplayId(t)}</div>
                        <div class="col-name"><p class="text-basic">${escapeHtml(t.name)}</p></div>
                        <div class="col-priority"><p>${t.priority === 'срочно' ? 'Срочно' : 'Обычный'}</p></div>
                        <div class="col-archivedAt"><p>${t.archivedDate ? new Date(t.archivedDate).toLocaleString('ru-RU') : '—'}</p></div>
                        <div class="col-reason"><p>${escapeHtml(t.archivedReason || '—')}</p></div>
                    `;
                        grid.appendChild(row);
                    });
                    wrap.appendChild(grid);
                    body.appendChild(wrap);
                });
            }
            section.appendChild(body);
            container.appendChild(section);
        });

        initKanbanEvents();
    }

    async function initBoardKanbanPage() {
        if (!document.querySelector('.board-kanban')) return;
        await loadTeamData();
        const hasLocal = loadKanbanFromLocalStorage();
        const versionOk = localStorage.getItem(KANBAN_DATA_VERSION_KEY) === KANBAN_DATA_VERSION;
        if (!hasLocal || !versionOk) {
            await loadKanbanData();
            saveKanbanToLocalStorage();
            localStorage.setItem(KANBAN_DATA_VERSION_KEY, KANBAN_DATA_VERSION);
        } else {
            migrateKanbanData();
        }
        initViewSwitching();
        renderCurrentView();
    }

    window.initBoardKanbanPage = initBoardKanbanPage;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.querySelector('.board-kanban')) initBoardKanbanPage();
        });
    } else if (document.querySelector('.board-kanban')) {
        initBoardKanbanPage();
    }

})();
