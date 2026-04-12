(function () {
    const TASK_DETAIL_NAME = 'Обновить документацию API Gateway';

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
            Готово: 'Готово'
        };
        return m[stage] || 'Новая';
    }

    function parseHours(task) {
        if (task.timeEstimateHours != null && !Number.isNaN(Number(task.timeEstimateHours))) {
            return String(task.timeEstimateHours);
        }
        const s = task.timeEstimate || '';
        const m = String(s).match(/(\d+(?:[.,]\d+)?)/);
        return m ? m[1].replace(',', '.') : '';
    }

    function dueToIso(due) {
        if (!due || typeof due !== 'string' || !due.includes('.')) return null;
        const parts = due.split('.');
        if (parts.length !== 3) return null;
        const [d, m, y] = parts;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
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

    window.tpOpenTaskDetailModal = function tpOpenTaskDetailModal(task) {
        if (!task || task.name !== TASK_DETAIL_NAME) return;
        const overlay = document.getElementById('taskDetailModal');
        if (!overlay) return;

        const displayId = task.displayId || 'WCL-304';
        const titleEl = document.getElementById('taskDetailTitle');
        if (titleEl) titleEl.textContent = `${displayId} · ${task.name}`;

        setSelectValue(document.getElementById('taskDetailProject'), task.project || 'Корпоративный портал');
        const nameInput = document.getElementById('taskDetailName');
        if (nameInput) nameInput.value = task.name || '';

        const desc = document.getElementById('taskDetailDesc');
        if (desc) desc.value = STATIC_COPY.description;

        setSelectValue(document.getElementById('taskDetailStatus'), stageToStatusValue(task.stage));
        setSelectValue(document.getElementById('taskDetailPriority'), task.priority || 'обычный');
        setSelectValue(document.getElementById('taskDetailAssignee'), task.assignee || '');

        const hours = document.getElementById('taskDetailHours');
        if (hours) hours.value = parseHours(task);

        const sp = task.storyPoints != null ? String(task.storyPoints) : '3';
        setSelectValue(document.getElementById('taskDetailSp'), sp);

        const hFrom = document.getElementById('taskDetailDeadlineFrom');
        const hTo = document.getElementById('taskDetailDeadlineTo');
        const endIso = dueToIso(task.dueDate) || STATIC_COPY.dateTo;
        const startIso = STATIC_COPY.dateFrom;
        if (hFrom) hFrom.value = startIso;
        if (hTo) hTo.value = endIso;

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
