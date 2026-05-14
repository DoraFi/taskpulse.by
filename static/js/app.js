document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('tasks-grid')) return;
    const filterIcon = document.getElementById('filterIcon');
    const getModal = () => document.getElementById('filterModal');
    const getClose = () => document.getElementById('closeModal');

    if (filterIcon) {
        const ensureModalInBody = () => {
            const modal = getModal();
            if (!modal) return;
            if (modal.parentElement !== document.documentElement) {
                document.documentElement.appendChild(modal);
            }
            modal.style.position = 'fixed';
            modal.style.inset = '0';
            modal.style.left = '0';
            modal.style.top = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
        };

        ensureModalInBody();
        const obs = new MutationObserver(() => ensureModalInBody());
        obs.observe(document.body, { childList: true, subtree: true });

        filterIcon.addEventListener('click', () => {
            ensureModalInBody();
            const modal = getModal();
            if (modal) {
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

(function () {
    if (window.tpResetDemoData) return;

    window.tpResetDemoData = function tpResetDemoData({ reload = true } = {}) {
        try {
            localStorage.removeItem('tasksVisibleColumns');

            localStorage.removeItem('boardsData');
            localStorage.removeItem('archivedBoards');
            localStorage.removeItem('boardListArchiveCollapsed');
            localStorage.removeItem('boardListBoardSectionCollapsed');

            localStorage.removeItem('kanbanBoardsData');
            localStorage.removeItem('kanbanDataVersion');
            localStorage.removeItem('kanbanBoardCollapsed');
            localStorage.removeItem('kanbanSectionCollapsed');
            localStorage.removeItem('kanbanTimelineShowDone');
            localStorage.removeItem('archivedKanbanBoards');

            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (!key) continue;
                if (key.startsWith('kanbanTableCols_')) localStorage.removeItem(key);
            }

            localStorage.removeItem('submenusState');

            if (reload) window.location.reload();
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    };
})();

(function () {
    function indexSummaryUrl() {
        const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
        if (m) return `/o/${m[1]}/t/${m[2]}/api/index/summary`;
        return '/api/index/summary';
    }

    window.tpPrefetchIndexSummary = async function tpPrefetchIndexSummary() {
        try {
            const u = `${indexSummaryUrl()}?_=${Date.now()}`;
            const r = await fetch(u, { cache: 'no-store', credentials: 'same-origin' });
            if (!r.ok) return;
            window._tpIndexSummaryLast = await r.json();
            window._tpIndexSummaryLastAt = Date.now();
        } catch (_) {
        }
    };
})();