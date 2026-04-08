(function () {
    if (window.__createTaskModalBoot) return;
    window.__createTaskModalBoot = true;

    const MODAL_URL = '/templates/components/create_task_modal.html';

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
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openRangeCalendar();
                }
            });
        });
    }

    function bindDeps(modal) {
        const type = modal.querySelector('#createTaskDepType');
        const search = modal.querySelector('#createTaskDepSearch');
        const suggest = modal.querySelector('.create-task-deps-suggest');
        if (!type) return;

        const sync = () => {
            const none = type.value === '';
            if (search) {
                search.disabled = none;
                if (none) search.value = '';
            }
            if (suggest) suggest.classList.toggle('create-task-deps-suggest--disabled', none);
        };

        type.addEventListener('change', sync);
        sync();
    }

    function bindAttachments(modal) {
        const zone = modal.querySelector('.create-task-attachments');
        const btn = modal.querySelector('.create-task-attachments__btn');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.hidden = true;
        fileInput.setAttribute('aria-hidden', 'true');
        modal.appendChild(fileInput);
        btn?.addEventListener('click', () => fileInput.click());
        zone?.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('create-task-attachments--drag');
        });
        zone?.addEventListener('dragleave', () => zone.classList.remove('create-task-attachments--drag'));
        zone?.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('create-task-attachments--drag');
        });
    }

    function openModal(overlay) {
        if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
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
        bindDeps(overlay);
        bindAttachments(overlay);

        overlay.querySelector('#createTaskModalClose')?.addEventListener('click', () => closeModal(overlay));
        overlay.querySelector('#createTaskModalCancel')?.addEventListener('click', () => closeModal(overlay));
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeModal(overlay);
        });
        if (!window.__createTaskModalEsc) {
            window.__createTaskModalEsc = true;
            document.addEventListener('keydown', e => {
                const o = document.getElementById('createTaskModal');
                if (e.key === 'Escape' && o && o.classList.contains('show')) closeModal(o);
            });
        }

        overlay.querySelector('#createTaskModalSubmit')?.addEventListener('click', () => {
            /* макет: создание задачи не выполняется */
            closeModal(overlay);
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
                if (overlay) openModal(overlay);
            } catch (err) {
                console.error(err);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindHeader);
    } else {
        bindHeader();
    }
})();
