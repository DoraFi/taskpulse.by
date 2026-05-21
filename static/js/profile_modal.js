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

    function updateBirthDateDisplay(overlay, iso) {
        const hidden = overlay.querySelector('#profileBirthDate');
        const display = overlay.querySelector('#profileBirthDateDisplay');
        if (hidden) hidden.value = iso || '';
        if (display) {
            display.textContent = iso && typeof window.tpFormatDateRu === 'function'
                ? window.tpFormatDateRu(iso)
                : (iso || 'Не указана');
        }
    }

    function bindBirthDatePicker(overlay) {
        const trigger = overlay.querySelector('#profileBirthDateTrigger');
        if (!trigger || trigger.dataset.tpBirthBound === '1') return;
        trigger.dataset.tpBirthBound = '1';

        const runPicker = () => {
            if (typeof window.openTpDatePicker !== 'function') return;
            const current = overlay.querySelector('#profileBirthDate')?.value || '';
            window.openTpDatePicker({
                title: 'Дата рождения',
                value: current,
                withTime: false,
                minYear: 1920,
                maxYear: new Date().getFullYear(),
                allowClear: true,
                onApply: (iso) => updateBirthDateDisplay(overlay, iso || ''),
            });
        };

        const openPickerFlow = () => {
            if (typeof window.openTpDatePicker === 'function') {
                runPicker();
                return;
            }
            const script = document.createElement('script');
            script.src = '/static/js/tp_date_picker.js';
            script.onload = runPicker;
            document.head.appendChild(script);
        };

        const onActivate = (e) => {
            e.preventDefault();
            openPickerFlow();
        };

        trigger.addEventListener('click', onActivate);
        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') onActivate(e);
        });
    }

    function initModal(overlay) {
        if (overlay._profileModalInited) return;
        const panel = overlay.querySelector('.profile-modal');
        if (!panel) return;
        overlay._profileModalInited = true;
        bindBirthDatePicker(overlay);

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
        overlay.querySelector('#profileModalLeaveTeam')?.addEventListener('click', async e => {
            e.preventDefault();
            const doLeave = async () => {
            const leaveBtn = overlay.querySelector('#profileModalLeaveTeam');
            if (leaveBtn) leaveBtn.disabled = true;
            try {
                const res = await fetch(apiUrl('/team/members/leave'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                });
                const text = await res.text();
                let data = {};
                if (text) {
                    try { data = JSON.parse(text); } catch { data = {}; }
                }
                if (!res.ok) {
                    showProfileToast(data.message || data.detail || 'Не удалось покинуть команду');
                    return;
                }
                showProfileToast('Вы покинули команду');
                closeModal(overlay);
                window.location.href = '/';
            } catch (err) {
                console.error(err);
                showProfileToast('Ошибка сети');
            } finally {
                if (leaveBtn) leaveBtn.disabled = false;
            }
            };
            if (typeof window.openTeamConfirmModal === 'function') {
                window.openTeamConfirmModal({
                    title: 'Покинуть команду',
                    message: 'Вы уверены, что хотите покинуть эту команду?',
                    confirmLabel: 'Покинуть',
                    danger: true,
                    onConfirm: doLeave,
                });
            } else if (window.confirm('Покинуть эту команду?')) {
                doLeave();
            }
        });
        overlay.querySelector('#profileModalSave')?.addEventListener('click', async e => {
            e.preventDefault();
            const saveBtn = overlay.querySelector('#profileModalSave');
            if (saveBtn) saveBtn.disabled = true;
            try {
                const payload = {
                    lastName: overlay.querySelector('#profileLastName')?.value?.trim() || '',
                    firstName: overlay.querySelector('#profileFirstName')?.value?.trim() || '',
                    patronymic: overlay.querySelector('#profilePatronymic')?.value?.trim() || '',
                    email: overlay.querySelector('#profileEmail')?.value?.trim() || '',
                    phone: overlay.querySelector('#profilePhone')?.value?.trim() || '',
                    timezone: overlay.querySelector('#profileTimezone')?.value || 'Europe/Minsk',
                    office: overlay.querySelector('#profileOffice')?.value?.trim() || '',
                    bio: overlay.querySelector('#profileBio')?.value?.trim() || '',
                    birthDate: overlay.querySelector('#profileBirthDate')?.value || '',
                    birthDateVisibility: overlay.querySelector('#profileBirthVisibility')?.value || 'hidden',
                };
                const res = await fetch(apiUrl('/me/update'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(payload),
                });
                const text = await res.text();
                let data = {};
                if (text) {
                    try { data = JSON.parse(text); } catch { data = {}; }
                }
                if (!res.ok) {
                    showProfileToast(data.message || data.detail || 'Не удалось сохранить профиль');
                    return;
                }
                showProfileToast('Профиль сохранён');
                await loadProfileData(overlay);
                if (typeof window.initTeamPage === 'function') window.initTeamPage();
            } catch (err) {
                console.error(err);
                showProfileToast('Ошибка сети');
            } finally {
                if (saveBtn) saveBtn.disabled = false;
            }
        });
        overlay.querySelector('#profileModalChangePassword')?.addEventListener('click', async e => {
            e.preventDefault();
            const btn = e.currentTarget;
            const cur = overlay.querySelector('#profilePwdCurrent');
            const neu = overlay.querySelector('#profilePwdNew');
            const rep = overlay.querySelector('#profilePwdRepeat');
            const currentPassword = cur?.value || '';
            const newPassword = neu?.value || '';
            const newPasswordConfirm = rep?.value || '';
            if (!currentPassword || !newPassword || !newPasswordConfirm) {
                showProfileToast('Заполните все поля пароля');
                return;
            }
            const passOk = /[A-Za-zА-Яа-яЁё]/.test(newPassword) && /\d/.test(newPassword) && newPassword.length >= 8;
            if (!passOk) {
                showProfileToast('Новый пароль должен содержать буквы и цифры и быть длиной от 8 символов');
                return;
            }
            if (newPassword !== newPasswordConfirm) {
                showProfileToast('Новый пароль и повтор не совпадают');
                return;
            }
            if (currentPassword === newPassword) {
                showProfileToast('Новый пароль должен отличаться от текущего');
                return;
            }
            if (btn) btn.disabled = true;
            try {
                const res = await fetch(apiUrl('/me/change-password'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ currentPassword, newPassword, newPasswordConfirm }),
                });
                const text = await res.text();
                let data = {};
                if (text) {
                    try { data = JSON.parse(text); } catch { data = {}; }
                }
                if (!res.ok) {
                    showProfileToast(data.message || data.detail || 'Не удалось обновить пароль');
                    return;
                }
                showProfileToast('Пароль обновлён');
                if (cur) cur.value = '';
                if (neu) neu.value = '';
                if (rep) rep.value = '';
            } catch (err) {
                console.error(err);
                showProfileToast('Ошибка сети');
            } finally {
                if (btn) btn.disabled = false;
            }
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
        if (typeof window.initAllTpSelects === 'function') {
            window.initAllTpSelects(overlay);
        }
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
            if (titleName) {
                const full = [data.lastName, data.firstName, data.patronymic]
                    .map((v) => String(v || '').trim())
                    .filter(Boolean)
                    .join(' ');
                titleName.textContent = full || data.fullName || '';
            }
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

            setValue('#profileLastName', data.lastName);
            setValue('#profileFirstName', data.firstName);
            setValue('#profilePatronymic', data.patronymic);
            updateBirthDateDisplay(overlay, data.birthDate || '');
            setValue('#profileBirthVisibility', data.birthDateVisibility || 'hidden');
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

            const leaveBtn = overlay.querySelector('#profileModalLeaveTeam');
            if (leaveBtn) leaveBtn.hidden = !data.canLeaveTeam;
        } catch (err) {
            console.error(err);
        }
    }

    async function openProfileModal() {
        const overlay = await ensureModal();
        if (!overlay) return;
        await loadProfileData(overlay);
        openModal(overlay);
    }

    window.openProfileModal = openProfileModal;

    function bindHeader() {
        const btn = document.getElementById('headerProfileBtn');
        if (!btn || btn.dataset.tpProfileBound === '1') return;
        btn.dataset.tpProfileBound = '1';
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await openProfileModal();
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
