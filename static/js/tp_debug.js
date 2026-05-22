/**
 * TaskPulse client debug — всегда пишет в консоль (F12).
 * Сводка контекста: GET {contextBase}/api/debug/context
 */
(function () {
    const PREFIX = '[TaskPulse]';

    function apiBase() {
        if (typeof window.getApiBasePath === 'function') {
            return window.getApiBasePath();
        }
        const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
        return m ? `/o/${m[1]}/t/${m[2]}/api` : '/api';
    }

    function contextFromPath() {
        const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
        if (!m) return null;
        const project = window.location.pathname.match(/\/p\/([^/]+)/);
        return {
            orgPublicId: decodeURIComponent(m[1]),
            teamPublicId: decodeURIComponent(m[2]),
            projectCode: project ? decodeURIComponent(project[1]) : null,
            pathname: window.location.pathname,
            search: window.location.search
        };
    }

    function log(label, payload) {
        if (payload === undefined) {
            console.log(`${PREFIX} ${label}`);
            return;
        }
        console.log(`${PREFIX} ${label}`, payload);
    }

    function logApi(method, url, status, extra) {
        const line = { method, url, status, ...extra };
        if (status >= 400) {
            console.warn(`${PREFIX} API`, line);
        } else {
            console.log(`${PREFIX} API`, line);
        }
    }

    async function dumpContext(label) {
        const ctx = contextFromPath();
        const base = apiBase();
        const url = `${base}/debug/context`;
        log(label || 'debug/context', { ctx, url });
        try {
            const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
            const text = await res.text();
            let data = null;
            try {
                data = text ? JSON.parse(text) : null;
            } catch {
                data = { raw: text };
            }
            logApi('GET', url, res.status, { label });
            if (!res.ok || data?.ok === false) {
                console.error(`${PREFIX} debug/context failed`, data);
                if (data?.hint) {
                    console.warn(`${PREFIX} hint:`, data.hint);
                }
                if (data?.requestedTeamId) {
                    console.warn(`${PREFIX} team в URL:`, data.requestedTeamId, '| pathname:', window.location.pathname);
                }
                return data;
            }
            console.group(`${PREFIX} контекст сервера`);
            console.log('pathname (клиент):', window.location.pathname);
            console.log('teamId (БД):', data?.teamId, '| public:', data?.teamPublicId);
            console.log('userId:', data?.userId, '|', data?.username);
            console.log('задач (видимых SQL):', data?.tasksVisibleCount, '| всего в БД:', data?.tasksTotalCount);
            console.log('проектов (visibleIds):', data?.visibleProjectCount);
            if (Array.isArray(data?.visibleProjects) && data.visibleProjects.length) {
                console.table(data.visibleProjects);
            }
            if (Array.isArray(data?.projectTeamLinks) && data.projectTeamLinks.length) {
                console.table(data.projectTeamLinks);
            }
            if (Array.isArray(data?.tasksByProject) && data.tasksByProject.length) {
                console.table(data.tasksByProject);
            }
            if (data?.warnings?.length) {
                console.warn('warnings:', data.warnings);
            }
            console.groupEnd();
            return data;
        } catch (e) {
            console.error(`${PREFIX} debug/context error`, e);
            return null;
        }
    }

    async function traceFetch(input, init, tag) {
        const url = typeof input === 'string' ? input : input.url;
        const method = (init?.method || 'GET').toUpperCase();
        const res = await fetch(input, init);
        const clone = res.clone();
        let preview = '';
        try {
            const t = await clone.text();
            preview = t.length > 400 ? `${t.slice(0, 400)}… (${t.length} chars)` : t;
        } catch {
            preview = '(no body)';
        }
        let parsed = null;
        try {
            parsed = preview.startsWith('[') || preview.startsWith('{') ? JSON.parse(preview) : null;
        } catch {
            parsed = null;
        }
        const count = Array.isArray(parsed) ? parsed.length
            : parsed?.tasks ? (parsed.tasks.length ?? '?')
            : parsed?.boards ? (parsed.boards.length ?? '?')
            : parsed?.projects ? (parsed.projects.length ?? '?')
            : null;
        logApi(method, url, res.status, { tag, count, preview: count != null ? undefined : preview });
        if (!res.ok) {
            console.warn(`${PREFIX} ${tag || 'fetch'} body:`, preview);
        }
        return res;
    }

    window.tpDebug = {
        log,
        dumpContext,
        traceFetch,
        contextFromPath,
        apiBase
    };

    log('отладка включена — tpDebug.dumpContext() в консоли');
})();
