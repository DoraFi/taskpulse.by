// static/js/app.js
document.addEventListener('DOMContentLoaded', function() {
    // tasks page manages its own filters modal in tasks.js
    if (document.getElementById('tasks-grid')) return;
    const filterIcon = document.getElementById('filterIcon');
    const getModal = () => document.getElementById('filterModal');
    const getClose = () => document.getElementById('closeModal');

    // Проверяем существование элементов перед добавлением обработчиков
    if (filterIcon) {
        // If modal is nested inside a transformed element (e.g. card), fixed positioning breaks.
        // Move it to body once to ensure full-screen overlay and correct centering.
        const ensureModalInBody = () => {
            const modal = getModal();
            if (!modal) return;
            // attach to <html> to avoid any transformed <body> descendants affecting fixed positioning
            if (modal.parentElement !== document.documentElement) {
                document.documentElement.appendChild(modal);
            }
            // enforce fullscreen fixed overlay via inline styles (wins over any inherited layout)
            modal.style.position = 'fixed';
            modal.style.inset = '0';
            modal.style.left = '0';
            modal.style.top = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
        };

        // Do it immediately, and keep it in body even if the card is re-rendered.
        ensureModalInBody();
        const obs = new MutationObserver(() => ensureModalInBody());
        obs.observe(document.body, { childList: true, subtree: true });

        filterIcon.addEventListener('click', () => {
            ensureModalInBody();
            const modal = getModal();
            if (modal) {
                // enforce fullscreen overlay every open (in case styles were overwritten)
                modal.style.position = 'fixed';
                modal.style.inset = '0';
                modal.style.width = '100vw';
                modal.style.height = '100vh';
                modal.style.left = '0';
                modal.style.top = '0';
                modal.style.display = 'flex';
                modal.style.alignItems = 'center';
                modal.style.justifyContent = 'center';
                modal.classList.add('show');
            }
        });

        document.addEventListener('click', (e) => {
            const closeBtn = e.target && e.target.closest ? e.target.closest('#closeModal') : null;
            if (!closeBtn) return;
            const modal = getModal();
            if (modal) modal.classList.remove('show');
        });

        document.addEventListener('click', (e) => {
            const modal = getModal();
            if (modal && e.target === modal) modal.classList.remove('show');
        });

        document.addEventListener('keydown', (e) => {
            const modal = getModal();
            if (e.key === 'Escape' && modal && modal.classList.contains('show')) modal.classList.remove('show');
        });
    }
});

// Dev helper: reset all demo tables/state back to /static/data/*.json
// Usage in console: window.tpResetDemoData()
(function () {
    if (window.tpResetDemoData) return;

    window.tpResetDemoData = function tpResetDemoData({ reload = true } = {}) {
        try {
            // Tasks page UI state
            localStorage.removeItem('tasksVisibleColumns');

            // Board list state
            localStorage.removeItem('boardsData');
            localStorage.removeItem('archivedBoards');
            localStorage.removeItem('boardListArchiveCollapsed');
            localStorage.removeItem('boardListBoardSectionCollapsed');

            // Kanban state
            localStorage.removeItem('kanbanBoardsData');
            localStorage.removeItem('kanbanDataVersion');
            localStorage.removeItem('kanbanBoardCollapsed');
            localStorage.removeItem('kanbanSectionCollapsed');
            localStorage.removeItem('kanbanTimelineShowDone');
            localStorage.removeItem('archivedKanbanBoards');

            // Per-board kanban table columns (dynamic keys)
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (!key) continue;
                if (key.startsWith('kanbanTableCols_')) localStorage.removeItem(key);
            }

            // Left menu collapse/expand
            localStorage.removeItem('submenusState');

            if (reload) window.location.reload();
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    };
})();