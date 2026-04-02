let boardsData = [];
let isDragging = false;
let currentView = 'board';

// Сортировка таблицы (глобальная для табличного режима)
let tableSortColumn = null;
let tableSortDirection = 'asc';

// ==================== ЗАГРУЗКА И СОХРАНЕНИЕ ====================

async function loadBoardsData() {
    try {
        const response = await fetch('/static/data/boards.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        boardsData = data.boards || data;
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
        return true;
    }
    return false;
}

// ==================== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ====================

function initViewSwitching() {
    const tabs = document.querySelectorAll('.board-list .tabs .tab-btn');
    tabs.forEach(btn => {
        btn.removeEventListener('click', handleTabClick);
        btn.addEventListener('click', handleTabClick);
    });
}

function handleTabClick(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'board') currentView = 'board';
    else if (tab === 'tables') currentView = 'tables';
    else if (tab === 'timeline') currentView = 'timeline';
    
    document.querySelectorAll('.board-list .tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    renderCurrentView();
}

function renderCurrentView() {
    if (currentView === 'board') renderBoardView();
    else if (currentView === 'tables') renderTableView();
    else if (currentView === 'timeline') renderTimelineView();
}

// ==================== ПРЕДСТАВЛЕНИЕ "ДОСКИ" ====================

function renderBoardView() {
    const container = document.querySelector('#cards-container');
    if (!container) return;

    container.classList.remove('tables-view');

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

// ==================== ПРЕДСТАВЛЕНИЕ "ТАБЛИЦЫ" ====================

function renderTableView() {
    const container = document.querySelector('#cards-container');
    if (!container) return;
    
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
        const table = createBoardTable(board, tasks, boardIndex);
        boardCard.appendChild(table);
        
        container.appendChild(boardCard);
    });
    
    initBoardDragAndDrop();
    
    initTableRowsSortable();
    
    initBoardEvents();
}

function createBoardTable(board, tasks, boardIndex) {
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'tasks-grid-wrapper';
    const table = document.createElement('div');
    table.className = 'tasks-grid';
    
    const columns = ['select', 'id', 'name', 'priority', 'dueDate', 'assignee', 'subtasksCount'];
    const columnNames = {
        select: '',
        id: 'ID',
        name: 'Название',
        priority: 'Приоритет',
        dueDate: 'Срок',
        assignee: 'Исполнитель',
        subtasksCount: 'Подзадачи'
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
                    cell.textContent = task.id;
                    break;
                case 'name':
                    cell.textContent = task.name;
                    break;
                case 'priority':
                    const prioritySpan = document.createElement('span');
                    prioritySpan.className = task.priority === 'срочно' ? 'priority-high' : 'priority-normal';
                    prioritySpan.textContent = task.priority === 'срочно' ? 'Срочно' : 'Обычный';
                    cell.appendChild(prioritySpan);
                    break;
                case 'dueDate':
                    const dueSpan = document.createElement('span');
                    const dueDate = task.dueDate ? formatDateBoard(task.dueDate) : '—';
                    dueSpan.textContent = dueDate;
                    if (task.dueDate && parseDateBoard(task.dueDate) < new Date()) {
                        dueSpan.classList.add('overdue');
                    }
                    cell.appendChild(dueSpan);
                    break;
                case 'assignee':
                    cell.textContent = task.assignee || '—';
                    break;
                case 'subtasksCount':
                    const count = task.subtasks ? task.subtasks.length : 0;
                    cell.textContent = count;
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

// Хранилище состояния сортировки для каждой доски в табличном режиме
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
    renderTableView(); // перерисовываем табличное представление
}

// ==================== ПРЕДСТАВЛЕНИЕ "ТАЙМЛАЙН" ====================

function renderTimelineView() {
    const container = document.querySelector('#cards-container');
    if (!container) return;
    
    let tasksWithDates = [];
    boardsData.forEach(board => {
        if (board.tasks && board.tasks.length) {
            board.tasks.forEach(task => {
                if (task.dueDate) {
                    tasksWithDates.push({
                        ...task,
                        boardName: board.name,
                        dueDateObj: parseDateBoard(task.dueDate)
                    });
                }
            });
        }
    });
    
    if (tasksWithDates.length === 0) {
        container.innerHTML = '<div class="empty-message">Нет задач с указанными сроками</div>';
        return;
    }
    
    tasksWithDates.sort((a, b) => a.dueDateObj - b.dueDateObj);
    
    const groups = {};
    tasksWithDates.forEach(task => {
        const dateKey = formatDateBoard(task.dueDate);
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(task);
    });
    
    const timeline = document.createElement('div');
    timeline.className = 'timeline-view';
    
    for (const [date, tasks] of Object.entries(groups)) {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'timeline-date-group';
        
        const dateHeader = document.createElement('div');
        dateHeader.className = 'timeline-date-header';
        dateHeader.textContent = date;
        dateGroup.appendChild(dateHeader);
        
        const taskList = document.createElement('div');
        taskList.className = 'timeline-task-list';
        tasks.forEach(task => {
            const taskItem = document.createElement('div');
            taskItem.className = 'timeline-task-item';
            taskItem.innerHTML = `
                <div class="timeline-task-name">${escapeHtml(task.name)}</div>
                <div class="timeline-task-board">${escapeHtml(task.boardName)}</div>
                ${task.assignee ? `<div class="timeline-task-assignee">${escapeHtml(task.assignee)}</div>` : ''}
                ${task.priority ? `<div class="timeline-task-priority ${task.priority === 'срочно' ? 'priority-high' : 'priority-normal'}">${task.priority === 'срочно' ? 'Срочно' : 'Обычный'}</div>` : ''}
            `;
            taskList.appendChild(taskItem);
        });
        dateGroup.appendChild(taskList);
        timeline.appendChild(dateGroup);
    }
    
    container.innerHTML = '';
    container.appendChild(timeline);
}

// ==================== СУЩЕСТВУЮЩИЕ ФУНКЦИИ (АДАПТИРОВАНЫ ПОД #cards-container) ====================

let draggedBoard = null;

function initBoardDragAndDrop() {
    const handles = document.querySelectorAll('#cards-container .board-drag-handle');
    console.log('initBoardDragAndDrop: найдено ручек:', handles.length);
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
    console.log('=== DRAGSTART ДОСКИ ===');
    console.log('Перетаскиваемая доска:', boardName, '(id:', boardId, ')');
    
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
    console.log('=== DRAGEND ДОСКИ ===');
    if (draggedBoard) {
        const boardName = draggedBoard.querySelector('.text-header')?.textContent;
        console.log('Завершено перетаскивание доски:', boardName);
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
    
    console.log('=== DROP ДОСКИ (INSERT) ===');
    
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
    card.appendChild(header);
    card.appendChild(list);
    return card;
}

function createCardHeader(board, boardIndex) {
    const header = document.createElement('div');
    header.className = 'tasks-header flex-row-between';
    
    const dragHandle = document.createElement('div');
    dragHandle.className = 'board-drag-handle';
    dragHandle.setAttribute('draggable', 'true');
    dragHandle.style.cursor = 'grab';
    dragHandle.style.display = 'flex';
    dragHandle.style.alignItems = 'center';
    dragHandle.style.gap = '8px';
    
    const taskheaderCount = document.createElement('div');
    taskheaderCount.className = 'taskheader-count';
    taskheaderCount.innerHTML = `
        <p class="text-header">${escapeHtml(board.name)}</p>
        <div class="num-of-tasks">${board.tasks ? board.tasks.filter(t => t).length : 0}</div>
    `;
    
    dragHandle.appendChild(taskheaderCount);
    header.appendChild(dragHandle);
    
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
            <li class="dropdown-item text-basic" data-action="copy-link">
                <span>Скопировать ссылку</span>
            </li>
            <li class="dropdown-item text-basic" data-action="rename">
                <span>Переименовать</span>
            </li>
            <li class="dropdown-item text-basic" data-action="add-description">
                <span>Добавить описание</span>
            </li>
            <li class="dropdown-item text-basic" data-action="clone">
                <span>Клонировать доску</span>
            </li>
            <li class="dropdown-item text-basic pink" data-action="clear">
                <span>Очистить доску</span>
            </li>
            <li class="dropdown-item text-basic pink" data-action="delete">
                <span>Удалить доску</span>
            </li>
        </ul>
    `;
    return dropdown;
}

function initTableRowsSortable() {
    const containers = document.querySelectorAll('#cards-container .board-table-card .table-rows');
    containers.forEach(container => {
        const boardCard = container.closest('.board-table-card');
        const boardId = parseInt(boardCard.dataset.boardId);
        
        if (container.sortable) {
            container.sortable.destroy();
        }
        
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
            ghostClass: 'task-dragging',
            dragClass: 'task-drag-over',
            forceFallback: false, 
            swapThreshold: 0.5,
            invertSwap: true,
            onEnd: function(evt) {
                const fromContainer = evt.from;
                const toContainer = evt.to;
                const fromBoardCard = fromContainer.closest('.board-table-card');
                const toBoardCard = toContainer.closest('.board-table-card');
                const fromBoardId = parseInt(fromBoardCard.dataset.boardId);
                const toBoardId = parseInt(toBoardCard.dataset.boardId);
                const draggedRow = evt.item;
                const taskId = parseInt(draggedRow.querySelector('.col-id')?.textContent);
                if (!taskId) return;
                
                if (fromBoardId === toBoardId) {
                    // Переупорядочивание внутри одной доски
                    const rows = Array.from(toContainer.children);
                    const newOrder = rows.map(row => parseInt(row.querySelector('.col-id')?.textContent)).filter(id => id);
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
                    // Перемещение между разными досками
                    const sourceBoard = boardsData.find(b => b.id === fromBoardId);
                    const targetBoard = boardsData.find(b => b.id === toBoardId);
                    const taskIndex = sourceBoard.tasks.findIndex(t => t.id === taskId);
                    if (taskIndex !== -1) {
                        const movedTask = sourceBoard.tasks.splice(taskIndex, 1)[0];
                        targetBoard.tasks.push(movedTask);
                        saveBoardsToLocalStorage();
                        renderCurrentView(); // перерисовка текущего представления
                        showToast(`Задача "${movedTask.name}" перемещена в доску "${targetBoard.name}"`);
                    }
                }
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
    const sortable = new Sortable(container, {
        animation: 150,
        group: {
            name: 'tasks',
            pull: true,
            revertClone: false,
            sort: true
        },
        handle: '.item',
        draggable: '.item',
        ghostClass: 'task-dragging',
        dragClass: 'task-drag-over',
        forceFallback: false,
        swapThreshold: 0.5,
        invertSwap: true,
        onEnd: function(evt) {
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
    const checkbox = document.createElement('label');
    checkbox.className = 'column-option checkbox-item';
    checkbox.innerHTML = `
        <input type="checkbox" data-task-id="${task.id}" ${task.archived ? 'checked disabled' : ''}>
        <span class="custom-checkbox"></span>
        <span class="checkbox-text">${escapeHtml(task.name)}</span>
    `;
    const checkboxInput = checkbox.querySelector('input');
    if (!task.archived) {
        checkboxInput.addEventListener('change', (e) => {
            archiveTask(boardIndex, task.id, e.target.checked);
        });
    }
    item.appendChild(checkbox);
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
        const items = card.querySelectorAll('.item');
        for (const item of items) {
            if (item.dataset.taskId == task.id) {
                const progressCompleted = item.querySelector('.progress-line .completed');
                const progressTodo = item.querySelector('.progress-line .todo');
                const countText = item.querySelector('.count p:last-child');
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
        deadlineDiv.textContent = formatDateBoard(task.dueDate);
        tagBlock.appendChild(deadlineDiv);
    }
    return tagBlock;
}

function archiveTask(boardIndex, taskId, isArchived) {
    const board = boardsData[boardIndex];
    if (!board) return;
    const taskIndex = board.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;
    if (isArchived) {
        if (!board.archivedTasks) board.archivedTasks = [];
        board.archivedTasks.push({...board.tasks[taskIndex], archivedDate: new Date().toISOString()});
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
        case 'copy-link':
            copyBoardLink(boardIndex);
            break;
        case 'rename':
            renameBoard(boardIndex);
            break;
        case 'add-description':
            addBoardDescription(boardIndex);
            break;
        case 'clone':
            cloneBoard(boardIndex);
            break;
        case 'clear':
            clearBoard(boardIndex);
            break;
        case 'delete':
            deleteBoard(boardIndex);
            break;
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

function renameBoard(boardIndex) {
    const board = boardsData[boardIndex];
    const newName = prompt('Введите новое название доски:', board.name);
    if (newName && newName.trim()) {
        board.name = newName.trim();
        saveBoardsToLocalStorage();
        renderCurrentView();
        initBoardEvents();
        showToast('Доска переименована');
    }
}

function addBoardDescription(boardIndex) {
    const board = boardsData[boardIndex];
    const description = prompt('Введите описание доски:', board.description || '');
    if (description !== null) {
        board.description = description;
        showToast('Описание добавлено');
    }
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
    if (confirm('Вы уверены, что хотите очистить доску? Все задачи будут удалены.')) {
        boardsData[boardIndex].tasks = [];
        saveBoardsToLocalStorage();
        renderCurrentView();
        initBoardEvents();
        showToast('Доска очищена');
    }
}

function deleteBoard(boardIndex) {
    if (confirm('Вы уверены, что хотите удалить доску? Это действие нельзя отменить.')) {
        boardsData.splice(boardIndex, 1);
        reorderBoardsForColumnCount();
        saveBoardsToLocalStorage();
        renderCurrentView();
        initBoardEvents();
        showToast('Доска удалена');
    }
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

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ДАТ ====================

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

// ==================== ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ ====================

function initBoardListPage() {
    if (!document.querySelector('.board-list')) return;
    const hasLocalData = loadBoardsFromLocalStorage();
    if (hasLocalData && boardsData.length > 0) {
        reorderBoardsForColumnCount();
        renderCurrentView();
        initBoardEvents();
        initViewSwitching();
    } else {
        loadBoardsData();
    }
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