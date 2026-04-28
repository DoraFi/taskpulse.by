(function () {
    if (window.__profileModalBoot) return;
    window.__profileModalBoot = true;

    const MODAL_URL = '/templates/components/profile_modal.html';

    function getApiBasePath() {
        const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
        if (!m) return '/api';
        return `/o/${m[1]}/t/${m[2]}/api`;
    }

    function apiUrl(path) {
        return `${getApiBasePath()}${path}`;
    }

    function openModal(overlay) {
        if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
        resetExitConfirm(overlay);
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function resetExitConfirm(overlay) {
        const bar = overlay.querySelector('#profileExitConfirmBar');
        const actions = overlay.querySelector('#profileModalFooterActions');
        if (bar) bar.hidden = true;
        if (actions) actions.hidden = false;
    }

    function closeModal(overlay) {
        resetExitConfirm(overlay);
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.removeProperty('display');
        overlay.style.removeProperty('align-items');
        overlay.style.removeProperty('justify-content');
    }

    function showProfileToast(message) {
        if (typeof window.showToast === 'function') {
            window.showToast(message);
            return;
        }
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2200);
    }

    function initModal(overlay) {
        if (overlay._profileModalInited) return;
        const panel = overlay.querySelector('.profile-modal');
        if (!panel) return;
        overlay._profileModalInited = true;

        overlay.querySelector('#profileModalClose')?.addEventListener('click', e => {
            e.preventDefault();
            closeModal(overlay);
        });
        overlay.querySelector('#profileModalExitProfile')?.addEventListener('click', e => {
            e.preventDefault();
            const bar = overlay.querySelector('#profileExitConfirmBar');
            const actions = overlay.querySelector('#profileModalFooterActions');
            if (bar) bar.hidden = false;
            if (actions) actions.hidden = true;
            queueMicrotask(() => overlay.querySelector('#profileExitConfirmYes')?.focus());
        });
        overlay.querySelector('#profileExitConfirmYes')?.addEventListener('click', e => {
            e.preventDefault();
            closeModal(overlay);
        });
        overlay.querySelector('#profileExitConfirmNo')?.addEventListener('click', e => {
            e.preventDefault();
            resetExitConfirm(overlay);
            overlay.querySelector('#profileModalExitProfile')?.focus();
        });
        overlay.querySelector('#profileModalSave')?.addEventListener('click', e => {
            e.preventDefault();
            showProfileToast('Профиль сохранён');
        });
        overlay.querySelector('#profileModalChangePassword')?.addEventListener('click', e => {
            e.preventDefault();
            const cur = overlay.querySelector('#profilePwdCurrent');
            const neu = overlay.querySelector('#profilePwdNew');
            const rep = overlay.querySelector('#profilePwdRepeat');
            const a = cur?.value?.trim() || '';
            const b = neu?.value?.trim() || '';
            const c = rep?.value?.trim() || '';
            if (!a || !b || !c) {
                showProfileToast('Заполните все поля пароля');
                return;
            }
            if (b.length < 8) {
                showProfileToast('Новый пароль — не короче 8 символов');
                return;
            }
            if (b !== c) {
                showProfileToast('Новый пароль и повтор не совпадают');
                return;
            }
            showProfileToast('Пароль обновлён');
            if (cur) cur.value = '';
            if (neu) neu.value = '';
            if (rep) rep.value = '';
        });
        overlay.addEventListener('click', e => {
            if (!e.target.closest('.profile-modal')) closeModal(overlay);
        });

        if (!window.__profileModalEsc) {
            window.__profileModalEsc = true;
            document.addEventListener('keydown', e => {
                const o = document.getElementById('profileModal');
                if (e.key === 'Escape' && o && o.classList.contains('show')) closeModal(o);
            });
        }
    }

    async function ensureModal() {
        let overlay = document.getElementById('profileModal');
        if (overlay) return overlay;

        const res = await fetch(MODAL_URL);
        if (!res.ok) throw new Error('profile_modal load failed');
        const html = await res.text();
        const tmp = document.createElement('div');
        tmp.innerHTML = html.trim();
        overlay = tmp.querySelector('#profileModal');
        if (!overlay) return null;
        document.body.appendChild(overlay);
        initModal(overlay);
        return overlay;
    }

    async function loadProfileData(overlay) {
        try {
            const res = await fetch(apiUrl('/me'));
            if (!res.ok) throw new Error('profile api failed');
            const data = await res.json();

            const avatar = overlay.querySelector('#profileAvatar');
            if (avatar && data.avatar) avatar.src = `/static/source/user_img/${data.avatar}`;

            const titleName = overlay.querySelector('#profileTitleName');
            if (titleName) titleName.textContent = data.fullName || '';
            const titleRole = overlay.querySelector('#profileTitleRole');
            if (titleRole) titleRole.textContent = `${data.position || 'Участник'} · ${data.teamName || 'команда'}`;
            const titleMeta = overlay.querySelector('#profileTitleMeta');
            if (titleMeta) titleMeta.textContent = `@${data.username || ''} · в команде с ${data.teamSince || ''}`;
            const publicIds = overlay.querySelector('#profilePublicIds');
            if (publicIds) {
                publicIds.textContent = `USR: ${data.publicId || '-'} · TEAM: ${data.teamPublicId || '-'} · ORG: ${data.organizationPublicId || '-'}`;
            }

            const byId = (id, value) => {
                const el = overlay.querySelector(id);
                if (el && value != null) el.textContent = String(value);
            };

            const setValue = (id, value) => {
                const el = overlay.querySelector(id);
                if (el && value != null) el.value = String(value);
            };

            setValue('#profileDisplayName', data.fullName);
            setValue('#profileLogin', data.username);
            setValue('#profileEmail', data.email);
            setValue('#profilePhone', data.phone);
            setValue('#profileTimezone', data.timezone);
            setValue('#profileOffice', data.office);
            setValue('#profileBio', data.bio);

            byId('#profileStatAssigned', data.stats?.assigned ?? 0);
            byId('#profileStatInProgress', data.stats?.inProgress ?? 0);
            byId('#profileStatWeek', data.stats?.weekActivity ?? 0);
            byId('#profileStatMonthDone', data.stats?.monthDone ?? 0);

            const projectsList = overlay.querySelector('#profileProjectsRolesList');
            if (projectsList && Array.isArray(data.projects)) {
                projectsList.innerHTML = data.projects.map(p => `
                    <li class="profile-modal__activity-row">
                        <span class="profile-modal__activity-key text-signature">${p.project || ''}</span>
                        <span class="profile-modal__activity-value text-basic">${p.role || ''}</span>
                    </li>
                `).join('');
            }

            const activityList = overlay.querySelector('#profileActivityList');
            if (activityList && Array.isArray(data.activity)) {
                activityList.innerHTML = data.activity.map(a => `
                    <li class="profile-modal__activity-row">
                        <span class="profile-modal__activity-key text-signature">${a.key || ''}</span>
                        <span class="profile-modal__activity-value text-basic">${a.value || ''}</span>
                    </li>
                `).join('');
            }
        } catch (err) {
            console.error(err);
        }
    }

    function bindHeader() {
        const btn = document.getElementById('headerProfileBtn');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            try {
                const overlay = await ensureModal();
                if (overlay) {
                    await loadProfileData(overlay);
                    openModal(overlay);
                }
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
