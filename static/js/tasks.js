// static/js/tasks.js
let tasksData = [];

async function loadTasks() {
    try {
        const response = await fetch('/static/data/tasks.json');
        tasksData = await response.json();
        renderTasks('assigned');
    } catch (error) {
        console.error('Ошибка загрузки задач:', error);
    }
}

const currentUser = {
    name: 'Лев Аксенов',
    avatar: 'lev_aksenov.jpg',
    role: 'Tech Lead'
};

function filterTasks(tab) {
    const today = new Date();
    switch(tab) {
        case 'assigned':
            return tasksData.filter(task => task.assignee === currentUser.name);
        case 'deadline':
            return tasksData.filter(task => {
                const dueDate = parseDate(task.dueDate);
                const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                return diffDays <= 3 && diffDays >= 0 && task.status !== 'done';
            });
        case 'todo':
            return tasksData.filter(task => task.status === 'neutral');
        case 'created':
            return tasksData.filter(task => task.creator === currentUser.name);
        default:
            return tasksData;
    }
}

function parseDate(dateStr) {
    const [day, month, year] = dateStr.split('.');
    return new Date(year, month - 1, day);
}

function isOverdue(dueDate) {
    const today = new Date();
    const due = parseDate(dueDate);
    return due < today;
}

function renderTasks(tab) {
    renderTasksWithColumns(tab);
}

function createCell(col, task, tab) {
    const div = document.createElement('div');
    div.className = `col-${col}`;
    
    switch(col) {
        case 'id':
            div.textContent = task.id;
            break;
        case 'name':
            const nameP = document.createElement('p');
            nameP.className = 'task-name';
            nameP.textContent = task.name;
            div.appendChild(nameP);
            break;
        case 'status':
            const statusText = {
                neutral: 'Назначена',
                inprocess: 'В работе',
                done: 'Завершено',
                exit: 'Отложено'
            };
            div.style.position = 'relative';
            const statusSelect = document.createElement('div');
            statusSelect.className = `status-select text-basic ${task.status}`;
            statusSelect.textContent = statusText[task.status];
            const dropdown = document.createElement('div');
            dropdown.className = 'status-dropdown';
            const statuses = [
                { status: 'neutral', text: 'Назначена' },
                { status: 'inprocess', text: 'В работе' },
                { status: 'done', text: 'Завершено' },
                { status: 'exit', text: 'Отложено' }
            ];
            statuses.forEach(s => {
                const option = document.createElement('div');
                option.className = `status-option ${s.status}`;
                option.setAttribute('data-status', s.status);
                option.textContent = s.text;
                dropdown.appendChild(option);
            });
            div.appendChild(statusSelect);
            div.appendChild(dropdown);
            break;
        case 'dueDate':
            const dueP = document.createElement('p');
            const overdue = isOverdue(task.dueDate);
            if (overdue) dueP.className = 'overdue';
            dueP.textContent = task.dueDate;
            div.appendChild(dueP);
            break;
        case 'priority':
            const prioritySpan = document.createElement('p');
            prioritySpan.className = task.priority === 'срочно' ? 'priority-high' : 'priority-normal';
            prioritySpan.textContent = task.priority === 'срочно' ? 'Срочно' : 'Обычный';
            div.appendChild(prioritySpan);
            break;
        case 'complexity':
            const complexitySpan = document.createElement('p');
            complexitySpan.className = 'complexity-value';
            complexitySpan.textContent = `${task.complexity} SP`;
            div.appendChild(complexitySpan);
            break;
        case 'time':
            div.textContent = task.timeEstimate;
            break;
        case 'assignee':
            div.innerHTML = `
                <div class="user-img-text">
                    <img src="/static/source/user_img/${task.assigneeAvatar}" alt="">
                    <div class="basic-and-signature">
                        <p class="text-basic">${escapeHtml(task.assignee)}</p>
                    </div>
                </div>
            `;
            break;
        case 'creator':
            div.innerHTML = `
                <div class="user-img-text">
                    <img src="/static/source/user_img/${task.creatorAvatar}" alt="">
                    <div class="basic-and-signature">
                        <p class="text-basic">${escapeHtml(task.creator)}</p>
                    </div>
                </div>
            `;
            break;
        case 'project':
            const projectP = document.createElement('p');
            projectP.textContent = task.project;
            div.appendChild(projectP);
            break;
    }
    return div;
}

function addStatusHandlers() {
    document.querySelectorAll('.status-select').forEach(select => {
        select.removeEventListener('click', handleStatusClick);
        select.addEventListener('click', handleStatusClick);
    });
    document.querySelectorAll('.status-option').forEach(option => {
        option.removeEventListener('click', handleOptionClick);
        option.addEventListener('click', handleOptionClick);
    });
    document.removeEventListener('click', handleOutsideClick);
    document.addEventListener('click', handleOutsideClick);
}

function handleStatusClick(e) {
    e.stopPropagation();
    const select = e.currentTarget;
    const dropdown = select.nextElementSibling;
    const rect = select.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + window.scrollY}px`;
    dropdown.style.left = `${rect.left + window.scrollX}px`;
    document.querySelectorAll('.status-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
    });
    dropdown.classList.toggle('show');
}

function handleOptionClick(e) {
    e.stopPropagation();
    const row = e.currentTarget.closest('.grid-row');
    const taskId = row.querySelector('.col-id').textContent;
    const newStatus = e.currentTarget.dataset.status;
    updateTaskStatus(taskId, newStatus);
    e.currentTarget.closest('.status-dropdown').classList.remove('show');
}

function handleOutsideClick() {
    document.querySelectorAll('.status-dropdown').forEach(d => d.classList.remove('show'));
}

function getColumnsForTab(tab) {
    switch(tab) {
        case 'assigned':
            return ['id', 'name', 'status', 'dueDate', 'priority', 'complexity', 'time', 'creator', 'project'];
        case 'deadline':
            return ['id', 'name', 'status', 'dueDate', 'priority', 'complexity', 'time', 'assignee', 'project'];
        case 'todo':
            return ['id', 'name', 'status', 'dueDate', 'priority', 'complexity', 'time', 'assignee', 'creator', 'project'];
        case 'created':
            return ['id', 'name', 'status', 'dueDate', 'priority', 'complexity', 'time', 'assignee', 'project'];
        default:
            return ['id', 'name', 'status', 'dueDate', 'priority', 'complexity', 'time', 'project'];
    }
}

function getColumnName(col) {
    const names = {
        id: 'ID',
        name: 'Наименование',
        status: 'Статус',
        dueDate: 'Срок',
        priority: 'Приоритет',
        complexity: 'Сложность',
        time: 'Время',
        assignee: 'Исполнитель',
        creator: 'Создатель',
        project: 'Проект'
    };
    return names[col];
}

function updateTaskStatus(taskId, newStatus) {
    const task = tasksData.find(t => t.id === taskId);
    if (task) {
        task.status = newStatus;
        const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
        renderTasks(currentTab);
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

// --- Модалка фильтров ---
let filterModal, closeModalBtn, applyFiltersBtn, cancelFiltersBtn, complexityRange, complexityValue, resetFiltersBtn;

function initFilters() {
    filterModal = document.getElementById('filterModal');
    closeModalBtn = document.getElementById('closeModal');
    applyFiltersBtn = filterModal ? filterModal.querySelector('.button-basic') : null;
    cancelFiltersBtn = filterModal ? filterModal.querySelector('.button-secondary') : null;
    complexityRange = document.getElementById('complexityRange');
    complexityValue = document.getElementById('complexityValue');
    resetFiltersBtn = document.getElementById('resetFiltersBtn');

    if (filterModal) {
        // Ensure full-screen overlay and proper centering (avoid parent transforms)
        if (filterModal.parentElement !== document.body) {
            document.body.appendChild(filterModal);
        }
        filterModal.style.position = 'fixed';
        filterModal.style.inset = '0';
        filterModal.style.width = '100vw';
        filterModal.style.height = '100vh';
        filterModal.style.left = '0';
        filterModal.style.top = '0';

        const filterIcon = document.getElementById('filterIcon');
        if (filterIcon) {
            filterIcon.addEventListener('click', () => {
                updateFilterSectionsVisibility();
                filterModal.classList.add('show');
            });
        }
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                filterModal.classList.remove('show');
            });
        }
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => {
                const filters = collectFilters();
                applyFiltersToTasks(filters);
                filterModal.classList.remove('show');
            });
        }
        if (cancelFiltersBtn) {
            cancelFiltersBtn.addEventListener('click', () => {
                resetFilters();
                const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
                renderTasks(currentTab);
            });
        }
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                resetAllFilters();
                const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
                renderTasks(currentTab);
            });
        }
        filterModal.addEventListener('click', (e) => {
            if (e.target === filterModal) {
                filterModal.classList.remove('show');
            }
        });

        // Hook custom calendar (same modal class as in board_list/kanban)
        const dateInputs = Array.from(document.querySelectorAll('.filter-date input'));
        if (dateInputs.length === 2) {
            const [dateFrom, dateTo] = dateInputs;
            dateFrom.setAttribute('data-role', 'dateFrom');
            dateTo.setAttribute('data-role', 'dateTo');

            const openRangeCalendar = () => {
                openCustomCalendarRange({
                    start: dateFrom.value || null,
                    end: dateTo.value || null,
                    onApply: ({ start, end }) => {
                        dateFrom.value = start || '';
                        dateTo.value = end || '';
                    }
                });
            };

            [dateFrom, dateTo].forEach(inp => {
                inp.addEventListener('click', (e) => {
                    // Replace native picker with our modal calendar
                    e.preventDefault();
                    e.stopPropagation();
                    openRangeCalendar();
                });
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openRangeCalendar();
                    }
                });
            });
        }
    }

    if (complexityRange && complexityValue) {
        complexityRange.addEventListener('input', (e) => {
            complexityValue.textContent = `До ${e.target.value} SP`;
        });
    }
}

function openCustomCalendarRange({ start, end, onApply }) {
    // Same DOM and behaviour as board_list / Kanban (styles in .custom-calendar-modal).
    let selectionStart = start || null;
    let selectionEnd = end || null;
    let currentYear;
    let currentMonth;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay custom-calendar-modal';
    const calendarWrapper = document.createElement('div');
    calendarWrapper.className = 'custom-calendar';
    calendarWrapper.innerHTML = `
        <div class="custom-calendar-header">
            <button type="button" class="prev-both">←</button>
            <div class="custom-calendar-title">Выберите диапазон дат</div>
            <button type="button" class="next-both">→</button>
        </div>
        <div class="custom-calendar-months"></div>
        <div class="custom-calendar-footer">
            <button type="button" class="button-secondary reset-dates">Сбросить</button>
            <button type="button" class="button-basic apply-dates">Применить</button>
        </div>
    `;
    modal.appendChild(calendarWrapper);
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    const monthsContainer = calendarWrapper.querySelector('.custom-calendar-months');

    function renderBothMonths() {
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
                    <button type="button" class="change-month" data-month="${month}" data-year="${year}" data-dir="${isFirstMonth ? 'prev' : 'next'}">
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
                } else if (dateStr < selectionStart) {
                    selectionEnd = selectionStart;
                    selectionStart = dateStr;
                } else {
                    selectionEnd = dateStr;
                }
                renderBothMonths();
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
                } else if (currentMonth === 11) {
                    currentMonth = 0;
                    currentYear++;
                } else {
                    currentMonth++;
                }
                renderBothMonths();
            });
        }
    }

    if (selectionEnd) {
        const endDate = new Date(selectionEnd);
        currentYear = endDate.getFullYear();
        currentMonth = endDate.getMonth();
    } else if (selectionStart) {
        const sd = new Date(selectionStart);
        currentYear = sd.getFullYear();
        currentMonth = sd.getMonth();
    } else {
        const now = new Date();
        currentYear = now.getFullYear();
        currentMonth = now.getMonth();
    }

    renderBothMonths();

    const close = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
    };

    calendarWrapper.querySelector('.prev-both').addEventListener('click', () => {
        if (currentMonth === 0) {
            currentMonth = 11;
            currentYear--;
        } else {
            currentMonth--;
        }
        renderBothMonths();
    });
    calendarWrapper.querySelector('.next-both').addEventListener('click', () => {
        if (currentMonth === 11) {
            currentMonth = 0;
            currentYear++;
        } else {
            currentMonth++;
        }
        renderBothMonths();
    });
    calendarWrapper.querySelector('.reset-dates').addEventListener('click', () => {
        selectionStart = null;
        selectionEnd = null;
        renderBothMonths();
    });
    calendarWrapper.querySelector('.apply-dates').addEventListener('click', () => {
        if (onApply) onApply({ start: selectionStart, end: selectionEnd || selectionStart });
        close();
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });
    document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') {
            document.removeEventListener('keydown', onKey);
            close();
        }
    });
}

function convertToISODate(dateStr) {
    const [day, month, year] = dateStr.split('.');
    return `${year}-${month}-${day}`;
}

function getCheckedValues(sectionIndex) {
    const sections = document.querySelectorAll('.filter-section');
    if (!sections[sectionIndex]) return [];
    const checkboxes = sections[sectionIndex].querySelectorAll('input[type="checkbox"]');
    const checked = [];
    checkboxes.forEach(cb => {
        if (cb.checked) checked.push(cb.value);
    });
    return checked;
}

function collectFilters() {
    const dateFromInput = document.querySelectorAll('.filter-date input')[0];
    const dateToInput = document.querySelectorAll('.filter-date input')[1];
    const getVisibleCheckedValues = (sectionIndex) => {
        const sections = document.querySelectorAll('.filter-section');
        const section = sections[sectionIndex];
        if (!section || section.style.display === 'none') return [];
        const checkboxes = section.querySelectorAll('input[type="checkbox"]');
        const checked = [];
        checkboxes.forEach(cb => {
            if (cb.checked) checked.push(cb.value);
        });
        return checked;
    };
    const filters = {
        statuses: getVisibleCheckedValues(0),
        priorities: getVisibleCheckedValues(1),
        projects: getVisibleCheckedValues(2),
        assignees: getVisibleCheckedValues(3),
        creators: getVisibleCheckedValues(4),
        maxComplexity: complexityRange ? parseInt(complexityRange.value) : 13,
        dateFrom: dateFromInput ? dateFromInput.value : '',
        dateTo: dateToInput ? dateToInput.value : ''
    };
    return filters;
}

function applyFiltersToTasks(criteria) {
    const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
    const today = new Date();
    let filteredTasks = [];
    switch(currentTab) {
        case 'assigned':
            filteredTasks = tasksData.filter(task => task.assignee === currentUser.name);
            break;
        case 'deadline':
            filteredTasks = tasksData.filter(task => {
                const dueDate = parseDate(task.dueDate);
                const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                return diffDays <= 3 && diffDays >= 0 && task.status !== 'done';
            });
            break;
        case 'todo':
            filteredTasks = tasksData.filter(task => task.status === 'neutral');
            break;
        case 'created':
            filteredTasks = tasksData.filter(task => task.creator === currentUser.name);
            break;
        default:
            filteredTasks = [...tasksData];
    }
    if (criteria.statuses && criteria.statuses.length > 0) {
        filteredTasks = filteredTasks.filter(task => criteria.statuses.includes(task.status));
    }
    if (criteria.priorities && criteria.priorities.length > 0) {
        filteredTasks = filteredTasks.filter(task => criteria.priorities.includes(task.priority));
    }
    if (criteria.projects && criteria.projects.length > 0) {
        filteredTasks = filteredTasks.filter(task => criteria.projects.includes(task.project));
    }
    if (criteria.assignees && criteria.assignees.length > 0) {
        filteredTasks = filteredTasks.filter(task => criteria.assignees.includes(task.assignee));
    }
    if (criteria.creators && criteria.creators.length > 0) {
        filteredTasks = filteredTasks.filter(task => criteria.creators.includes(task.creator));
    }
    if (criteria.maxComplexity && criteria.maxComplexity < 13) {
        filteredTasks = filteredTasks.filter(task => task.complexity <= criteria.maxComplexity);
    }
    if (criteria.dateFrom) {
        filteredTasks = filteredTasks.filter(task => convertToISODate(task.dueDate) >= criteria.dateFrom);
    }
    if (criteria.dateTo) {
        filteredTasks = filteredTasks.filter(task => convertToISODate(task.dueDate) <= criteria.dateTo);
    }
    updateTasksWithSort(filteredTasks);
}

function updateFilterSectionsVisibility() {
    const currentTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    const filterSections = document.querySelectorAll('.modal-body .filter-section');
    const alwaysVisible = [0, 1, 2, 5, 6];
    const assigneeVisible = ['deadline', 'todo', 'created'];
    const creatorVisible = ['assigned', 'deadline', 'todo'];
    filterSections.forEach((section, idx) => {
        if (alwaysVisible.includes(idx)) {
            section.style.display = '';
            return;
        }
        if (idx === 3) {
            section.style.display = assigneeVisible.includes(currentTab) ? '' : 'none';
        } else if (idx === 4) {
            section.style.display = creatorVisible.includes(currentTab) ? '' : 'none';
        } else {
            section.style.display = '';
        }
    });
}

function resetFilters() {
    const visibleSections = document.querySelectorAll('.modal-body .filter-section:not([style*="display: none"])');
    visibleSections.forEach(section => {
        const checkboxes = section.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
        const dateInputs = section.querySelectorAll('input[type="date"]');
        dateInputs.forEach(input => input.value = '');
    });
    if (complexityRange) {
        complexityRange.value = 13;
        if (complexityValue) complexityValue.textContent = 'До 13 SP';
    }
}

function resetAllFilters() {
    const allSections = document.querySelectorAll('.modal-body .filter-section');
    allSections.forEach(section => {
        const checkboxes = section.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
        const dateInputs = section.querySelectorAll('input[type="date"]');
        dateInputs.forEach(input => input.value = '');
    });
    if (complexityRange) {
        complexityRange.value = 13;
        if (complexityValue) complexityValue.textContent = 'До 13 SP';
    }
}

// --- Табы ---
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.removeEventListener('click', handleTabClick);
        btn.addEventListener('click', handleTabClick);
    });
}

function handleTabClick(e) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    renderTasks(e.currentTarget.dataset.tab);
    updateNameColumnMaxWidth();
    if (filterModal && filterModal.classList.contains('show')) {
        updateFilterSectionsVisibility();
    }
}

// --- Колонки и сортировка ---
let visibleColumns = {
    id: true,
    name: true,
    status: true,
    dueDate: true,
    priority: true,
    complexity: true,
    time: true,
    assignee: true,
    creator: true,
    project: true
};

let currentSort = {
    column: null,
    direction: 'asc'
};

function loadColumnsState() {
    const saved = localStorage.getItem('tasksVisibleColumns');
    if (saved) visibleColumns = JSON.parse(saved);
}

function saveColumnsState() {
    localStorage.setItem('tasksVisibleColumns', JSON.stringify(visibleColumns));
}

function updateNameColumnMaxWidth() {
    const grid = document.querySelector('.tasks-grid');
    if (!grid) return;
    const header = grid.querySelector('.grid-header');
    if (!header) return;
    const allColumns = Array.from(header.children);
    const visibleColumnsCount = allColumns.length;
    let maxWidth;
    if (visibleColumnsCount <= 3) maxWidth = '80vw';
    else if (visibleColumnsCount <= 5) maxWidth = '40vw';
    else if (visibleColumnsCount <= 7) maxWidth = '25vw';
    else maxWidth = '20vw';
    document.querySelectorAll('.tasks-grid .col-name').forEach(col => {
        col.style.maxWidth = maxWidth;
    });
}

function renderTasksWithColumns(tab) {
    const filteredTasks = filterTasks(tab);
    const grid = document.getElementById('tasks-grid');
    const headerTitle = document.getElementById('tasks-header-title');
    if (!grid || !headerTitle) return;
    const titles = {
        assigned: 'Назначенные мне задачи',
        deadline: 'Задачи с истекающим сроком',
        todo: 'Задачи к выполнению',
        created: 'Созданные мной задачи'
    };
    headerTitle.textContent = titles[tab];
    const allColumns = getColumnsForTab(tab);
    const columns = allColumns.filter(col => visibleColumns[col] !== false);
    if (filteredTasks.length === 0) {
        grid.innerHTML = `<div class="empty-state">Нет задач для отображения</div>`;
        return;
    }
    grid.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'grid-header';
    columns.forEach(col => {
        const div = document.createElement('div');
        div.className = `col-${col}`;
        div.setAttribute('data-sort', col);
        if (currentSort.column === col) {
            div.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
        const titleSpan = document.createElement('span');
        titleSpan.className = 'header-title';
        titleSpan.textContent = getColumnName(col);
        const sortIcon = document.createElement('span');
        sortIcon.className = 'sort-icon';
        sortIcon.innerHTML = `<img src="/static/source/icons/arrow_dark.svg" alt="Сортировка">`;
        div.appendChild(titleSpan);
        div.appendChild(sortIcon);
        header.appendChild(div);
    });
    grid.appendChild(header);
    let tasksToDisplay = filteredTasks;
    if (currentSort.column) {
        tasksToDisplay = sortTasks(filteredTasks, currentSort.column, currentSort.direction);
    }
    tasksToDisplay.forEach(task => {
        const row = document.createElement('div');
        row.className = 'grid-row';
        row.setAttribute('data-task-id', task.id);
        columns.forEach(col => {
            const cell = createCell(col, task, tab);
            row.appendChild(cell);
        });
        grid.appendChild(row);
    });
    addStatusHandlers();
    document.querySelectorAll('.grid-header > div').forEach(headerCell => {
        headerCell.removeEventListener('click', handleSortClick);
        headerCell.addEventListener('click', handleSortClick);
    });
    setTimeout(() => updateNameColumnMaxWidth(), 0);
}

function handleSortClick(e) {
    const headerCell = e.currentTarget;
    const column = headerCell.dataset.sort;
    if (!column) return;
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
    const currentTabTasks = filterTasks(currentTab);
    const sortedTasks = sortTasks(currentTabTasks, column, currentSort.direction);
    updateTasksWithSort(sortedTasks);
    setTimeout(() => updateNameColumnMaxWidth(), 0);
}

function sortTasks(tasks, column, direction) {
    return [...tasks].sort((a, b) => {
        let valA = a[column];
        let valB = b[column];
        if (column === 'dueDate' || column === 'createdDate') {
            const dateA = parseDate(valA);
            const dateB = parseDate(valB);
            return direction === 'asc' ? dateA - dateB : dateB - dateA;
        } else if (column === 'complexity') {
            return direction === 'asc' ? valA - valB : valB - valA;
        } else if (column === 'time') {
            const numA = parseInt(valA);
            const numB = parseInt(valB);
            return direction === 'asc' ? numA - numB : numB - numA;
        } else {
            const strA = String(valA).toLowerCase();
            const strB = String(valB).toLowerCase();
            if (direction === 'asc') {
                return strA.localeCompare(strB);
            } else {
                return strB.localeCompare(strA);
            }
        }
    });
}

function updateTasksWithSort(filteredTasks) {
    const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
    const grid = document.getElementById('tasks-grid');
    const columns = getColumnsForTab(currentTab).filter(col => visibleColumns[col] !== false);
    if (!grid) return;
    if (filteredTasks.length === 0) {
        grid.innerHTML = `<div class="empty-state">Нет задач для отображения</div>`;
        return;
    }
    grid.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'grid-header';
    columns.forEach(col => {
        const div = document.createElement('div');
        div.className = `col-${col}`;
        div.setAttribute('data-sort', col);
        if (currentSort.column === col) {
            div.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
        const titleSpan = document.createElement('span');
        titleSpan.className = 'header-title';
        titleSpan.textContent = getColumnName(col);
        const sortIcon = document.createElement('span');
        sortIcon.className = 'sort-icon';
        sortIcon.innerHTML = `<img src="/static/source/icons/arrow_dark.svg" alt="Сортировка">`;
        div.appendChild(titleSpan);
        div.appendChild(sortIcon);
        header.appendChild(div);
    });
    grid.appendChild(header);
    filteredTasks.forEach(task => {
        const row = document.createElement('div');
        row.className = 'grid-row';
        row.setAttribute('data-task-id', task.id);
        columns.forEach(col => {
            const cell = createCell(col, task, currentTab);
            row.appendChild(cell);
        });
        grid.appendChild(row);
    });
    addStatusHandlers();
    document.querySelectorAll('.grid-header > div').forEach(headerCell => {
        headerCell.removeEventListener('click', handleSortClick);
        headerCell.addEventListener('click', handleSortClick);
    });
    setTimeout(() => updateNameColumnMaxWidth(), 0);
}

// --- Модалка настройки колонок ---
function showColumnsModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="width: 28vw; height: auto;">
            <div class="modal-header">
                <p class="text-header">Настройка колонок</p>
                <button class="modal-close">
                    <img src="/static/source/icons/cross.svg" alt="Закрыть">
                </button>
            </div>
            <div class="modal-body" style="gap: 0.75rem;">
                ${getColumnsCheckboxes()}
            </div>
            <div class="modal-footer">
                <button class="button-secondary" id="resetColumnsBtn">Показать все</button>
                <button class="button-basic" id="applyColumnsBtn">Применить</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('show');
    const closeBtn = modal.querySelector('.modal-close');
    const resetBtn = modal.querySelector('#resetColumnsBtn');
    const applyBtn = modal.querySelector('#applyColumnsBtn');
    const updateCheckboxes = () => {
        Object.keys(visibleColumns).forEach(col => {
            const cb = modal.querySelector(`input[data-column="${col}"]`);
            if (cb) cb.checked = visibleColumns[col];
        });
    };
    updateCheckboxes();
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
    });
    resetBtn.addEventListener('click', () => {
        visibleColumns = {
            id: true, name: true, status: true, dueDate: true,
            priority: true, complexity: true, time: true,
            assignee: true, creator: true, project: true
        };
        updateCheckboxes();
    });
    applyBtn.addEventListener('click', () => {
        modal.querySelectorAll('.column-option input').forEach(cb => {
            visibleColumns[cb.dataset.column] = cb.checked;
        });
        saveColumnsState();
        const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
        renderTasks(currentTab);
        updateNameColumnMaxWidth();
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

function getColumnsCheckboxes() {
    const columns = [
        { id: 'id', name: 'ID' },
        { id: 'status', name: 'Статус' },
        { id: 'dueDate', name: 'Срок' },
        { id: 'priority', name: 'Приоритет' },
        { id: 'complexity', name: 'Сложность' },
        { id: 'time', name: 'Время' },
        { id: 'assignee', name: 'Исполнитель' },
        { id: 'creator', name: 'Создатель' },
        { id: 'project', name: 'Проект' }
    ];
    return columns.map(col => `
        <label class="column-option checkbox-item" style="margin: 0;">
            <input type="checkbox" data-column="${col.id}" ${visibleColumns[col.id] !== false ? 'checked' : ''}>
            <span class="custom-checkbox"></span>
            <span class="checkbox-text">${col.name}</span>
        </label>
    `).join('');
}

// --- Печать и ссылка ---
function printTable() {
    window.print();
}

function shareWithFilters() {
    const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
    const filters = collectFilters();
    const params = new URLSearchParams();
    params.set('tab', currentTab);
    if (filters.statuses.length) params.set('statuses', filters.statuses.join(','));
    if (filters.priorities.length) params.set('priorities', filters.priorities.join(','));
    if (filters.projects.length) params.set('projects', filters.projects.join(','));
    if (filters.assignees.length) params.set('assignees', filters.assignees.join(','));
    if (filters.creators.length) params.set('creators', filters.creators.join(','));
    if (filters.maxComplexity < 13) params.set('maxComplexity', filters.maxComplexity);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Ссылка скопирована');
    }).catch(() => {
        prompt('Скопируйте ссылку:', url);
    });
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

// --- Инициализация дополнительных элементов ---
function initMoreActions() {
    const moreActionsBtn = document.getElementById('moreActionsBtn');
    const actionsMenu = document.getElementById('actionsMenu');
    if (moreActionsBtn && actionsMenu) {
        moreActionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            actionsMenu.classList.toggle('show');
        });
        const closeDropdown = actionsMenu.querySelector('.dropdown-close');
        if (closeDropdown) {
            closeDropdown.addEventListener('click', () => {
                actionsMenu.classList.remove('show');
            });
        }
        document.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = item.dataset.action;
                switch (action) {
                    case 'columns': showColumnsModal(); break;
                    case 'print': printTable(); break;
                    case 'share': shareWithFilters(); break;
                }
                actionsMenu.classList.remove('show');
            });
        });
        document.addEventListener('click', (e) => {
            if (!moreActionsBtn.contains(e.target) && !actionsMenu.contains(e.target)) {
                actionsMenu.classList.remove('show');
            }
        });
    }
}

// --- Главная функция инициализации страницы задач ---
function initTasksPage() {
    console.log('initTasksPage вызван');
    loadColumnsState();
    initFilters();
    initTabs();
    initMoreActions();
    loadTasks();
    window.addEventListener('resize', () => updateNameColumnMaxWidth());
}

// Запуск при загрузке
document.addEventListener('DOMContentLoaded', initTasksPage);

console.log('tasks.js загружен, initTasksPage определена:', typeof window.initTasksPage);
window.initTasksPage = initTasksPage;