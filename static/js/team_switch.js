(function () {
    if (window.__tpTeamSwitchBoot) return;
    window.__tpTeamSwitchBoot = true;

    let teamsCache = null;
    let menuOpen = false;

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function contextFromPathname() {
        const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
        if (!m) return null;
        return { orgId: m[1], teamId: m[2] };
    }

    function getMyTeamsUrl() {
        const ctx = contextFromPathname();
        if (!ctx) return '/api/my-teams';
        return `/o/${encodeURIComponent(ctx.orgId)}/t/${encodeURIComponent(ctx.teamId)}/api/my-teams`;
    }

    function teamIsCurrentOnPage(team) {
        const ctx = contextFromPathname();
        if (ctx && team?.teamPublicId) {
            return ctx.teamId.toLowerCase() === String(team.teamPublicId).toLowerCase();
        }
        return !!team?.current;
    }

    function getWrap() {
        return document.getElementById('headerTeamSwitchWrap');
    }

    function getBtn() {
        return document.getElementById('headerTeamSwitchBtn');
    }

    function getMenu() {
        return document.getElementById('headerTeamSwitchMenu');
    }

    function getList() {
        return document.getElementById('headerTeamSwitchList');
    }

    function closeMenu() {
        const menu = getMenu();
        const btn = getBtn();
        if (!menu) return;
        menu.classList.remove('show');
        menu.hidden = true;
        menuOpen = false;
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
        const menu = getMenu();
        const btn = getBtn();
        if (!menu) return;
        menu.classList.add('show');
        menu.hidden = false;
        menuOpen = true;
        if (btn) btn.setAttribute('aria-expanded', 'true');
    }

    function navigateToTeam(team) {
        if (!team?.basePath) return;
        const target = String(team.basePath).replace(/\/$/, '');
        if (!target) return;
        if (teamIsCurrentOnPage(team)) {
            closeMenu();
            return;
        }
        try {
            sessionStorage.setItem('tpActiveTeamBase', target);
        } catch (_) {  }
        window.location.href = target;
    }

    function renderMenu(teams) {
        const list = getList();
        const menu = getMenu();
        if (!list || !menu) return;

        const others = teams.filter(t => !teamIsCurrentOnPage(t));
        list.innerHTML = teams.map(team => {
            const name = escapeHtml(team.teamName || 'Команда');
            const role = escapeHtml(team.roleLabel || '');
            const current = teamIsCurrentOnPage(team) ? ' is-current' : '';
            const disabled = teamIsCurrentOnPage(team) ? ' disabled aria-disabled="true"' : '';
            return `
                <li>
                    <button type="button" class="header-team-switch__item-btn${current}" data-base-path="${escapeHtml(team.basePath)}"${disabled}>
                        <span class="header-team-switch__team-name">${name}</span>
                        <span class="header-team-switch__team-role">${role}</span>
                    </button>
                </li>`;
        }).join('');

        list.querySelectorAll('.header-team-switch__item-btn:not(.is-current)').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const basePath = btn.dataset.basePath;
                const team = teams.find(t => t.basePath === basePath);
                navigateToTeam(team);
            });
        });

        menu.hidden = others.length === 0;
    }

    function bindButton(teams) {
        const btn = getBtn();
        const wrap = getWrap();
        const menu = getMenu();
        if (!btn || !wrap) return;

        if (btn.dataset.bound === '1') {
            renderMenu(teams);
            return;
        }
        btn.dataset.bound = '1';

        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            if (teams.length === 2) {
                const other = teams.find(t => !teamIsCurrentOnPage(t));
                navigateToTeam(other);
                return;
            }
            if (menuOpen) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        document.addEventListener('click', e => {
            if (!menuOpen) return;
            if (e.target.closest('.header-team-switch__host')) return;
            closeMenu();
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closeMenu();
        });

        renderMenu(teams);
    }

    async function fetchTeams() {
        try {
            const res = await fetch(getMyTeamsUrl(), { credentials: 'same-origin' });
            if (res.status === 401 || res.status === 403) {
                return null;
            }
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }

    async function initHeaderTeamSwitch() {
        const wrap = getWrap();
        if (!wrap) return;

        const data = await fetchTeams();
        if (!data || !data.canSwitch || !Array.isArray(data.teams) || data.teams.length < 2) {
            wrap.hidden = true;
            closeMenu();
            return;
        }

        teamsCache = data.teams;
        wrap.hidden = false;

        const menu = getMenu();
        if (data.teams.length === 2 && menu) {
            menu.hidden = true;
        }

        bindButton(data.teams);
    }

    window.tpInitHeaderTeamSwitch = initHeaderTeamSwitch;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeaderTeamSwitch);
    } else {
        initHeaderTeamSwitch();
    }
})();
