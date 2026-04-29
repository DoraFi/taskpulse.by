(function () {
    const STATIC_COPY = {
        description:
            'Синхронизировать публичную документацию с текущей конфигурацией API Gateway: маршруты и upstream, политики rate limit, коды ошибок и примеры запросов/ответов. Обновить раздел безопасности (OAuth2, API keys) и чек-лист для онбординга интеграторов.',
        attachmentHint: 'перетащите сюда файлы или',
        depSearchDefault: '1002 — API авторизации',
        dateFrom: '2026-03-22',
        dateTo: '2026-04-05'
    };

    function stageToStatusValue(stage) {
        const m = {
            Очередь: 'Новая',
            'В работе': 'В работе',
            Тестирование: 'В работе',
            Готово: 'Готово',
            Отложено: 'Отложено'
        };
        return m[stage] || 'Новая';
    }

    function statusValueToStage(status) {
        const m = {
            'Новая': 'Очередь',
            'Назначена': 'В работе',
            'В работе': 'В работе',
            'Готово': 'Готово',
            'Отложено': 'Отложено'
        };
        return m[status] || 'Очередь';
    }

    function parseHours(task) {
        if (task.timeEstimateHours != null && !Number.isNaN(Number(task.timeEstimateHours))) {
            return String(task.timeEstimateHours);
        }
        const s = task.timeEstimate || '';
        const m = String(s).match(/(\d+(?:[.,]\d+)?)/);
        return m ? m[1].replace(',', '.') : '';
    }

    function uiDueToIso(due) {
        if (!due) return null;
        if (typeof due !== 'string') due = String(due);
        due = due.trim();
        if (!due) return null;

        // уже ISO
        if (due.includes('-') && due.length >= 10) return due.slice(0, 10);

        // формат dd.MM или dd.MM.YYYY
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

    function setSelectValue(select, value) {
        if (!select) return;
        const opt = Array.from(select.options).find(o => o.value === value);
        if (opt) select.value = value;
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

    window.tpOpenTaskDetailModal = function tpOpenTaskDetailModal(task) {
        if (!task || !task.id) return;
        currentTask = task;

        const overlay = document.getElementById('taskDetailModal');
        if (!overlay) return;

        const displayId = task.displayId || task.publicId || task.taskCode || 'TSK-?';
        const titleEl = document.getElementById('taskDetailTitle');
        if (titleEl) titleEl.textContent = `${displayId} · ${task.name || ''}`;

        setSelectValue(document.getElementById('taskDetailProject'), task.project || 'Корпоративный портал');

        const nameInput = document.getElementById('taskDetailName');
        if (nameInput) nameInput.value = task.name || '';

        const desc = document.getElementById('taskDetailDesc');
        if (desc) desc.value = task.description || '';

        setSelectValue(document.getElementById('taskDetailStatus'), stageToStatusValue(task.stage));
        setSelectValue(document.getElementById('taskDetailPriority'), task.priority || 'обычный');
        setSelectValue(document.getElementById('taskDetailAssignee'), task.assignee || '');

        const hours = document.getElementById('taskDetailHours');
        if (hours) hours.value = parseHours(task);

        const sp = task.storyPoints != null ? String(task.storyPoints) : '';
        setSelectValue(document.getElementById('taskDetailSp'), sp);

        const hFrom = document.getElementById('taskDetailDeadlineFrom');
        const hTo = document.getElementById('taskDetailDeadlineTo');
        const iso = uiDueToIso(task.dueDate);
        if (hFrom) hFrom.value = iso || '';
        if (hTo) hTo.value = iso || '';

        const attHint = document.querySelector('#taskDetailModal .create-task-attachments__hint');
        if (attHint) attHint.textContent = STATIC_COPY.attachmentHint;

        const depSearch = document.getElementById('taskDetailDepSearch');
        if (depSearch) depSearch.value = STATIC_COPY.depSearchDefault;

        setSelectValue(document.getElementById('taskDetailDepType'), 'relates');

        openModal(overlay);
    };

    function init() {
        const overlay = document.getElementById('taskDetailModal');
        if (!overlay) return;

        bindDeadlineInputs(overlay);

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
                const stage = statusValueToStage(statusVal);

                const priority = document.getElementById('taskDetailPriority')?.value || 'обычный';

                const from = document.getElementById('taskDetailDeadlineFrom')?.value || '';
                const to = document.getElementById('taskDetailDeadlineTo')?.value || '';
                const dueDate = (to || from) || null;

                const assigneeVal = document.getElementById('taskDetailAssignee')?.value || '';
                const assignee = assigneeVal && String(assigneeVal).trim() ? String(assigneeVal).trim() : null;

                const description = document.getElementById('taskDetailDesc')?.value || '';

                const spRaw = document.getElementById('taskDetailSp')?.value || '';
                const storyPoints = spRaw ? parseInt(spRaw, 10) : null;

                const hoursRaw = document.getElementById('taskDetailHours')?.value || '';
                const estimateHours = hoursRaw ? Number(hoursRaw) : null;

                try {
                    const res = await fetch(apiUrl('/kanban/tasks/update'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            taskId: currentTask.id,
                            name,
                            description,
                            stage,
                            priority,
                            dueDate,
                            assignee,
                            storyPoints,
                            estimateHours
                        })
                    });
                    if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.error || 'Ошибка сохранения');
                    }

                    safeShowToast('Изменения сохранены');
                    closeModal(overlay);
                    currentTask = null;
                    if (typeof window.tpRefreshKanban === 'function') {
                        await window.tpRefreshKanban();
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
