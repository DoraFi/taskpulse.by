(() => {
let boardsData = [];
let isDragging = false;
let currentView = 'board';
let teamMembers = [];
let tableSortColumn = null;
let tableSortDirection = 'asc';

let VanillaCalendarReady = false;
let VanillaCalendarConstructor = null;

function getTaskDisplayId(task) {
    return task?.displayId || task?.id || '';
}

function loadVanillaCalendar() {
    return new Promise((resolve) => {
        if (VanillaCalendarReady && VanillaCalendarConstructor) {
            resolve(VanillaCalendarConstructor);
            return;
        }
        const onReady = () => {
            VanillaCalendarReady = true;
            VanillaCalendarConstructor = window.VanillaCalendar;
            resolve(VanillaCalendarConstructor);
            window.removeEventListener('vanillaCalendarReady', onReady);
        };
        window.addEventListener('vanillaCalendarReady', onReady);
        if (window.VanillaCalendar) {
            onReady();
        }
    });
}

async function loadTeamData() {
    try {
        const response = await fetch('/api/team');
        if (!response.ok) throw new Error('Ошибка загрузки команды');
        teamMembers = await response.json();
    } catch (error) {
        console.error('Ошибка загрузки team.json:', error);
        teamMembers = [];
    }
}

async function loadBoardsData() {
    try {
        const response = await fetch('/api/boards');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        boardsData = data.boards || data;
        ensureArchivedTasksArrays();
        reorderBoardsForColumnCount();
        renderCurrentView();
        initBoardEvents();
        initViewSwitching();
    } catch (error) {
        console.error('Ошибка загрузки данных досок:', error);
        const container = document.querySelector('#cards-container');
        if (container) {
            container.innerHTML = '<div class="error-message">Ошибка загрузки данных. Проверьте файл boards.json</div>';
        }
    }
}

function reorderBoardsForColumnCount() {
    if (!boardsData || boardsData.length === 0) return;
    const result = [];
    const leftColumn = [];
    const rightColumn = [];
    for (let i = 0; i < boardsData.length; i++) {
        if (i % 2 === 0) leftColumn.push(boardsData[i]);
        else rightColumn.push(boardsData[i]);
    }
    for (let i = 0; i < Math.max(leftColumn.length, rightColumn.length); i++) {
        if (leftColumn[i]) result.push(leftColumn[i]);
        if (rightColumn[i]) result.push(rightColumn[i]);
    }
    boardsData = result;
}

function saveBoardsToLocalStorage() {
    localStorage.setItem('boardsData', JSON.stringify(boardsData));
}

function loadBoardsFromLocalStorage() {
    const saved = localStorage.getItem('boardsData');
    if (saved) {
        boardsData = JSON.parse(saved);
        ensureArchivedTasksArrays();
        return true;
    }
    return false;
}

function ensureArchivedTasksArrays() {
    if (!boardsData || !boardsData.length) return;
    boardsData.forEach(board => {
        if (!Array.isArray(board.archivedTasks)) board.archivedTasks = [];
    });
}

const ARCHIVE_COLLAPSE_STORAGE_KEY = 'boardListArchiveCollapsed';

function getArchiveCollapseMap() {
    try {
        return JSON.parse(localStorage.getItem(ARCHIVE_COLLAPSE_STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
}

function setBoardArchiveCollapsed(boardId, collapsed) {
    const map = getArchiveCollapseMap();
    map[String(boardId)] = collapsed;
    localStorage.setItem(ARCHIVE_COLLAPSE_STORAGE_KEY, JSON.stringify(map));
}

function isBoardArchiveCollapsed(boardId) {
    return getArchiveCollapseMap()[String(boardId)] === true;
}

const BOARD_SECTION_COLLAPSE_KEY = 'boardListBoardSectionCollapsed';

function getBoardSectionCollapseMap() {
    try {
        return JSON.parse(localStorage.getItem(BOARD_SECTION_COLLAPSE_KEY) || '{}');
    } catch {
        return {};
    }
}

function setBoardSectionCollapsed(boardId, collapsed) {
    const map = getBoardSectionCollapseMap();
    map[String(boardId)] = collapsed;
    localStorage.setItem(BOARD_SECTION_COLLAPSE_KEY, JSON.stringify(map));
}

function isBoardSectionCollapsed(boardId) {
    return getBoardSectionCollapseMap()[String(boardId)] === true;
}

function getBoardListNavButtons() {
    return document.querySelectorAll('.board-list .tabs .tab-btn[data-tab], .board-list .tabs-buttons > .button-basic[data-tab]');
}

function wireBoardCardCollapse(header, board, bodyEl) {
    const toggle = header._collapseToggle;
    if (!toggle || !bodyEl) return;
    bodyEl.style.display = header._collapsedInitially ? 'none' : '';
    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = toggle.classList.toggle('open');
        bodyEl.style.display = isOpen ? '' : 'none';
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        setBoardSectionCollapsed(board.id, !isOpen);
    });
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

function renderCurrentView() {
    if (currentView === 'board') renderBoardView();
    else if (currentView === 'tables') renderTableView();
    else if (currentView === 'timeline') renderTimelineView();
    else if (currentView === 'reports') renderReportsView();
    else if (currentView === 'archive') renderArchiveView();
}

function renderBoardView() {
    const container = document.querySelector('#cards-container');
    if (!container) return;
    container.classList.remove('tables-view', 'timeline-view', 'reports-view', 'archive-view');
    if (!boardsData || boardsData.length === 0) {
        container.innerHTML = '<div class="empty-message">Нет созданных досок</div>';
        return;
    }
    container.innerHTML = '';
    boardsData.forEach((board, boardIndex) => {
        const tasks = board.tasks || [];
        const validTasks = tasks.filter(t => t);
        const sortedTasks = sortTasksByPriorityAndDate(validTasks);
        const card = createBoardCard(board, boardIndex, sortedTasks);
        container.appendChild(card);
    });
    updateCardsDataset();
    setTimeout(() => {
        reinitBoardAndTaskHandlers();
    }, 50);
}

function renderTableView() {
    const container = document.querySelector('#cards-container');
    if (!container) return;
    container.classList.remove('timeline-view', 'reports-view', 'archive-view');
    container.classList.add('tables-view');
    if (!boardsData || boardsData.length === 0) {
        container.innerHTML = '<div class="empty-message">Нет созданных досок</div>';
        return;
    }
    container.innerHTML = '';
    boardsData.forEach((board, boardIndex) => {
        const boardCard = document.createElement('div');
        boardCard.className = 'card board-table-card';
        boardCard.dataset.boardId = board.id;
        boardCard.dataset.boardIndex = boardIndex;
        
        const header = createCardHeader(board, boardIndex);
        boardCard.appendChild(header);

        const tasks = board.tasks || [];
        const tableOrMessage = createBoardTable(board, tasks, boardIndex);
        const bodyWrap = document.createElement('div');
        bodyWrap.className = 'board-card-collapsible';
        bodyWrap.appendChild(tableOrMessage);
        boardCard.appendChild(bodyWrap);
        wireBoardCardCollapse(header, board, bodyWrap);

        const addTaskForm = createAddTaskForm(board.id, boardIndex);
        boardCard.appendChild(addTaskForm);

        container.appendChild(boardCard);
    });
    initBoardDragAndDrop();
    initTableRowsSortable();
    initBoardEvents();
}

function createAddTaskForm(boardId, boardIndex) {
    const form = document.createElement('form');
    form.className = 'form-add-task';
    form.dataset.boardId = boardId;
    form.dataset.boardIndex = boardIndex;
    form.style.position = 'relative';

    form.innerHTML = `
        <input type="text" placeholder="Создайте краткое описание задачи">
        <div class="tag">
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
        if (parseInt(year) === currentYear) {
            return `${day}.${month}`;
        } else {
            return `${day}.${month}.${year}`;
        }
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
    let isRangeMode = true;

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
            dayEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const dateStr = dayEl.dataset.date;
                if (!selectionStart || (selectionStart && selectionEnd)) {
                    selectionStart = dateStr;
                    selectionEnd = null;
                } else {
                    if (dateStr < selectionStart) {
                        selectionEnd = selectionStart;
                        selectionStart = dateStr;
                    } else {
                        selectionEnd = dateStr;
                    }
                }
                renderBothMonths();
                if (selectionEnd) {
                    selectedDueDate = { start: selectionStart, end: selectionEnd };
                } else if (selectionStart) {
                    selectedDueDate = selectionStart;
                } else {
                    selectedDueDate = null;
                }
                updateCalendarDisplay();
            });
        });

        const monthBtn = container.querySelector('.change-month');
        if (monthBtn) {
            monthBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dir = monthBtn.dataset.dir;
                if (dir === 'prev') {
                    if (currentMonth === 0) {
                        currentMonth = 11;
                        currentYear--;
                    } else {
                        currentMonth--;
                    }
                } else {
                    if (currentMonth === 11) {
                        currentMonth = 0;
                        currentYear++;
                    } else {
                        currentMonth++;
                    }
                }
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

        const prevBoth = calendarWrapper.querySelector('.prev-both');
        const nextBoth = calendarWrapper.querySelector('.next-both');
        prevBoth.addEventListener('click', () => {
            if (currentMonth === 0) {
                currentMonth = 11;
                currentYear--;
            } else {
                currentMonth--;
            }
            renderBothMonths();
        });
        nextBoth.addEventListener('click', () => {
            if (currentMonth === 11) {
                currentMonth = 0;
                currentYear++;
            } else {
                currentMonth++;
            }
            renderBothMonths();
        });

        const resetBtn = calendarWrapper.querySelector('.reset-dates');
        resetBtn.addEventListener('click', () => {
            selectionStart = null;
            selectionEnd = null;
            selectedDueDate = null;
            renderBothMonths();
            updateCalendarDisplay();
        });

        const applyBtn = calendarWrapper.querySelector('.apply-dates');
        applyBtn.addEventListener('click', () => {
            if (selectionStart && selectionEnd) {
                selectedDueDate = { start: selectionStart, end: selectionEnd };
            } else if (selectionEnd) {
                selectedDueDate = selectionEnd;
            } else if (selectionStart) {
                selectedDueDate = selectionStart;
            } else {
                selectedDueDate = null;
            }
            updateCalendarDisplay();
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 200);
            }
        });
    }

    calendarTrigger.addEventListener('click', (e) => {
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
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        modal.querySelectorAll('.assignee-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const name = opt.dataset.name;
                const avatar = opt.dataset.avatar;
                selectedAssignee = { name, avatar };
                assigneeIcon.src = `/static/source/user_img/${avatar}`;
                assigneeIcon.style.borderRadius = '50%';
                assigneeNameSpan.textContent = name;
                closeModal();
            });
        });
    }

    assigneeIcon.addEventListener('click', (e) => {
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
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            createBtn.click();
        }
    });

    createBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const taskName = input.value.trim();
        if (!taskName) {
            showToast('Введите название задачи');
            return;
        }
        const board = boardsData[boardIndex];
        if (!board) return;
        const maxId = Math.max(0, ...board.tasks.map(t => t.id).filter(id => typeof id === 'number'));
        const newId = maxId + 1;
        let dueDate = null;
        if (selectedDueDate) {
            if (typeof selectedDueDate === 'string') dueDate = selectedDueDate;
            else if (selectedDueDate.end) dueDate = selectedDueDate.end;
        }
        const newTask = {
            id: newId,
            name: taskName,
            priority: 'обычный',
            dueDate: dueDate,
            assignee: selectedAssignee ? selectedAssignee.name : null,
            assigneeAvatar: selectedAssignee ? selectedAssignee.avatar : null,
            subtasks: []
        };
        board.tasks.push(newTask);
        saveBoardsToLocalStorage();
        renderCurrentView();
        showToast(`Задача "${taskName}" создана в доске "${board.name}"`);
        hideTagAndReset();
    });

    document.addEventListener('click', (e) => {
        if (e.target.closest('.modal-overlay')) return;
        if (!form.contains(e.target) && tagDiv.style.display === 'flex') {
            hideTagAndReset();
        }
    });

    hideTagAndReset();
    return form;
}

function createBoardCard(board, boardIndex, sortedTasks) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.boardId = board.id;
    card.dataset.boardIndex = boardIndex;
    card.dataset.originalIndex = boardIndex;
    const header = createCardHeader(board, boardIndex);
    const list = document.createElement('div');
    list.className = 'list';
    const validTasks = sortedTasks.filter(t => t);
    if (validTasks.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'empty-task';
        emptyItem.textContent = 'Нет задач в этой доске';
        list.appendChild(emptyItem);
    } else {
        validTasks.forEach((task, taskIndex) => {
            const taskItem = createTaskItem(task, boardIndex, taskIndex);
            list.appendChild(taskItem);
        });
    }
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'board-card-collapsible';
    bodyWrap.appendChild(list);
    const addTaskForm = createAddTaskForm(board.id, boardIndex);
    card.appendChild(header);
    card.appendChild(bodyWrap);
    card.appendChild(addTaskForm);
    wireBoardCardCollapse(header, board, bodyWrap);
    return card;
}

function createBoardTable(board, tasks, boardIndex) {
    if (!tasks || tasks.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-task';
        emptyMessage.textContent = 'Нет задач в этой таблице';
        return emptyMessage;
    }
    
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'tasks-grid-wrapper';
    const table = document.createElement('div');
    table.className = 'tasks-grid';
    const columns = ['select', 'id', 'name', 'priority', 'dueDate', 'assignee'];
    const columnNames = {
        select: '',
        id: 'ID',
        name: 'Название',
        priority: 'Приоритет',
        dueDate: 'Срок',
        assignee: 'Исполнитель'
    };
    const headerRow = document.createElement('div');
    headerRow.className = 'grid-header';
    columns.forEach(col => {
        const headerCell = document.createElement('div');
        headerCell.className = `col-${col}`;
        headerCell.setAttribute('data-sort', col);
        if (col === 'select') {
            headerCell.innerHTML = `<span class="header-title"></span>`;
        } else {
            headerCell.innerHTML = `<span class="header-title">${columnNames[col]}</span>
                                    <span class="sort-icon"><img src="/static/source/icons/arrow_dark.svg" alt="Сортировка"></span>`;
            headerCell.addEventListener('click', () => {
                sortBoardTable(board.id, col);
            });
        }
        headerRow.appendChild(headerCell);
    });
    table.appendChild(headerRow);
    
    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'table-rows';
    let sortedTasks = [...tasks];
    const sortState = boardTableSortState[board.id];
    if (sortState && sortState.column) {
        sortedTasks.sort((a, b) => {
            let valA = a[sortState.column];
            let valB = b[sortState.column];
            if (sortState.column === 'dueDate') {
                valA = parseDateBoard(valA);
                valB = parseDateBoard(valB);
                return sortState.direction === 'asc' ? valA - valB : valB - valA;
            }
            if (sortState.column === 'subtasksCount') {
                valA = (a.subtasks ? a.subtasks.length : 0);
                valB = (b.subtasks ? b.subtasks.length : 0);
                return sortState.direction === 'asc' ? valA - valB : valB - valA;
            }
            valA = (valA || '').toString().toLowerCase();
            valB = (valB || '').toString().toLowerCase();
            if (sortState.direction === 'asc') return valA.localeCompare(valB);
            else return valB.localeCompare(valA);
        });
    }
    sortedTasks.forEach(task => {
        const row = document.createElement('div');
        row.className = 'grid-row';
        row.dataset.taskId = task.id;
        columns.forEach(col => {
            const cell = document.createElement('div');
            cell.className = `col-${col}`;
            switch (col) {
                case 'select':
                    const checkboxLabel = document.createElement('label');
                    checkboxLabel.className = 'checkbox-item';
                    checkboxLabel.innerHTML = `
                        <input type="checkbox" data-task-id="${task.id}">
                        <span class="custom-checkbox"></span>
                        <span class="checkbox-text"></span>
                    `;
                    const checkbox = checkboxLabel.querySelector('input');
                    checkbox.addEventListener('change', (e) => {
                        if (e.target.checked) {
                            archiveTask(boardIndex, task.id, true);
                        }
                    });
                    cell.appendChild(checkboxLabel);
                    break;
                case 'id':
                    cell.textContent = getTaskDisplayId(task);
                    break;
                case 'name': {
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
                    nameSpan.textContent = task.name;
                    topRow.appendChild(nameSpan);

                    let subtasksList = null;
                    let totalCount = 0;
                    let completedCount = 0;
                    let trigger = null;

                    if (task.subtasks && task.subtasks.length > 0) {
                        totalCount = task.subtasks.length;
                        completedCount = task.subtasks.filter(st => st.completed).length;

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
                                    <input type="checkbox" ${subtask.completed ? 'checked' : ''}>
                                    <span class="custom-checkbox"></span>
                                    <span class="checkbox-text">${escapeHtml(subtask.name)}</span>
                                </label>
                            `;
                            const subtaskCheckbox = subtaskItem.querySelector('input');
                            subtaskCheckbox.addEventListener('change', (e) => {
                                subtask.completed = e.target.checked;
                                const newCompleted = task.subtasks.filter(st => st.completed).length;
                                trigger.textContent = `${newCompleted} / ${totalCount}`;
                                saveBoardsToLocalStorage();

                                const allCompleted = task.subtasks.every(st => st.completed);
                                if (allCompleted && totalCount > 0) {
                                    archiveTask(boardIndex, task.id, true);
                                }
                            });
                            subtasksList.appendChild(subtaskItem);
                        });

                        trigger.addEventListener('click', () => {
                            const isOpen = subtasksList.style.display === 'flex';
                            subtasksList.style.display = isOpen ? 'none' : 'flex';
                            trigger.classList.toggle('open', !isOpen);
                            if (!isOpen) {
                                row.classList.add('subtasks-open');
                            } else {
                                row.classList.remove('subtasks-open');
                            }
                        });
                    }

                    container.appendChild(topRow);
                    if (subtasksList) container.appendChild(subtasksList);
                    cell.appendChild(container);
                    break;
                }
                case 'priority':
                    const prioritySpan = document.createElement('span');
                    prioritySpan.className = task.priority === 'срочно' ? 'priority-high' : 'priority-normal';
                    prioritySpan.textContent = task.priority === 'срочно' ? 'Срочно' : 'Обычный';
                    cell.appendChild(prioritySpan);
                    break;
                case 'dueDate':
                    const dueSpan = document.createElement('span');
                    const dueDate = task.dueDate ? formatDueDate(task.dueDate) : '—';
                    dueSpan.textContent = dueDate;
                    if (task.dueDate && parseDateBoard(task.dueDate) < new Date()) {
                        dueSpan.classList.add('overdue');
                    }
                    cell.appendChild(dueSpan);
                    break;
                case 'assignee':
                    const assigneeName = task.assignee || '';
                    let assigneeAvatar = task.assigneeAvatar || '';
                    if (assigneeName && !assigneeAvatar) {
                        const teamMember = teamMembers.find(m => m.name === assigneeName);
                        if (teamMember) assigneeAvatar = teamMember.avatar;
                    }
                    if (assigneeName) {
                        const userDiv = document.createElement('div');
                        userDiv.className = 'user-img-text';
                        userDiv.style.display = 'flex';
                        userDiv.style.alignItems = 'center';
                        userDiv.style.gap = '0.375rem';
                        const img = document.createElement('img');
                        img.src = `/static/source/user_img/${assigneeAvatar || 'basic_avatar.png'}`;
                        img.alt = assigneeName;
                        img.style.width = '1.5rem';
                        img.style.height = '1.5rem';
                        img.style.borderRadius = '50%';
                        img.style.objectFit = 'cover';
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'text-basic';
                        nameSpan.textContent = assigneeName;
                        userDiv.appendChild(img);
                        userDiv.appendChild(nameSpan);
                        cell.appendChild(userDiv);
                    } else {
                        cell.textContent = '—';
                    }
                    break;
            }
            row.appendChild(cell);
        });
        rowsContainer.appendChild(row);
    });
    table.appendChild(rowsContainer);
    tableWrapper.appendChild(table);
    return tableWrapper;
}

let boardTableSortState = {};

function sortBoardTable(boardId, column) {
    if (!boardTableSortState[boardId]) {
        boardTableSortState[boardId] = { column: null, direction: 'asc' };
    }
    const state = boardTableSortState[boardId];
    if (state.column === column) {
        state.direction = state.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.column = column;
        state.direction = 'asc';
    }
    renderTableView();
}

function sortTasksForTimeline(tasks) {
    if (!tasks || tasks.length === 0) return [];
    return [...tasks].filter(t => t).sort((a, b) => {
        const dateA = parseDateBoard(a.dueDate);
        const dateB = parseDateBoard(b.dueDate);
        const diff = dateA - dateB;
        if (diff !== 0) return diff;
        const urgentA = a.priority === 'срочно' ? 0 : 1;
        const urgentB = b.priority === 'срочно' ? 0 : 1;
        return urgentA - urgentB;
    });
}

function groupTimelineTasksByDueLabel(sortedTasks) {
    const groups = [];
    let currentLabel = null;
    let bucket = null;
    sortedTasks.forEach(task => {
        const label =
            task.dueDate && String(task.dueDate).trim()
                ? formatDueDate(task.dueDate)
                : 'Без срока';
        if (label !== currentLabel) {
            currentLabel = label;
            bucket = [];
            groups.push({ label, tasks: bucket });
        }
        bucket.push(task);
    });
    return groups;
}

function createTimelineTaskCard(task, boardIndex) {
    const card = document.createElement('div');
    card.className = 'timeline-task-card';
    card.dataset.taskId = task.id;

    const row = document.createElement('div');
    row.className = 'timeline-task-card__row';

    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'checkbox-item';
    checkboxLabel.style.margin = '0';
    checkboxLabel.style.cursor = 'pointer';
    checkboxLabel.style.flexShrink = '0';
    checkboxLabel.innerHTML = `
        <input type="checkbox" data-task-id="${task.id}" ${task.archived ? 'checked disabled' : ''}>
        <span class="custom-checkbox"></span>
    `;
    const checkbox = checkboxLabel.querySelector('input');
    checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
            archiveTask(boardIndex, task.id, true);
        }
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'timeline-task-card__name';
    nameSpan.textContent = task.name;

    row.appendChild(checkboxLabel);
    row.appendChild(nameSpan);
    card.appendChild(row);

    if (task.subtasks && task.subtasks.length > 0) {
        card.appendChild(createSubtasksBlock(task));
    }

    const tagBlock = createTagBlock(task);
    if (tagBlock) {
        card.appendChild(tagBlock);
    }

    return card;
}

function createBoardTimelineTrack(board, boardIndex, validTasks) {
    const sorted = sortTasksForTimeline(validTasks);
    const groups = groupTimelineTasksByDueLabel(sorted);

    const wrap = document.createElement('div');
    wrap.className = 'timeline-board';

    const track = document.createElement('div');
    track.className = 'timeline-track';

    groups.forEach(({ label, tasks }) => {
        const milestone = document.createElement('div');
        milestone.className = 'timeline-milestone';

        const node = document.createElement('div');
        node.className = 'timeline-node';
        milestone.appendChild(node);

        const chip = document.createElement('div');
        chip.className = 'timeline-date-chip';
        chip.textContent = label;
        milestone.appendChild(chip);

        const list = document.createElement('div');
        list.className = 'timeline-milestone-tasks';
        tasks.forEach(task => {
            list.appendChild(createTimelineTaskCard(task, boardIndex));
        });
        milestone.appendChild(list);
        track.appendChild(milestone);
    });

    wrap.appendChild(track);
    return wrap;
}

function renderTimelineView() {
    const container = document.querySelector('#cards-container');
    if (!container) return;
    container.classList.remove('tables-view', 'reports-view', 'archive-view');
    container.classList.add('timeline-view');
    if (!boardsData || boardsData.length === 0) {
        container.innerHTML = '<div class="empty-message">Нет созданных досок</div>';
        return;
    }
    container.innerHTML = '';
    boardsData.forEach((board, boardIndex) => {
        const boardCard = document.createElement('div');
        boardCard.className = 'card board-timeline-card';
        boardCard.dataset.boardId = board.id;
        boardCard.dataset.boardIndex = boardIndex;

        const header = createCardHeader(board, boardIndex);
        boardCard.appendChild(header);

        const bodyWrap = document.createElement('div');
        bodyWrap.className = 'board-card-collapsible';

        const tasks = board.tasks || [];
        const validTasks = tasks.filter(t => t);
        if (validTasks.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-task';
            emptyMessage.textContent = 'Нет задач в этой доске';
            bodyWrap.appendChild(emptyMessage);
        } else {
            bodyWrap.appendChild(createBoardTimelineTrack(board, boardIndex, validTasks));
        }
        boardCard.appendChild(bodyWrap);
        wireBoardCardCollapse(header, board, bodyWrap);

        const addTaskForm = createAddTaskForm(board.id, boardIndex);
        boardCard.appendChild(addTaskForm);

        container.appendChild(boardCard);
    });
    initBoardDragAndDrop();
    initBoardEvents();
}

function formatArchivedTimestamp(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderReportsView() {
    const container = document.querySelector('#cards-container');
    if (!container) return;
    container.classList.remove('tables-view', 'timeline-view', 'archive-view');
    container.classList.add('reports-view');

    const demoSummary = {
        boardCount: 6,
        totalActive: 38,
        totalArchived: 214,
        urgentActive: 5,
        noDueActive: 9
    };

    const membersForDemo = teamMembers.length
        ? teamMembers
        : [
              { name: 'Лев Аксенов', avatar: 'lev_aksenov.jpg', role: 'Tech Lead' },
              { name: 'Дарья Швед', avatar: 'dar_shved.jpg', role: 'Дизайнер' }
          ];

    const card = document.createElement('div');
    card.className = 'card board-reports-card';

    const header = document.createElement('div');
    header.className = 'tasks-header flex-row-between';
    header.innerHTML = '<p class="text-header">Отчёт по проекту</p>';
    card.appendChild(header);

    const summary = document.createElement('div');
    summary.className = 'reports-summary';
    summary.innerHTML = `
        <div class="reports-summary-grid">
            <div class="reports-stat-chip">
                <span class="reports-stat-value">${demoSummary.boardCount}</span>
                <span class="reports-stat-label">досок</span>
            </div>
            <div class="reports-stat-chip">
                <span class="reports-stat-value">${demoSummary.totalActive}</span>
                <span class="reports-stat-label">активных задач</span>
            </div>
            <div class="reports-stat-chip">
                <span class="reports-stat-value">${demoSummary.totalArchived}</span>
                <span class="reports-stat-label">в архиве (завершено)</span>
            </div>
            <div class="reports-stat-chip">
                <span class="reports-stat-value">${demoSummary.urgentActive}</span>
                <span class="reports-stat-label">срочных в работе</span>
            </div>
            <div class="reports-stat-chip">
                <span class="reports-stat-value">${demoSummary.noDueActive}</span>
                <span class="reports-stat-label">без срока (активные)</span>
            </div>
        </div>
        <p class="reports-hint text-signature">Сводка по всем доскам текущего проекта.</p>
    `;
    card.appendChild(summary);

    const gridWrap = document.createElement('div');
    gridWrap.className = 'tasks-grid-wrapper';
    const grid = document.createElement('div');
    grid.className = 'tasks-grid reports-assignee-grid';

    const headerRow = document.createElement('div');
    headerRow.className = 'grid-header';
    const reportCols = [
        { key: 'member', title: 'Участник команды' },
        { key: 'archived', title: 'Завершено (в архиве)' },
        { key: 'active', title: 'Активных' },
        { key: 'total', title: 'Всего' },
        { key: 'rate', title: 'Доля завершённых' }
    ];
    reportCols.forEach(c => {
        const cell = document.createElement('div');
        cell.className = `col-${c.key}`;
        const titleSpan = document.createElement('span');
        titleSpan.className = 'header-title';
        titleSpan.textContent = c.title;
        cell.appendChild(titleSpan);
        headerRow.appendChild(cell);
    });
    grid.appendChild(headerRow);

    membersForDemo.forEach((member, i) => {
        const active = 3 + ((i * 2) % 7);
        const archived = 15 + i * 5;
        const total = active + archived;
        const rate = total > 0 ? Math.round((archived / total) * 100) : 0;

        const gridRow = document.createElement('div');
        gridRow.className = 'grid-row';

        const colMember = document.createElement('div');
        colMember.className = 'col-member';
        colMember.innerHTML = `
            <div class="user-img-text">
                <img src="/static/source/user_img/${escapeHtml(member.avatar)}" alt="">
                <div class="basic-and-signature">
                    <p class="text-basic">${escapeHtml(member.name)}</p>
                    <p class="text-signature">${escapeHtml(member.role || '')}</p>
                </div>
            </div>
        `;

        const colArchived = document.createElement('div');
        colArchived.className = 'col-archived';
        colArchived.innerHTML = `<p>${archived}</p>`;

        const colActive = document.createElement('div');
        colActive.className = 'col-active';
        colActive.innerHTML = `<p>${active}</p>`;

        const colTotal = document.createElement('div');
        colTotal.className = 'col-total';
        colTotal.innerHTML = `<p>${total}</p>`;

        const colRate = document.createElement('div');
        colRate.className = 'col-rate';
        colRate.innerHTML = `<p>${total ? `${rate}%` : '—'}</p>`;

        gridRow.append(colMember, colArchived, colActive, colTotal, colRate);
        grid.appendChild(gridRow);
    });

    gridWrap.appendChild(grid);
    card.appendChild(gridWrap);

    container.innerHTML = '';
    container.appendChild(card);
}

const ARCHIVE_GRID_COLUMNS = [
    { key: 'id', title: 'ID' },
    { key: 'name', title: 'Наименование' },
    { key: 'priority', title: 'Приоритет' },
    { key: 'dueDate', title: 'Срок' },
    { key: 'assignee', title: 'Исполнитель' },
    { key: 'archivedAt', title: 'Архивировано' },
    { key: 'actions', title: 'Действия' }
];

function createArchivedTaskNameCell(task, boardIndex, row) {
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
    nameSpan.textContent = task.name;
    topRow.appendChild(nameSpan);

    let subtasksList = null;
    let totalCount = 0;
    let completedCount = 0;
    let trigger = null;

    if (task.subtasks && task.subtasks.length > 0) {
        totalCount = task.subtasks.length;
        completedCount = task.subtasks.filter(st => st.completed).length;

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
                    <input type="checkbox" ${subtask.completed ? 'checked' : ''} disabled>
                    <span class="custom-checkbox"></span>
                    <span class="checkbox-text">${escapeHtml(subtask.name)}</span>
                </label>
            `;
            subtasksList.appendChild(subtaskItem);
        });

        trigger.addEventListener('click', () => {
            const isOpen = subtasksList.style.display === 'flex';
            subtasksList.style.display = isOpen ? 'none' : 'flex';
            trigger.classList.toggle('open', !isOpen);
            if (!isOpen) {
                row.classList.add('subtasks-open');
            } else {
                row.classList.remove('subtasks-open');
            }
        });
    }

    container.appendChild(topRow);
    if (subtasksList) container.appendChild(subtasksList);
    return container;
}

function createArchivedTaskRow(task, boardIndex) {
    const row = document.createElement('div');
    row.className = 'grid-row';
    row.dataset.taskId = task.id;
    row.dataset.boardIndex = boardIndex;

    ARCHIVE_GRID_COLUMNS.forEach(col => {
        const cell = document.createElement('div');
        cell.className = `col-${col.key}`;
        switch (col.key) {
            case 'id':
                cell.textContent = getTaskDisplayId(task);
                break;
            case 'name':
                cell.appendChild(createArchivedTaskNameCell(task, boardIndex, row));
                break;
            case 'priority': {
                const p = document.createElement('p');
                const pr = task.priority === 'срочно' ? 'срочно' : 'обычный';
                p.className = pr === 'срочно' ? 'priority-high' : 'priority-normal';
                p.textContent = pr === 'срочно' ? 'Срочно' : 'Обычный';
                cell.appendChild(p);
                break;
            }
            case 'dueDate': {
                const p = document.createElement('p');
                if (task.dueDate && String(task.dueDate).trim()) {
                    p.textContent = formatDueDate(task.dueDate);
                    if (parseDateBoard(task.dueDate) < new Date()) p.classList.add('overdue');
                } else {
                    p.textContent = '—';
                }
                cell.appendChild(p);
                break;
            }
            case 'assignee':
                if (task.assignee && String(task.assignee).trim()) {
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
                    cell.innerHTML = '<p class="text-basic">—</p>';
                }
                break;
            case 'archivedAt': {
                const p = document.createElement('p');
                p.textContent = formatArchivedTimestamp(task.archivedDate);
                cell.appendChild(p);
                break;
            }
            case 'actions': {
                const wrap = document.createElement('div');
                wrap.className = 'archive-row-actions';
                const btnRestore = document.createElement('button');
                btnRestore.type = 'button';
                btnRestore.className = 'button-small';
                btnRestore.textContent = 'Вернуть';
                btnRestore.addEventListener('click', () => restoreFromArchive(boardIndex, task.id));
                const btnCopy = document.createElement('button');
                btnCopy.type = 'button';
                btnCopy.className = 'button-small';
                btnCopy.textContent = 'Копия';
                btnCopy.addEventListener('click', () => copyArchivedTask(boardIndex, task.id));
                wrap.append(btnRestore, btnCopy);
                cell.appendChild(wrap);
                break;
            }
            default:
                break;
        }
        row.appendChild(cell);
    });

    return row;
}

function createArchiveTasksGrid(board, boardIndex) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tasks-grid-wrapper';
    const grid = document.createElement('div');
    grid.className = 'tasks-grid archive-tasks-grid';

    const archived = (board.archivedTasks || []).filter(t => t);
    if (archived.length === 0) {
        wrapper.innerHTML = '<div class="empty-state">В архиве этой доски пусто</div>';
        return wrapper;
    }

    const headerRow = document.createElement('div');
    headerRow.className = 'grid-header';
    ARCHIVE_GRID_COLUMNS.forEach(col => {
        const cell = document.createElement('div');
        cell.className = `col-${col.key}`;
        const titleSpan = document.createElement('span');
        titleSpan.className = 'header-title';
        titleSpan.textContent = col.title;
        cell.appendChild(titleSpan);
        headerRow.appendChild(cell);
    });
    grid.appendChild(headerRow);

    archived.forEach(task => {
        grid.appendChild(createArchivedTaskRow(task, boardIndex));
    });

    wrapper.appendChild(grid);
    return wrapper;
}

function createArchiveBoardSection(board, boardIndex) {
    const section = document.createElement('div');
    section.className = 'card board-archive-section';
    section.dataset.boardId = board.id;
    section.dataset.boardIndex = boardIndex;

    const archivedCount = (board.archivedTasks || []).filter(t => t).length;
    const collapsed = isBoardArchiveCollapsed(board.id);

    const head = document.createElement('div');
    head.className = 'archive-board-head tasks-header flex-row-between';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'archive-collapse-toggle';
    if (!collapsed) toggle.classList.add('open');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

    const arrow = document.createElement('span');
    arrow.className = 'archive-collapse-arrow';
    arrow.setAttribute('aria-hidden', 'true');

    const titleBlock = document.createElement('span');
    titleBlock.className = 'archive-board-title text-header';
    titleBlock.textContent = board.name;

    const badge = document.createElement('span');
    badge.className = 'num-of-tasks';
    badge.textContent = String(archivedCount);

    toggle.append(arrow, titleBlock, badge);

    head.appendChild(toggle);
    section.appendChild(head);

    const body = document.createElement('div');
    body.className = 'archive-board-body';
    body.style.display = collapsed ? 'none' : '';
    body.appendChild(createArchiveTasksGrid(board, boardIndex));
    section.appendChild(body);

    toggle.addEventListener('click', () => {
        const isOpen = toggle.classList.toggle('open');
        body.style.display = isOpen ? '' : 'none';
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        setBoardArchiveCollapsed(board.id, !isOpen);
    });

    return section;
}

function renderArchiveView() {
    const container = document.querySelector('#cards-container');
    if (!container) return;
    container.classList.remove('tables-view', 'timeline-view', 'reports-view');
    container.classList.add('archive-view');
    if (!boardsData || boardsData.length === 0) {
        container.innerHTML = '<div class="empty-message">Нет созданных досок</div>';
        return;
    }
    container.innerHTML = '';
    boardsData.forEach((board, boardIndex) => {
        container.appendChild(createArchiveBoardSection(board, boardIndex));
    });
}

function restoreFromArchive(boardIndex, taskId) {
    const board = boardsData[boardIndex];
    if (!board || !board.archivedTasks) return;
    const idx = board.archivedTasks.findIndex(t => t && Number(t.id) === Number(taskId));
    if (idx === -1) return;
    const task = board.archivedTasks.splice(idx, 1)[0];
    delete task.archivedDate;
    if (task.subtasks && task.subtasks.length) {
        task.subtasks = task.subtasks.map(st => ({
            ...st,
            completed: false
        }));
    }
    if (!board.tasks) board.tasks = [];
    board.tasks.push(task);
    saveBoardsToLocalStorage();
    renderCurrentView();
    initBoardEvents();
    initViewSwitching();
    showToast('Задача возвращена из архива');
}

function copyArchivedTask(boardIndex, taskId) {
    const board = boardsData[boardIndex];
    if (!board || !board.archivedTasks) return;
    const archived = board.archivedTasks.find(t => t && Number(t.id) === Number(taskId));
    if (!archived) return;
    const copy = JSON.parse(JSON.stringify(archived));
    delete copy.archivedDate;
    const idPool = [
        ...(board.tasks || []).map(t => t.id),
        ...(board.archivedTasks || []).map(t => t.id)
    ].filter(id => typeof id === 'number');
    const maxId = idPool.length ? Math.max(...idPool) : 0;
    copy.id = maxId + 1;
    if (Array.isArray(copy.subtasks)) {
        copy.subtasks = copy.subtasks.map(st => ({ name: st.name, completed: false }));
    }
    if (!board.tasks) board.tasks = [];
    board.tasks.push(copy);
    saveBoardsToLocalStorage();
    renderCurrentView();
    initBoardEvents();
    initViewSwitching();
    showToast(`Копия задачи «${copy.name}» добавлена на доску`);
}

let draggedBoard = null;

function initBoardDragAndDrop() {
    const handles = document.querySelectorAll('#cards-container .board-drag-handle');
    handles.forEach(handle => {
        handle.setAttribute('draggable', 'true');
        handle.removeEventListener('dragstart', handleBoardDragStart);
        handle.removeEventListener('dragend', handleBoardDragEnd);
        handle.removeEventListener('dragover', handleBoardDragOver);
        handle.removeEventListener('dragleave', handleBoardDragLeave);
        handle.removeEventListener('drop', handleBoardDrop);
        handle.addEventListener('dragstart', handleBoardDragStart);
        handle.addEventListener('dragend', handleBoardDragEnd);
        handle.addEventListener('dragover', handleBoardDragOver);
        handle.addEventListener('dragleave', handleBoardDragLeave);
        handle.addEventListener('drop', handleBoardDrop);
    });
}

function handleBoardDragStart(e) {
    if (!e.target.closest('.board-drag-handle')) {
        e.preventDefault();
        return false;
    }
    const handle = e.currentTarget;
    const card = handle.closest('.card');
    if (!card) return;
    draggedBoard = card;
    const boardId = parseInt(card.dataset.boardId);
    const boardName = card.querySelector('.text-header')?.textContent;
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', boardId);
    e.dataTransfer.effectAllowed = 'move';
    const ghost = card.cloneNode(true);
    ghost.style.position = 'absolute';
    ghost.style.top = '-1000px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 10, 10);
    setTimeout(() => document.body.removeChild(ghost), 0);
}

function handleBoardDragEnd(e) {
    if (draggedBoard) {
        const boardName = draggedBoard.querySelector('.text-header')?.textContent;
        draggedBoard.classList.remove('dragging');
        draggedBoard = null;
    }
    document.querySelectorAll('#cards-container .card').forEach(card => {
        card.classList.remove('drag-over');
    });
}

function handleBoardDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetHandle = e.currentTarget;
    const targetBoard = targetHandle.closest('.card');
    if (!targetBoard || targetBoard === draggedBoard) return;
    targetBoard.classList.add('drag-over');
}

function handleBoardDragLeave(e) {
    const targetHandle = e.currentTarget;
    const targetBoard = targetHandle.closest('.card');
    if (targetBoard) targetBoard.classList.remove('drag-over');
}

function handleBoardDrop(e) {
    e.preventDefault();
    const targetHandle = e.currentTarget;
    const targetBoard = targetHandle.closest('.card');
    if (!targetBoard) return;
    targetBoard.classList.remove('drag-over');
    if (!draggedBoard || draggedBoard === targetBoard) return;
    const fromId = parseInt(draggedBoard.dataset.boardId);
    const toId = parseInt(targetBoard.dataset.boardId);
    const fromIndex = boardsData.findIndex(b => b.id === fromId);
    let toIndex = boardsData.findIndex(b => b.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const rect = targetBoard.getBoundingClientRect();
    const mouseY = e.clientY;
    let insertBefore = mouseY < rect.top + rect.height / 2;
    if (fromIndex < toIndex && insertBefore) insertBefore = false;
    if (fromIndex > toIndex && !insertBefore) insertBefore = true;
    const movedBoard = boardsData.splice(fromIndex, 1)[0];
    let newToIndex = toIndex;
    if (fromIndex < toIndex) newToIndex = toIndex - 1;
    let insertIndex = insertBefore ? newToIndex : newToIndex + 1;
    boardsData.splice(insertIndex, 0, movedBoard);
    saveBoardsToLocalStorage();
    renderCurrentView();
}

function updateCardsDataset() {
    const allCards = document.querySelectorAll('#cards-container .card');
    allCards.forEach((card, idx) => {
        card.dataset.originalIndex = idx;
    });
}

function findBoardIndexById(boardId) {
    return boardsData.findIndex(board => board.id === boardId);
}

function findBoardDomIndexByBoardId(boardId) {
    const cards = document.querySelectorAll('#cards-container .card');
    for (let i = 0; i < cards.length; i++) {
        if (parseInt(cards[i].dataset.boardId) === boardId) {
            return i;
        }
    }
    return -1;
}

function moveTaskBetweenBoards(sourceBoardId, targetBoardId, taskId) {
    const sourceBoardIndex = findBoardIndexById(sourceBoardId);
    const targetBoardIndex = findBoardIndexById(targetBoardId);
    if (sourceBoardIndex === -1 || targetBoardIndex === -1) return;
    const sourceBoard = boardsData[sourceBoardIndex];
    const targetBoard = boardsData[targetBoardIndex];
    const taskIndex = sourceBoard.tasks.findIndex(t => t && Number(t.id) === Number(taskId));
    if (taskIndex === -1) return;
    const movedTask = sourceBoard.tasks.splice(taskIndex, 1)[0];
    if (!targetBoard.tasks) targetBoard.tasks = [];
    targetBoard.tasks.push(movedTask);
    saveBoardsToLocalStorage();
    const sourceDomIndex = findBoardDomIndexByBoardId(sourceBoardId);
    const targetDomIndex = findBoardDomIndexByBoardId(targetBoardId);
    updateBoardsInDOM(sourceDomIndex, targetDomIndex);
    showToast(`Задача "${movedTask.name}" перемещена в доску "${targetBoard.name}"`);
}

function updateBoardsInDOM(boardIndex1, boardIndex2) {
    const cardsContainer = document.querySelector('#cards-container');
    if (!cardsContainer) return;
    const board1 = boardsData[boardIndex1];
    const board1Card = cardsContainer.querySelector(`.card[data-board-index="${boardIndex1}"]`);
    if (board1Card && board1 && board1.tasks) {
        const validTasks = board1.tasks.filter(t => t);
        const newBoard1Card = createBoardCard(board1, boardIndex1, sortTasksByPriorityAndDate(validTasks));
        board1Card.replaceWith(newBoard1Card);
    }
    const board2 = boardsData[boardIndex2];
    const board2Card = cardsContainer.querySelector(`.card[data-board-index="${boardIndex2}"]`);
    if (board2Card && board2 && board2.tasks) {
        const validTasks = board2.tasks.filter(t => t);
        const newBoard2Card = createBoardCard(board2, boardIndex2, sortTasksByPriorityAndDate(validTasks));
        board2Card.replaceWith(newBoard2Card);
    }
    updateCardsDataset();
    setTimeout(() => {
        reinitBoardAndTaskHandlers();
    }, 50);
}

function createCardHeader(board, boardIndex) {
    const header = document.createElement('div');
    header.className = 'tasks-header flex-row-between';

    const leftWrap = document.createElement('div');
    leftWrap.className = 'board-header-left';

    const collapsed = isBoardSectionCollapsed(board.id);
    const collapseToggle = document.createElement('button');
    collapseToggle.type = 'button';
    collapseToggle.className = 'archive-collapse-toggle board-section-collapse-toggle';
    if (!collapsed) collapseToggle.classList.add('open');
    collapseToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    collapseToggle.setAttribute('aria-label', 'Свернуть или развернуть содержимое доски');
    const arrow = document.createElement('span');
    arrow.className = 'archive-collapse-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    collapseToggle.appendChild(arrow);

    const dragHandle = document.createElement('div');
    dragHandle.className = 'board-drag-handle';
    dragHandle.setAttribute('draggable', 'true');
    dragHandle.style.cursor = 'grab';
    dragHandle.style.display = 'flex';
    dragHandle.style.alignItems = 'center';
    dragHandle.style.gap = '0.375rem';
    const taskheaderCount = document.createElement('div');
    taskheaderCount.className = 'taskheader-count';
    taskheaderCount.innerHTML = `
        <p class="text-header">${escapeHtml(board.name)}</p>
        <div class="num-of-tasks">${board.tasks ? board.tasks.filter(t => t).length : 0}</div>
    `;
    dragHandle.appendChild(taskheaderCount);
    leftWrap.appendChild(collapseToggle);
    leftWrap.appendChild(dragHandle);
    header.appendChild(leftWrap);
    header._collapseToggle = collapseToggle;
    header._collapsedInitially = collapsed;

    const info = document.createElement('div');
    info.className = 'info';
    info.style.position = 'relative';
    info.innerHTML = `
        <ul class="gap-24 flex-row">
            <li class="more-actions" data-board-index="${boardIndex}">
                <img class="h-32" src="/static/source/icons/info.svg" alt="Действия">
            </li>
        </ul>
    `;
    header.appendChild(info);
    const dropdownMenu = createDropdownMenu(board, boardIndex);
    header.appendChild(dropdownMenu);
    header.dragHandle = dragHandle;
    return header;
}

function createDropdownMenu(board, boardIndex) {
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown-menu border-dark-1 br-5';
    dropdown.id = `actionsMenu-${boardIndex}`;
    dropdown.innerHTML = `
        <div class="dropdown-header">
            <p class="text-header">Настройка доски</p>
            <button class="dropdown-close">
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
            <li class="dropdown-item text-basic" data-action="clone">
                <span>Клонировать доску</span>
            </li>
            <li class="dropdown-item text-basic" data-action="copy-link">
                <span>Скопировать ссылку</span>
            </li>
            <li class="dropdown-item text-basic" data-action="board-export-json">
                <span>Экспорт данных (JSON)</span>
            </li>
            <li class="dropdown-item text-basic pink" data-action="archive-board">
                <span>Архивировать доску</span>
            </li>
        </ul>
    `;
    return dropdown;
}

function initTableRowsSortable() {
    const containers = document.querySelectorAll('#cards-container .board-table-card .table-rows');
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
        if (container._listTableRowStyleRaf) cancelAnimationFrame(container._listTableRowStyleRaf);
        container._listTableRowStyleRaf = null;

        let tries = 0;
        const startWhenReady = () => {
            const fallback = container._listTableRowDragEl || document.querySelector(`.${TABLE_ROW_FALLBACK_CLASS}`);
            if (!fallback) {
                tries += 1;
                if (tries < 20) setTimeout(startWhenReady, 16);
                return;
            }

            const tick = () => {
                const fb = container._listTableRowDragEl || document.querySelector(`.${TABLE_ROW_FALLBACK_CLASS}`);
                if (!fb) return;
                if (container._listTableRowCtxHtml && fb.innerHTML !== container._listTableRowCtxHtml) {
                    fb.innerHTML = container._listTableRowCtxHtml;
                }
                applyTableRowComputedStylesToClone(row, fb, { isFallback: true });
                fb.style.setProperty('margin', '0', 'important');
                fb.style.setProperty('margin-top', '0', 'important');
                fb.style.setProperty('margin-right', '0', 'important');
                fb.style.setProperty('margin-bottom', '0', 'important');
                fb.style.setProperty('margin-left', '0', 'important');
                container._listTableRowStyleRaf = requestAnimationFrame(tick);
            };
            container._listTableRowStyleRaf = requestAnimationFrame(tick);
        };

        setTimeout(startWhenReady, 0);
    };
    containers.forEach(container => {
        const boardCard = container.closest('.board-table-card');
        const boardId = parseInt(boardCard.dataset.boardId);
        if (container.sortable) {
            container.sortable.destroy();
        }
        const cardsContainer = document.querySelector('#cards-container');
        const sortable = new Sortable(container, {
            animation: 0,
            group: {
                name: 'table-tasks',
                pull: true,
                revertClone: false,
                sort: true
            },
            handle: '.grid-row',
            draggable: '.grid-row',
            ghostClass: '',
            dragClass: '',
            forceFallback: true,
            fallbackOnBody: true,
            fallbackTolerance: 0,
            fallbackClass: TABLE_ROW_FALLBACK_CLASS,
            onClone(evt) {
                container._listTableRowDragEl = evt.clone;
                evt.clone?.classList?.add(TABLE_ROW_FALLBACK_CLASS);
                container._listTableRowCtxHtml = buildFallbackRowInnerHtml(evt.item);
                evt.clone.innerHTML = container._listTableRowCtxHtml;
                evt.clone.style.setProperty('background', 'transparent');
                evt.clone.style.setProperty('border', 'none');
                evt.clone.style.setProperty('padding', '0');
                evt.clone.style.setProperty('display', 'grid');
                evt.clone.style.setProperty('box-sizing', 'border-box');
                evt.clone.style.setProperty('pointer-events', 'none');
                applyTableRowComputedStylesToClone(evt.item, evt.clone, { isFallback: true });
            },
            onStart: function(evt) {
                if (cardsContainer) cardsContainer.classList.add('dragging-active');
                freezeFallbackStyles(container, evt.item);
            },
            onEnd: function(evt) {
                if (cardsContainer) cardsContainer.classList.remove('dragging-active');
                if (container._listTableRowStyleRaf) cancelAnimationFrame(container._listTableRowStyleRaf);
                container._listTableRowStyleRaf = null;
                container._listTableRowDragEl = null;
                container._listTableRowCtxHtml = null;
                const fromContainer = evt.from;
                const toContainer = evt.to;
                const fromBoardCard = fromContainer.closest('.board-table-card');
                const toBoardCard = toContainer.closest('.board-table-card');
                const fromBoardId = parseInt(fromBoardCard.dataset.boardId);
                const toBoardId = parseInt(toBoardCard.dataset.boardId);
                const draggedRow = evt.item;
                const taskId = parseInt(draggedRow.dataset.taskId);
                if (!taskId) return;
                if (fromBoardId === toBoardId) {
                    const rows = Array.from(toContainer.children);
                    const newOrder = rows.map(row => parseInt(row.dataset.taskId)).filter(id => id);
                    const board = boardsData.find(b => b.id === toBoardId);
                    if (board) {
                        const newTasks = [];
                        for (const id of newOrder) {
                            const task = board.tasks.find(t => t.id === id);
                            if (task) newTasks.push(task);
                        }
                        if (newTasks.length === board.tasks.length) {
                            board.tasks = newTasks;
                            saveBoardsToLocalStorage();
                            showToast('Порядок задач изменён');
                        }
                    }
                } else {
                    const sourceBoard = boardsData.find(b => b.id === fromBoardId);
                    const targetBoard = boardsData.find(b => b.id === toBoardId);
                    const taskIndex = sourceBoard.tasks.findIndex(t => t.id === taskId);
                    if (taskIndex !== -1) {
                        const movedTask = sourceBoard.tasks.splice(taskIndex, 1)[0];
                        targetBoard.tasks.push(movedTask);
                        saveBoardsToLocalStorage();
                        renderCurrentView();
                        showToast(`Задача "${movedTask.name}" перемещена в доску "${targetBoard.name}"`);
                    }
                }
            }
            ,
            onCancel: function() {
                if (cardsContainer) cardsContainer.classList.remove('dragging-active');
            }
        });
        container.sortable = sortable;
    });
}

function initTaskSortable(container, boardId) {
    if (!container) return;
    if (container.sortable) {
        container.sortable.destroy();
        delete container.sortable;
    }
    const cardsContainer = document.querySelector('#cards-container');
    let __dragAnimId = null;
    let __dragging = false;
    let __dragFallbackHtml = '';
    let __dragFallbackWidth = '';

    const buildKanbanCloneHtmlForTask = (task) => {
        const stageCol = document.createElement('div');
        stageCol.className = 'kanban-stage-col';

        const kanbanCard = document.createElement('div');
        kanbanCard.className = 'item kanban-task-item';
        kanbanCard.dataset.taskId = task.id;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'text-basic';
        nameSpan.textContent = task.name;
        kanbanCard.appendChild(nameSpan);

        if (task.subtasks && task.subtasks.length > 0) {
            const completedCount = task.subtasks.filter(st => st.completed).length;
            const totalCount = task.subtasks.length;
            const percent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
            const subtasksBlock = document.createElement('div');
            subtasksBlock.className = 'subtasks text-signature';
            subtasksBlock.innerHTML = `
                <div class="count">
                    <p class="name">Подзадачи</p>
                    <p>${completedCount} / ${totalCount}</p>
                </div>
                <div class="progress-line">
                    <div class="completed" style="width: ${percent}%;"></div>
                    <div class="todo" style="width: ${100 - percent}%;"></div>
                </div>
            `;
            kanbanCard.appendChild(subtasksBlock);
        }

        const hasAssignee = task.assignee && String(task.assignee).trim();
        const hasDueDate = task.dueDate && String(task.dueDate).trim();
        if (hasAssignee || hasDueDate) {
            const tag = document.createElement('div');
            tag.className = 'tag';
            if (hasAssignee) {
                const executor = document.createElement('div');
                executor.className = 'executor';
                executor.innerHTML = `<img src="/static/source/user_img/${escapeHtml(task.assigneeAvatar || 'basic_avatar.png')}" alt="${escapeHtml(task.assignee)}">`;
                tag.appendChild(executor);
            }
            if (hasDueDate) {
                const deadlineDiv = document.createElement('div');
                deadlineDiv.className = 'deadline';
                deadlineDiv.textContent = formatDueDate(task.dueDate);
                tag.appendChild(deadlineDiv);
            }
            kanbanCard.appendChild(tag);
        }

        stageCol.appendChild(kanbanCard);
        return stageCol.outerHTML;
    };

    const startFallbackSync = () => {
        if (__dragAnimId) cancelAnimationFrame(__dragAnimId);

        const tick = () => {
            if (!__dragging) return;
            const fb = document.querySelector('.sortable-fallback');
            if (fb) {
                fb.classList.add('kanban-board-card');
                if (__dragFallbackWidth) fb.style.width = __dragFallbackWidth;
                fb.style.boxSizing = 'border-box';
                fb.style.pointerEvents = 'none';
                fb.style.border = 'none';

                if (__dragFallbackHtml && fb.innerHTML !== __dragFallbackHtml) {
                    fb.innerHTML = __dragFallbackHtml;
                }
            }
            __dragAnimId = requestAnimationFrame(tick);
        };
        __dragAnimId = requestAnimationFrame(tick);
    };

    const stopFallbackSync = () => {
        __dragging = false;
        if (__dragAnimId) cancelAnimationFrame(__dragAnimId);
        __dragAnimId = null;
        __dragFallbackHtml = '';
        __dragFallbackWidth = '';
    };

    const sortable = new Sortable(container, {
        animation: 150,
        group: { name: 'tasks', pull: true, put: true },
        handle: '.item',
        draggable: '.item',
        ghostClass: '',
        dragClass: '',
        chosenClass: '',
        forceFallback: true,
        fallbackOnBody: true,
        fallbackTolerance: 0,
        onStart: function() {
            if (cardsContainer) cardsContainer.classList.add('dragging-active');
            __dragging = true;
            startFallbackSync();
        },
        onClone: function(evt) {
            const item = evt.item;
            const clone = evt.clone;
            if (!item || !clone) return;

            const taskId = parseInt(item.dataset.taskId);
            if (!taskId) return;

            let task = null;
            for (const b of boardsData) {
                const t = (b.tasks || []).find(x => x && x.id === taskId);
                if (t) {
                    task = t;
                    break;
                }
            }
            if (!task) return;

            const kanbanCard = document.createElement('div');
            kanbanCard.className = 'item kanban-task-item';
            kanbanCard.dataset.taskId = task.id;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'text-basic';
            nameSpan.textContent = task.name;
            kanbanCard.appendChild(nameSpan);

            if (task.subtasks && task.subtasks.length > 0) {
                const completedCount = task.subtasks.filter(st => st.completed).length;
                const totalCount = task.subtasks.length;
                const percent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
                const subtasksBlock = document.createElement('div');
                subtasksBlock.className = 'subtasks text-signature';
                subtasksBlock.innerHTML = `
                    <div class="count">
                        <p class="name">Подзадачи</p>
                        <p>${completedCount} / ${totalCount}</p>
                    </div>
                    <div class="progress-line">
                        <div class="completed" style="width: ${percent}%;"></div>
                        <div class="todo" style="width: ${100 - percent}%;"></div>
                    </div>
                `;
                kanbanCard.appendChild(subtasksBlock);
            }

            const hasAssignee = task.assignee && String(task.assignee).trim();
            const hasDueDate = task.dueDate && String(task.dueDate).trim();
            if (hasAssignee || hasDueDate) {
                const tag = document.createElement('div');
                tag.className = 'tag';
                if (hasAssignee) {
                    const executor = document.createElement('div');
                    executor.className = 'executor';
                    executor.innerHTML = `<img src="/static/source/user_img/${escapeHtml(task.assigneeAvatar || 'basic_avatar.png')}" alt="${escapeHtml(task.assignee)}">`;
                    tag.appendChild(executor);
                }
                if (hasDueDate) {
                    const deadlineDiv = document.createElement('div');
                    deadlineDiv.className = 'deadline';
                    deadlineDiv.textContent = formatDueDate(task.dueDate);
                    tag.appendChild(deadlineDiv);
                }
                kanbanCard.appendChild(tag);
            }

            const scopeCard = document.createElement('div');
            scopeCard.className = 'kanban-board-card';
            const scopeCol = document.createElement('div');
            scopeCol.className = 'kanban-stage-col';
            scopeCol.appendChild(kanbanCard);
            scopeCard.appendChild(scopeCol);

            __dragFallbackHtml = scopeCard.innerHTML;
            __dragFallbackWidth = `${item.getBoundingClientRect().width}px`;

            clone.className = 'kanban-board-card';
            clone.innerHTML = __dragFallbackHtml;
            clone.style.width = __dragFallbackWidth;
            clone.style.boxSizing = 'border-box';
            clone.style.pointerEvents = 'none';
        },
        onEnd: function(evt) {
            if (cardsContainer) cardsContainer.classList.remove('dragging-active');
            stopFallbackSync();
            const fromList = evt.from;
            const toList = evt.to;
            const fromBoard = fromList.closest('.card');
            const toBoard = toList.closest('.card');
            const fromBoardId = parseInt(fromBoard.dataset.boardId);
            const toBoardId = parseInt(toBoard.dataset.boardId);
            const draggedItem = evt.item;
            const taskId = parseInt(draggedItem.dataset.taskId);
            if (fromBoardId === toBoardId) {
                const items = Array.from(toList.children);
                const newOrder = items.map(item => parseInt(item.dataset.taskId));
                const board = boardsData.find(b => b.id === toBoardId);
                if (board) {
                    const newTasks = [];
                    for (const id of newOrder) {
                        const task = board.tasks.find(t => t.id === id);
                        if (task) newTasks.push(task);
                    }
                    if (newTasks.length === board.tasks.length) {
                        board.tasks = newTasks;
                        saveBoardsToLocalStorage();
                        showToast('Порядок задач изменён');
                    }
                }
            } else {
                const sourceBoard = boardsData.find(b => b.id === fromBoardId);
                const targetBoard = boardsData.find(b => b.id === toBoardId);
                const taskIndex = sourceBoard.tasks.findIndex(t => t.id === taskId);
                if (taskIndex !== -1) {
                    const movedTask = sourceBoard.tasks.splice(taskIndex, 1)[0];
                    targetBoard.tasks.push(movedTask);
                    saveBoardsToLocalStorage();
                    renderCurrentView();
                    showToast(`Задача "${movedTask.name}" перемещена в доску "${targetBoard.name}"`);
                }
            }
        },
        onCancel: function() {
            if (cardsContainer) cardsContainer.classList.remove('dragging-active');
            stopFallbackSync();
        }
    });
    container.sortable = sortable;
}

function createTaskItem(task, boardIndex, taskIndex) {
    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.taskId = task.id;
    item.dataset.taskIndex = taskIndex;
    const board = boardsData[boardIndex];
    const boardId = board ? board.id : boardIndex;
    item.dataset.boardId = boardId;

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '0.375rem';

    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'checkbox-item';
    checkboxLabel.style.margin = '0';
    checkboxLabel.style.cursor = 'pointer';
    checkboxLabel.innerHTML = `
        <input type="checkbox" data-task-id="${task.id}" ${task.archived ? 'checked disabled' : ''}>
        <span class="custom-checkbox"></span>
    `;
    const checkbox = checkboxLabel.querySelector('input');
    checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
            archiveTask(boardIndex, task.id, true);
        }
    });
    checkbox.setAttribute('draggable', 'false');
    row.appendChild(checkboxLabel);

    const textSpan = document.createElement('span');
    textSpan.className = 'checkbox-text'; 
    textSpan.textContent = escapeHtml(task.name);
    textSpan.style.cursor = 'default';
    row.appendChild(textSpan);

    item.appendChild(row);

    if (task.subtasks && task.subtasks.length > 0) {
        const subtasksBlock = createSubtasksBlock(task);
        item.appendChild(subtasksBlock);
    }

    const tagBlock = createTagBlock(task);
    if (tagBlock) {
        item.appendChild(tagBlock);
    }

    return item;
}
function createSubtasksBlock(task) {
    const subtasksBlock = document.createElement('div');
    subtasksBlock.className = 'subtasks text-signature';
    const completedCount = task.subtasks.filter(st => st.completed).length;
    const totalCount = task.subtasks.length;
    const percent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
    subtasksBlock.innerHTML = `
        <div class="count">
            <p class="name">Подзадачи</p>
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
    
    task.subtasks.forEach(subtask => {
        const subtaskItem = document.createElement('div');
        subtaskItem.className = 'subtask-item';
        subtaskItem.innerHTML = `
            <label class="checkbox-item">
                <input type="checkbox" ${subtask.completed ? 'checked' : ''}>
                <span class="custom-checkbox"></span>
                <span class="checkbox-text">${escapeHtml(subtask.name)}</span>
            </label>
        `;
        const subtaskCheckbox = subtaskItem.querySelector('input');
        subtaskCheckbox.addEventListener('change', (e) => {
            subtask.completed = e.target.checked;
            updateSubtasksProgress(task);
            
            const allCompleted = task.subtasks.every(st => st.completed);
            if (allCompleted && task.subtasks.length > 0) {
                let boardIndex = null;
                let taskIndex = null;
                for (let bi = 0; bi < boardsData.length; bi++) {
                    const idx = boardsData[bi].tasks.findIndex(t => t.id === task.id);
                    if (idx !== -1) {
                        boardIndex = bi;
                        taskIndex = idx;
                        break;
                    }
                }
                if (boardIndex !== null && taskIndex !== null) {
                    archiveTask(boardIndex, task.id, true);
                }
            }
        });
        subtasksList.appendChild(subtaskItem);
    });
    subtasksBlock.appendChild(subtasksList);
    const nameElement = subtasksBlock.querySelector('.name');
    nameElement.style.cursor = 'pointer';
    nameElement.addEventListener('click', () => {
        const isOpen = subtasksList.style.display === 'flex';
        subtasksList.style.display = isOpen ? 'none' : 'flex';
        if (isOpen) {
            nameElement.classList.remove('open');
        } else {
            nameElement.classList.add('open');
        }
    });
    return subtasksBlock;
}

function updateSubtasksProgress(task) {
    const completedCount = task.subtasks.filter(st => st.completed).length;
    const totalCount = task.subtasks.length;
    const percent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
    const allCards = document.querySelectorAll('.board-list .card');
    for (const card of allCards) {
        const hosts = card.querySelectorAll('.item, .timeline-task-card');
        for (const host of hosts) {
            if (host.dataset.taskId == task.id) {
                const progressCompleted = host.querySelector('.progress-line .completed');
                const progressTodo = host.querySelector('.progress-line .todo');
                const countText = host.querySelector('.count p:last-child');
                if (progressCompleted) progressCompleted.style.width = `${percent}%`;
                if (progressTodo) progressTodo.style.width = `${100 - percent}%`;
                if (countText) countText.textContent = `${completedCount} / ${totalCount}`;
                break;
            }
        }
    }
}

function createTagBlock(task) {
    const hasAssignee = task.assignee && task.assignee.trim();
    const hasPriority = task.priority && (task.priority === 'срочно' || task.priority === 'обычный');
    const hasDueDate = task.dueDate && task.dueDate.trim();
    if (!hasAssignee && !hasPriority && !hasDueDate) return null;
    const tagBlock = document.createElement('div');
    tagBlock.className = 'tag';
    if (hasAssignee) {
        const executor = document.createElement('div');
        executor.className = 'executor';
        executor.innerHTML = `
            <img src="/static/source/user_img/${task.assigneeAvatar || 'basic_avatar.png'}" alt="${escapeHtml(task.assignee)}">
        `;
        tagBlock.appendChild(executor);
    }
    if (hasPriority) {
        const priorityClass = task.priority === 'срочно' ? 'priority-high' : 'priority-normal';
        const priorityText = task.priority === 'срочно' ? 'C' : 'О';
        const priorityDiv = document.createElement('div');
        priorityDiv.className = priorityClass;
        priorityDiv.textContent = priorityText;
        tagBlock.appendChild(priorityDiv);
    }
    if (hasDueDate) {
        const deadlineDiv = document.createElement('div');
        deadlineDiv.className = 'deadline';
        deadlineDiv.textContent = formatDueDate(task.dueDate);
        tagBlock.appendChild(deadlineDiv);
    }
    return tagBlock;
}

function archiveTask(boardIndex, taskId, isArchived) {
    console.log('archiveTask вызван', boardIndex, taskId, isArchived);
    const board = boardsData[boardIndex];
    if (!board) {
        console.error('Доска не найдена', boardIndex);
        return;
    }
    const taskIndex = board.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
        console.error('Задача не найдена', taskId);
        return;
    }
    if (isArchived) {
        if (!board.archivedTasks) board.archivedTasks = [];
        const taskToArchive = { ...board.tasks[taskIndex] };
        if (taskToArchive.subtasks && taskToArchive.subtasks.length) {
            taskToArchive.subtasks = taskToArchive.subtasks.map(st => ({
                ...st,
                completed: true
            }));
        }
        board.archivedTasks.push({ ...taskToArchive, archivedDate: new Date().toISOString() });
        board.tasks.splice(taskIndex, 1);
    }
    saveBoardsToLocalStorage();
    renderCurrentView();
    initBoardEvents();
    showToast(isArchived ? 'Задача перемещена в архив' : 'Задача восстановлена');
}

function reinitBoardAndTaskHandlers() {
    initBoardDragAndDrop();
    document.querySelectorAll('#cards-container .card .list').forEach(list => {
        const card = list.closest('.card');
        const boardId = parseInt(card.dataset.boardId);
        initTaskSortable(list, boardId);
    });
    initBoardEvents();
}

function initBoardEvents() {
    document.querySelectorAll('.board-list .more-actions').forEach(btn => {
        btn.removeEventListener('click', handleMoreActionsClick);
        btn.addEventListener('click', handleMoreActionsClick);
    });
    document.querySelectorAll('.board-list .dropdown-item').forEach(item => {
        item.removeEventListener('click', handleDropdownItemClick);
        item.addEventListener('click', handleDropdownItemClick);
    });
    document.removeEventListener('click', handleOutsideClick);
    document.addEventListener('click', handleOutsideClick);
    const closeBtns = document.querySelectorAll('.dropdown-close');
    closeBtns.forEach(btn => {
        btn.removeEventListener('click', handleDropdownClose);
        btn.addEventListener('click', handleDropdownClose);
    });
}

function handleDropdownClose(e) {
    e.stopPropagation();
    const dropdown = this.closest('.dropdown-menu');
    if (dropdown) dropdown.classList.remove('show');
}

function handleMoreActionsClick(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const card = btn.closest('.card');
    const dropdown = card?.querySelector('.dropdown-menu');
    if (dropdown) {
        const isOpen = dropdown.classList.contains('show');
        document.querySelectorAll('.board-list .dropdown-menu').forEach(menu => {
            if (menu !== dropdown) {
                menu.classList.remove('show');
            }
        });
        if (!isOpen) {
            dropdown.classList.add('show');
        } else {
            dropdown.classList.remove('show');
        }
    }
}

function handleDropdownItemClick(e) {
    e.stopPropagation();
    const item = e.currentTarget;
    const action = item.dataset.action;
    const card = item.closest('.card');
    const boardIndex = parseInt(card?.dataset.boardIndex);
    const dropdown = card?.querySelector('.dropdown-menu');
    if (dropdown) dropdown.classList.remove('show');
    switch(action) {
        case 'create-board':
            openTextModal({
                title: 'Новая доска',
                label: 'Название доски',
                value: '',
                submitLabel: 'Создать',
                onSubmit: (name, close) => {
                    const n = (name || '').trim();
                    if (!n) return;
                    const newBoard = { id: Date.now(), name: n, tasks: [], archivedTasks: [] };
                    boardsData.push(newBoard);
                    reorderBoardsForColumnCount();
                    saveBoardsToLocalStorage();
                    close();
                    renderCurrentView();
                    initBoardEvents();
                    showToast('Доска создана');
                }
            });
            break;
        case 'copy-link':
            copyBoardLink(boardIndex);
            break;
        case 'rename':
            renameBoard(boardIndex);
            break;
        case 'clone':
            cloneBoard(boardIndex);
            break;
        case 'board-export-json': {
            const b = boardsData?.[boardIndex];
            if (!b) break;
            const payload = { board: b };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `board-${b.id || boardIndex}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            showToast('Файл сохранён');
            break;
        }
        case 'archive-board': {
            openConfirmModal({
                title: 'Архивировать доску',
                message: 'Переместить доску в архив? (Её можно будет восстановить позже через localStorage)',
                confirmLabel: 'Архивировать',
                danger: true,
                onConfirm: () => {
                    const b = boardsData?.[boardIndex];
                    if (!b) return;
                    const archivedBoards = JSON.parse(localStorage.getItem('archivedBoards') || '[]');
                    archivedBoards.push({ ...b, archivedAt: new Date().toISOString() });
                    localStorage.setItem('archivedBoards', JSON.stringify(archivedBoards));
                    boardsData.splice(boardIndex, 1);
                    saveBoardsToLocalStorage();
                    renderCurrentView();
                    initBoardEvents();
                    showToast('Доска архивирована');
                }
            });
            break;
        }
    }
}

function handleOutsideClick(e) {
    if (!e.target.closest('.more-actions') && !e.target.closest('.dropdown-menu')) {
        document.querySelectorAll('.board-list .dropdown-menu').forEach(menu => {
            menu.classList.remove('show');
        });
    }
}

function copyBoardLink(boardIndex) {
    const url = `${window.location.origin}${window.location.pathname}?board=${boardIndex}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Ссылка на доску скопирована');
    }).catch(() => {
        prompt('Скопируйте ссылку:', url);
    });
}

function openListModal({ title, bodyEl, footerEl }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.width = '28vw';
    content.style.height = 'auto';
    content.style.maxHeight = '70vh';
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
        <p class="text-header">${escapeHtml(title || '')}</p>
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
    const close = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 200);
    };
    header.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) close();
    });
    return { overlay, close, body, footer };
}

function openTextModal({ title, label, value, submitLabel, onSubmit }) {
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
    const { close } = openListModal({ title, bodyEl: wrap, footerEl: footer });
    btnCancel.addEventListener('click', close);
    btnOk.addEventListener('click', () => onSubmit(input.value, close));
    setTimeout(() => input.focus(), 0);
}

function openConfirmModal({ title, message, confirmLabel, danger, onConfirm }) {
    const p = document.createElement('p');
    p.className = 'text-basic';
    p.style.margin = '0';
    p.textContent = message || '';
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
    btnOk.textContent = confirmLabel || 'Подтвердить';
    footer.append(btnCancel, btnOk);
    const { close } = openListModal({ title, bodyEl: p, footerEl: footer });
    btnCancel.addEventListener('click', close);
    btnOk.addEventListener('click', () => {
        close();
        if (onConfirm) onConfirm();
    });
}

function renameBoard(boardIndex) {
    const board = boardsData[boardIndex];
    openTextModal({
        title: 'Переименовать доску',
        label: 'Название',
        value: board?.name || '',
        submitLabel: 'Сохранить',
        onSubmit: (newName, close) => {
            if (!newName || !newName.trim()) return;
            board.name = newName.trim();
            saveBoardsToLocalStorage();
            close();
            renderCurrentView();
            initBoardEvents();
            showToast('Доска переименована');
        }
    });
}

function cloneBoard(boardIndex) {
    const originalBoard = boardsData[boardIndex];
    const newBoard = JSON.parse(JSON.stringify(originalBoard));
    newBoard.id = Date.now();
    newBoard.name = `${originalBoard.name} (копия)`;
    boardsData.push(newBoard);
    reorderBoardsForColumnCount();
    saveBoardsToLocalStorage();
    renderCurrentView();
    initBoardEvents();
    showToast('Доска скопирована');
}

function clearBoard(boardIndex) {
    openConfirmModal({
        title: 'Очистить доску',
        message: 'Вы уверены, что хотите очистить доску? Все задачи будут удалены.',
        confirmLabel: 'Очистить',
        danger: true,
        onConfirm: () => {
            boardsData[boardIndex].tasks = [];
            saveBoardsToLocalStorage();
            renderCurrentView();
            initBoardEvents();
            showToast('Доска очищена');
        }
    });
}

function deleteBoard(boardIndex) {
    openConfirmModal({
        title: 'Удалить доску',
        message: 'Вы уверены, что хотите удалить доску? Это действие нельзя отменить.',
        confirmLabel: 'Удалить',
        danger: true,
        onConfirm: () => {
            boardsData.splice(boardIndex, 1);
            reorderBoardsForColumnCount();
            saveBoardsToLocalStorage();
            renderCurrentView();
            initBoardEvents();
            showToast('Доска удалена');
        }
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
    return new Date(9999, 11, 31);
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
    if (parseInt(year) === currentYear) {
        return `${day}.${month}`;
    } else {
        return `${day}.${month}.${year}`;
    }
}

function formatDateBoard(dateStr) {
    if (!dateStr) return '';
    if (typeof dateStr === 'string' && dateStr.includes('.')) {
        const parts = dateStr.split('.');
        if (parts.length >= 2) {
            return `${parts[0]}.${parts[1]}`;
        }
    }
    return dateStr;
}

function sortTasksByPriorityAndDate(tasks) {
    if (!tasks || tasks.length === 0) return [];
    return [...tasks].sort((a, b) => {
        const priorityA = a.priority || 'обычный';
        const priorityB = b.priority || 'обычный';
        if (priorityA !== priorityB) {
            return priorityA === 'срочно' ? -1 : 1;
        }
        const dateA = parseDateBoard(a.dueDate);
        const dateB = parseDateBoard(b.dueDate);
        return dateA - dateB;
    });
}

async function initBoardListPage() {
    await loadTeamData();
    if (!document.querySelector('.board-list')) return;
    await loadBoardsData();
}

window.initBoardListPage = initBoardListPage;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.querySelector('.board-list')) {
            initBoardListPage();
        }
    });
} else {
    if (document.querySelector('.board-list')) {
        initBoardListPage();
    }
}

})();