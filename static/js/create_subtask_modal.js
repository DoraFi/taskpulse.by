(function () {
    if (window.__createSubtaskModalBoot) return;
    window.__createSubtaskModalBoot = true;

    const MODAL_URL = '/templates/components/create_subtask_modal.html';
    let activeTask = null;

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

    function canAddSubtask(task) {
        if (!task?.id) return false;
        const stage = String(task.stage || '').trim();
        return stage !== 'Готово';
    }

    function openModal(overlay) {
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
        const input = overlay.querySelector('#createSubtaskName');
        window.setTimeout(() => input?.focus(), 50);
    }

    function closeModal(overlay) {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        activeTask = null;
    }

    function resetForm(overlay) {
        const input = overlay.querySelector('#createSubtaskName');
        if (input) input.value = '';
    }

    async function refreshBoards() {
        if (typeof window.tpRefreshKanban === 'function') {
            await window.tpRefreshKanban();
            return;
        }
        if (typeof window.tpRefreshBoardList === 'function') {
            await window.tpRefreshBoardList();
        }
    }

    function initModal(overlay) {
        if (overlay._createSubtaskModalInited) return;
        overlay._createSubtaskModalInited = true;

        const close = () => closeModal(overlay);

        overlay.querySelector('#createSubtaskModalClose')?.addEventListener('click', e => {
            e.preventDefault();
            close();
        });
        overlay.querySelector('#createSubtaskModalCancel')?.addEventListener('click', e => {
            e.preventDefault();
            close();
        });
        overlay.addEventListener('click', e => {
            if (e.target === overlay) close();
        });

        overlay.querySelector('#createSubtaskModalSubmit')?.addEventListener('click', async () => {
            if (!activeTask?.id) return;
            const input = overlay.querySelector('#createSubtaskName');
            const name = (input?.value || '').trim();
            if (!name) {
                showToast('Введите название подзадачи');
                input?.focus();
                return;
            }
            try {
                const res = await fetch(apiUrl('/kanban/subtasks/create'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ taskId: activeTask.id, name })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    showToast(data.error || data.message || 'Не удалось добавить подзадачу');
                    return;
                }
                showToast('Подзадача добавлена');
                resetForm(overlay);
                closeModal(overlay);
                if (typeof window.tpPrefetchIndexSummary === 'function') {
                    window.tpPrefetchIndexSummary().catch(() => {});
                }
                await refreshBoards();
            } catch (err) {
                console.error(err);
                showToast('Не удалось добавить подзадачу');
            }
        });

        overlay.querySelector('#createSubtaskName')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                overlay.querySelector('#createSubtaskModalSubmit')?.click();
            }
        });
    }

    async function ensureModal() {
        let overlay = document.getElementById('createSubtaskModal');
        if (overlay) return overlay;

        const res = await fetch(MODAL_URL);
        if (!res.ok) throw new Error('create_subtask_modal load failed');
        const html = await res.text();
        const tmp = document.createElement('div');
        tmp.innerHTML = html.trim();
        overlay = tmp.querySelector('#createSubtaskModal');
        if (!overlay) return null;
        document.body.appendChild(overlay);
        initModal(overlay);
        return overlay;
    }

    window.tpCanAddSubtaskToTask = canAddSubtask;

    window.tpAttachSubtaskAddButton = function tpAttachSubtaskAddButton(cardEl, task) {
        if (!cardEl || !task?.id || !canAddSubtask(task)) return;
        if (cardEl.querySelector('.task-subtask-add-btn')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'task-subtask-add-btn';
        btn.setAttribute('aria-label', 'Добавить подзадачу');
        btn.title = 'Добавить подзадачу';
        btn.innerHTML = '<img src="/static/source/icons/plus.svg" alt="" width="10" height="10">';
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            window.tpOpenCreateSubtaskModal?.(task);
        });
        cardEl.appendChild(btn);
        cardEl.classList.add('task-card--subtask-addable');
    };

    window.tpOpenCreateSubtaskModal = async function tpOpenCreateSubtaskModal(task) {
        if (!task?.id) return;
        if (!canAddSubtask(task)) {
            showToast('Подзадачи нельзя добавить в этом статусе');
            return;
        }
        try {
            const overlay = await ensureModal();
            if (!overlay) return;
            activeTask = task;
            const label = overlay.querySelector('#createSubtaskParentLabel');
            if (label) {
                const title = String(task.name || 'Задача').trim();
                label.textContent = `К задаче: ${title}`;
            }
            resetForm(overlay);
            openModal(overlay);
        } catch (err) {
            console.error(err);
            showToast('Не удалось открыть форму подзадачи');
        }
    };
})();
