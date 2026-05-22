let tasksData = [];
let assignedTasksData = [];

const STATUS_LABELS = {
    neutral: 'Назначена',
    inprocess: 'В работе',
    done: 'Завершено',
    exit: 'Отложено'
};

function getApiBasePath() {
    const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
    if (!m) return '/api';
    return `/o/${m[1]}/t/${m[2]}/api`;
}

function apiUrl(path) {
    return `${getApiBasePath()}${path}`;
}

async function loadTasks() {
    const url = apiUrl('/tasks');
    try {
        const response = window.tpDebug
            ? await window.tpDebug.traceFetch(url, { cache: 'no-store', credentials: 'same-origin' }, 'GET /tasks')
            : await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) {
            console.error('[TaskPulse] /tasks', response.status, await response.text().catch(() => ''));
            tasksData = [];
            return;
        }
        const data = await response.json();
        tasksData = Array.isArray(data) ? data : [];
        if (window.tpDebug) {
            window.tpDebug.log('/tasks загружено', { count: tasksData.length, sample: tasksData.slice(0, 3) });
        }
    } catch (error) {
        console.error('[TaskPulse] Ошибка загрузки задач:', error);
        tasksData = [];
    }
}

async function loadAssignedTasks() {
    const url = apiUrl('/tasks/assigned');
    try {
        const response = window.tpDebug
            ? await window.tpDebug.traceFetch(url, { cache: 'no-store', credentials: 'same-origin' }, 'GET /tasks/assigned')
            : await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) {
            console.error('[TaskPulse] /tasks/assigned', response.status);
            assignedTasksData = [];
            return;
        }
        const data = await response.json();
        assignedTasksData = Array.isArray(data) ? data : [];
        if (window.tpDebug) {
            window.tpDebug.log('/tasks/assigned загружено', { count: assignedTasksData.length });
        }
    } catch (error) {
        console.error('[TaskPulse] Ошибка загрузки назначенных задач:', error);
        assignedTasksData = [];
    }
}

let currentUser = {
    id: null,
    name: '',
    avatar: 'basic_avatar.png',
    role: 'member'
};

async function loadCurrentUser() {
    try {
        const response = await fetch(apiUrl('/me'));
        if (!response.ok) throw new Error('me api failed');
        const me = await response.json();
        currentUser = {
            id: me.id ?? null,
            name: me.fullName || '',
            avatar: me.avatar || 'basic_avatar.png',
            role: me.position || 'member'
        };
    } catch (error) {
        console.error('Ошибка загрузки current user:', error);
    }
}

function priorityWeight(priority) {
    return priority === 'срочно' ? 0 : 1;
}

function sortByPriorityAndDate(arr, doneLast = false) {
    return [...arr].sort((a, b) => {
        if (doneLast) {
            const aDone = a.status === 'done' ? 1 : 0;
            const bDone = b.status === 'done' ? 1 : 0;
            if (aDone !== bDone) return aDone - bDone;
        }
        const pa = priorityWeight(a.priority);
        const pb = priorityWeight(b.priority);
        if (pa !== pb) return pa - pb;
        const da = parseDate(a.dueDate || '31.12.2099');
        const db = parseDate(b.dueDate || '31.12.2099');
        return da - db;
    });
}

function sortByDateThenPriority(arr) {
    return [...arr].sort((a, b) => {
        const da = parseDate(a.dueDate || '31.12.2099');
        const db = parseDate(b.dueDate || '31.12.2099');
        if (da - db !== 0) return da - db;
        return priorityWeight(a.priority) - priorityWeight(b.priority);
    });
}

function isUnassignedTask(task) {
    if (task.assigneeId == null || task.assigneeId === '') return true;
    const assignee = String(task.assignee || '').trim();
    return !assignee || assignee === '-' || assignee === '-';
}

function isCreatedByCurrentUser(task) {
    if (currentUser.id != null && task.creatorId != null) {
        return Number(task.creatorId) === Number(currentUser.id);
    }
    const me = (currentUser.name || '').trim();
    const creator = (task.creator || '').trim();
    return Boolean(me && creator && me === creator);
}

function isExpiringTask(task) {
    if (task.status === 'done') return false;
    const diff = daysDiffFromToday(task.dueDate);
    return diff != null && diff <= 3 && diff >= 0;
}

function getTasksForTab(tab) {
    switch (tab) {
        case 'assigned':
            return Array.isArray(assignedTasksData) ? [...assignedTasksData] : [];
        case 'deadline':
            return tasksData.filter(isExpiringTask);
        case 'todo':
            return tasksData.filter(isUnassignedTask);
        case 'created':
            return tasksData.filter(isCreatedByCurrentUser);
        case 'all':
            return [...tasksData];
        default:
            return [...tasksData];
    }
}

function sortTasksForTab(tab, arr) {
    return sortByDateThenPriority(arr);
}

function filterTasks(tab) {
    return sortTasksForTab(tab, getTasksForTab(tab));
}

function parseDate(dateStr) {
    if (!dateStr) return new Date(2099, 11, 31);
    const parts = dateStr.split('.');
    if (parts.length === 2) {
        const [day, month] = parts;
        return new Date(new Date().getFullYear(), month - 1, day);
    }
    const [day, month, year] = parts;
    return new Date(year, month - 1, day);
}

function daysDiffFromToday(dueDate) {
    if (!dueDate) return null;
    const due = parseDate(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

function isAttentionDate(dueDate) {
    const diff = daysDiffFromToday(dueDate);
    if (diff == null) return false;
    return diff <= 2;
}

function isOverdueDate(dueDate) {
    const diff = daysDiffFromToday(dueDate);
    if (diff == null) return false;
    return diff < 0;
}

function formatRelativeDate(dueDate) {
    const diff = daysDiffFromToday(dueDate);
    if (diff == null) return dueDate;
    if (diff === -1) return 'Вчера';
    if (diff === 0) return 'Сегодня';
    if (diff === 1) return 'Завтра';
    return dueDate;
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
            nameP.style.cursor = 'pointer';
            nameP.title = 'Открыть карточку задачи';
            nameP.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.tpOpenTaskDetailModal !== 'function') return;
                if (task.taskDbId == null) return;
                window.tpOpenTaskDetailModal(task);
            });
            div.appendChild(nameP);
            break;
        case 'status':
            div.style.position = 'relative';
            const statusSelect = document.createElement('div');
            statusSelect.className = `status-select text-basic ${task.status}`;
            statusSelect.textContent = STATUS_LABELS[task.status];
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
            if (task.status === 'done' && task.completedDate) {
                const dueText = task.dueDate ? formatRelativeDate(task.dueDate) : '';
                div.innerHTML = `
                    <div class="basic-and-signature">
                        <p class="text-basic" style="color:#2D5F20;">${task.completedDate}</p>
                        ${dueText ? `<p class="text-signature light-gray">${dueText}</p>` : ''}
                    </div>
                `;
            } else if (isOverdueDate(task.dueDate)) {
                div.innerHTML = `
                    <div class="due-attention due-attention--left">
                        <p class="text-basic">Просрочено</p>
                        <p class="text-signature">${formatRelativeDate(task.dueDate)}</p>
                    </div>
                `;
            } else {
                const dueP = document.createElement('p');
                if (isAttentionDate(task.dueDate)) dueP.className = 'pink';
                dueP.textContent = formatRelativeDate(task.dueDate);
                div.appendChild(dueP);
            }
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
            if (!task.assigneeAvatar || task.assignee === '-') {
                div.innerHTML = `<p class="text-basic">-</p>`;
            } else {
                div.innerHTML = `
                    <div class="user-img-text">
                        <img src="/static/source/user_img/${task.assigneeAvatar}" alt="">
                        <div class="basic-and-signature">
                            <p class="text-basic">${escapeHtml(task.assignee)}</p>
                        </div>
                    </div>
                `;
            }
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
    document.querySelectorAll('.status-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
    });

    const nextOpen = !dropdown.classList.contains('show');
    dropdown.classList.toggle('show', nextOpen);
    if (!nextOpen) return;

    dropdown.style.position = 'absolute';
    dropdown.style.top = 'calc(100% + 6px)';
    dropdown.style.left = '0';
    dropdown.style.right = 'auto';
    dropdown.style.bottom = 'auto';
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
            return ['id', 'name', 'status', 'dueDate', 'priority', 'complexity', 'time', 'creator', 'project'];
        case 'created':
            return ['id', 'name', 'status', 'dueDate', 'priority', 'complexity', 'time', 'assignee', 'project'];
        case 'all':
            return ['id', 'name', 'status', 'dueDate', 'priority', 'complexity', 'time', 'assignee', 'creator', 'project'];
        default:
            return ['id', 'name', 'status', 'dueDate', 'priority', 'complexity', 'time', 'assignee', 'creator', 'project'];
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
                hydrateFilterCheckboxesFromDb();
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

function convertToISODate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('.');
    let day, month, year;
    if (parts.length === 2) {
        [day, month] = parts;
        year = String(new Date().getFullYear());
    } else {
        [day, month, year] = parts;
    }
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

function escapeAttr(str) {
    return escapeHtml(String(str ?? ''));
}

function renderCheckboxGroup(containerId, options, selectedValues = []) {
    const group = document.getElementById(containerId);
    if (!group) return;
    const selected = new Set((selectedValues || []).map(v => String(v)));
    group.innerHTML = (options || []).map(({ value, label }) => `
        <label class="checkbox-item">
            <input type="checkbox" value="${escapeAttr(value)}" ${selected.has(String(value)) ? 'checked' : ''}>
            <span class="custom-checkbox"></span>
            <span class="checkbox-text">${escapeHtml(label)}</span>
        </label>
    `).join('');
}

function uniqueSortedStrings(values) {
    return Array.from(new Set((values || [])
        .map(v => String(v || '').trim())
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'ru'));
}

async function loadFilterOptions(tab) {
    try {
        const response = await fetch(apiUrl(`/tasks/filter-options?tab=${encodeURIComponent(tab || 'all')}`));
        if (!response.ok) throw new Error('filter-options failed');
        return await response.json();
    } catch (error) {
        console.error('Ошибка загрузки фильтров:', error);
        return null;
    }
}

function buildFilterOptionsFallback(tab) {
    const tasks = getTasksForTab(tab);
    return {
        statuses: uniqueSortedStrings(tasks.map(t => t.status)).map(status => ({
            value: status,
            label: STATUS_LABELS[status] || status
        })),
        priorities: uniqueSortedStrings(tasks.map(t => t.priority)).map(priority => ({
            value: priority,
            label: priority === 'срочно' ? 'Срочно' : priority === 'обычный' ? 'Обычный' : priority
        })),
        projects: uniqueSortedStrings(tasks.map(t => t.project)).map(project => ({ value: project, label: project })),
        assignees: uniqueSortedStrings(tasks.map(t => t.assignee).filter(a => a && a !== '-')).map(name => ({ value: name, label: name })),
        creators: uniqueSortedStrings(tasks.map(t => t.creator)).map(name => ({ value: name, label: name })),
        maxComplexity: 13
    };
}

async function hydrateFilterCheckboxesFromDb() {
    const tab = document.querySelector('.tab-btn.active')?.dataset.tab || 'all';
    const current = collectFilters();
    const opts = (await loadFilterOptions(tab)) || buildFilterOptionsFallback(tab);

    renderCheckboxGroup('filterStatusGroup', opts.statuses || [], current.statuses);
    renderCheckboxGroup('filterPriorityGroup', opts.priorities || [], current.priorities);
    renderCheckboxGroup('filterProjectGroup', opts.projects || [], current.projects);
    renderCheckboxGroup('filterAssigneeGroup', opts.assignees || [], current.assignees);
    renderCheckboxGroup('filterCreatorGroup', opts.creators || [], current.creators);

    if (complexityRange && opts.maxComplexity) {
        const maxVal = Math.max(1, Number(opts.maxComplexity) || 13);
        complexityRange.max = String(maxVal);
        if (Number(complexityRange.value) > maxVal) {
            complexityRange.value = String(maxVal);
            if (complexityValue) complexityValue.textContent = `До ${maxVal} SP`;
        }
        const rangeLabels = complexityRange.closest('.filter-range')?.querySelectorAll('.range-values span');
        if (rangeLabels && rangeLabels.length >= 2) {
            rangeLabels[1].textContent = String(maxVal);
        }
    }
}

function applyFiltersToTasks(criteria) {
    const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
    let filteredTasks = getTasksForTab(currentTab);
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
    updateTasksWithSort(sortTasksForTab(currentTab, filteredTasks));
}

function updateFilterSectionsVisibility() {
    const currentTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'all';
    const hideAssignee = currentTab === 'assigned' || currentTab === 'created';
    const hideCreator = currentTab === 'created';
    document.querySelectorAll('#filterModal [data-filter-section]').forEach(section => {
        const key = section.dataset.filterSection;
        if (key === 'assignee') {
            section.style.display = hideAssignee ? 'none' : '';
        } else if (key === 'creator') {
            section.style.display = hideCreator ? 'none' : '';
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

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.removeEventListener('click', handleTabClick);
        btn.addEventListener('click', handleTabClick);
    });
}

function handleTabClick(e) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    const tab = e.currentTarget.dataset.tab;
    const render = () => {
        hydrateFilterCheckboxesFromDb();
        renderTasks(tab);
        updateNameColumnMaxWidth();
        if (filterModal && filterModal.classList.contains('show')) {
            updateFilterSectionsVisibility();
        }
    };
    if (tab === 'assigned') {
        loadAssignedTasks().then(render);
    } else if (!tasksData || tasksData.length === 0) {
        loadTasks().then(render);
    } else {
        render();
    }
}

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
        created: 'Созданные мной задачи',
        all: 'Все задачи'
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

function initTasksPage() {
    console.log('[TaskPulse] initTasksPage');
    if (window.tpDebug) {
        window.tpDebug.dumpContext('страница задач');
    }
    loadColumnsState();
    initFilters();
    initTabs();
    initMoreActions();
    window.tpRefreshTasksPage = async function tpRefreshTasksPage() {
        if (!document.getElementById('tasks-grid')) return;
        const tab = document.querySelector('.tab-btn.active')?.dataset.tab || 'assigned';
        if (tab === 'assigned') {
            await loadAssignedTasks();
        } else {
            await loadTasks();
        }
        hydrateFilterCheckboxesFromDb();
        renderTasks(tab);
    };
    const initialTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'all';
    loadCurrentUser().then(() => Promise.all([loadTasks(), loadAssignedTasks()]).then(() => {
        hydrateFilterCheckboxesFromDb();
        renderTasks(initialTab);
        if (window.tpDebug) {
            window.tpDebug.log('renderTasks', {
                tab: initialTab,
                all: tasksData.length,
                assigned: assignedTasksData.length
            });
        }
    }));
    window.addEventListener('resize', () => updateNameColumnMaxWidth());
}

document.addEventListener('DOMContentLoaded', initTasksPage);

console.log('tasks.js загружен, initTasksPage определена:', typeof window.initTasksPage);
window.initTasksPage = initTasksPage;