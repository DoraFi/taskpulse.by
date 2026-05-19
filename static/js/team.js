function getApiBasePath() {
    const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
    if (!m) return '/api';
    return `/o/${m[1]}/t/${m[2]}/api`;
}

function apiUrl(path) {
    return `${getApiBasePath()}${path}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function pluralMembers(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'участников';
    if (mod10 === 1) return 'участник';
    if (mod10 >= 2 && mod10 <= 4) return 'участника';
    return 'участников';
}

function avatarSrc(member) {
    return `/static/source/user_img/${encodeURIComponent(member.avatar || 'basic_avatar.png')}`;
}

function showTeamToast(msg) {
    if (!msg) return;
    if (typeof window.showToast === 'function') {
        window.showToast(msg);
        return;
    }
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

function parseApiError(res, data, fallback) {
    if (typeof data === 'string' && data.trim()) return data.trim();
    return data?.message || data?.detail || data?.error || data?.title || fallback || `Запрос не выполнен (${res?.status || '-'})`;
}

function ensureTeamConfirmModal() {
    let overlay = document.getElementById('teamConfirmModal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'teamConfirmModal';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="modal-content auth-flow-card team-confirm-modal" role="dialog" aria-modal="true">
            <div class="modal-header">
                <p class="text-header" id="teamConfirmModalTitle">Подтверждение</p>
                <button type="button" class="modal-close" id="teamConfirmModalClose" aria-label="Закрыть">
                    <img src="/static/source/icons/cross.svg" alt="" width="24" height="24">
                </button>
            </div>
            <div class="modal-body">
                <p class="text-basic" id="teamConfirmModalMessage"></p>
            </div>
            <div class="modal-footer">
                <button type="button" class="button-secondary" id="teamConfirmModalCancel">Отмена</button>
                <button type="button" class="button-basic" id="teamConfirmModalOk">Подтвердить</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

function openTeamConfirmModal({ title, message, confirmLabel, danger, onConfirm }) {
    const overlay = ensureTeamConfirmModal();
    if (!overlay) {
        if (window.confirm(message || title || 'Подтвердить?')) onConfirm?.();
        return;
    }
    const titleEl = overlay.querySelector('#teamConfirmModalTitle');
    const msgEl = overlay.querySelector('#teamConfirmModalMessage');
    const okBtn = overlay.querySelector('#teamConfirmModalOk');
    const cancelBtn = overlay.querySelector('#teamConfirmModalCancel');
    const closeBtn = overlay.querySelector('#teamConfirmModalClose');
    if (titleEl) titleEl.textContent = title || 'Подтверждение';
    if (msgEl) msgEl.textContent = message || '';
    if (okBtn) {
        okBtn.textContent = confirmLabel || 'Подтвердить';
        okBtn.className = danger ? 'button-basic' : 'button-basic';
    }
    const close = () => {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
    };
    if (!overlay.dataset.tpConfirmBound) {
        overlay.dataset.tpConfirmBound = '1';
        cancelBtn?.addEventListener('click', close);
        closeBtn?.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
    }
    okBtn.onclick = () => {
        close();
        onConfirm?.();
    };
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    cancelBtn?.focus();
}

window.openTeamConfirmModal = openTeamConfirmModal;

function addMemberSuccessMessage(data) {
    const email = data?.email || '';
    const role = data?.accessRoleLabel || '';
    if (data?.mode === 'invitation') {
        return data.message || `Приглашение отправлено на ${email}`;
    }
    if (data?.mode === 'member') {
        return data.message || (role ? `Участник ${email} добавлен как «${role}»` : `Участник ${email} добавлен в команду`);
    }
    return data?.message || 'Готово';
}

let memberPositionCombobox = null;
let memberDepartmentCombobox = null;

let teamPageState = {
    members: [],
    positions: [],
    departments: [],
    canManageRoles: false,
    canAddMembers: false,
    teamName: '',
    currentUserEmail: '',
    selectedMember: null,
};

function memberShortName(member) {
    const ln = String(member?.lastName || '').trim();
    const fn = String(member?.firstName || '').trim();
    if (ln || fn) return [ln, fn].filter(Boolean).join(' ');
    const parts = String(member?.fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
    return parts[0] || '-';
}

function memberFullName(member) {
    const ln = String(member?.lastName || '').trim();
    const fn = String(member?.firstName || '').trim();
    const pat = String(member?.patronymic || '').trim();
    if (ln || fn || pat) {
        return [ln, fn, pat].filter(Boolean).join(' ');
    }
    return String(member?.fullName || '').trim() || '-';
}

function memberDisplayName(member) {
    return memberFullName(member);
}

function openTeamMemberModal() {
    const overlay = document.getElementById('teamMemberModal');
    if (!overlay) return;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
}

function closeTeamMemberModal() {
    const overlay = document.getElementById('teamMemberModal');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    teamPageState.selectedMember = null;
    const err = document.getElementById('teamMemberModalError');
    if (err) {
        err.hidden = true;
        err.textContent = '';
    }
}

function openAddMemberModal() {
    const overlay = document.getElementById('teamAddMemberModal');
    if (!overlay) return;
    const err = document.getElementById('teamAddMemberError');
    if (err) {
        err.hidden = true;
        err.textContent = '';
    }
    const email = document.getElementById('teamAddMemberEmail');
    const role = document.getElementById('teamAddMemberRole');
    if (email) email.value = '';
    if (role) role.value = 'member';
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    if (typeof window.initAllTpSelects === 'function') {
        window.initAllTpSelects(overlay);
    }
    email?.focus();
}

function closeAddMemberModal() {
    const overlay = document.getElementById('teamAddMemberModal');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
}

function setupAddMemberModal() {
    const overlay = document.getElementById('teamAddMemberModal');
    if (!overlay || overlay.dataset.tpAddMember === '1') return;
    overlay.dataset.tpAddMember = '1';

    const close = () => closeAddMemberModal();
    overlay.querySelector('#teamAddMemberModalClose')?.addEventListener('click', close);
    overlay.querySelector('#teamAddMemberCancel')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    overlay.querySelector('#teamAddMemberSubmit')?.addEventListener('click', async () => {
        const submitBtn = overlay.querySelector('#teamAddMemberSubmit');
        const errEl = document.getElementById('teamAddMemberError');
        const email = String(document.getElementById('teamAddMemberEmail')?.value || '').trim();
        const roleCode = document.getElementById('teamAddMemberRole')?.value || 'member';

        if (!email) {
            if (errEl) {
                errEl.textContent = 'Укажите email';
                errEl.hidden = false;
            }
            return;
        }

        if (submitBtn) submitBtn.disabled = true;
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = '';
        }

        try {
            const res = await fetch(apiUrl('/team/members/add'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ email, roleCode }),
            });
            const text = await res.text();
            let data = {};
            if (text) {
                try { data = JSON.parse(text); } catch { data = {}; }
            }
            if (!res.ok) {
                if (errEl) {
                    let msg = parseApiError(res, data);
                    if (res.status === 403) msg = 'Недостаточно прав для добавления участников';
                    else if (res.status === 409) msg = msg || 'Конфликт при добавлении';
                    errEl.textContent = msg;
                    errEl.hidden = false;
                }
                return;
            }
            showTeamToast(addMemberSuccessMessage(data));
            closeAddMemberModal();
            initTeamPage();
        } catch (e) {
            console.error(e);
            if (errEl) {
                errEl.textContent = 'Ошибка сети. Проверьте подключение и попробуйте снова.';
                errEl.hidden = false;
            }
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

function setupTeamMemberModal() {
    const overlay = document.getElementById('teamMemberModal');
    if (!overlay || overlay.dataset.tpTeamModal === '1') return;
    overlay.dataset.tpTeamModal = '1';

    const closeBtn = document.getElementById('teamMemberModalClose');
    const cancelBtn = document.getElementById('teamMemberModalCancel');
    const saveBtn = document.getElementById('teamMemberModalSave');
    const removeBtn = document.getElementById('teamMemberModalRemove');
    const mailSendBtn = document.getElementById('teamMemberMailSend');

    const close = () => closeTeamMemberModal();
    closeBtn?.addEventListener('click', close);
    cancelBtn?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    saveBtn?.addEventListener('click', async () => {
        const member = teamPageState.selectedMember;
        if (!member || !teamPageState.canManageRoles || member.isSelf) return;

        const roleSelect = document.getElementById('teamMemberRoleSelect');
        const errEl = document.getElementById('teamMemberModalError');
        const roleCode = roleSelect?.value || 'member';
        const position = memberPositionCombobox?.getValue()
            || document.getElementById('teamMemberPositionEdit')?.value?.trim()
            || '';
        const department = memberDepartmentCombobox?.getValue()
            || document.getElementById('teamMemberDepartmentEdit')?.value?.trim()
            || '';

        saveBtn.disabled = true;
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = '';
        }

        try {
            const res = await fetch(apiUrl('/team/members/role'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    userPublicId: member.publicId,
                    roleCode,
                    position,
                    department,
                }),
            });
            const text = await res.text();
            let data = {};
            if (text) {
                try { data = JSON.parse(text); } catch { data = {}; }
            }
            if (!res.ok) {
                if (errEl) {
                    errEl.textContent = parseApiError(res, data);
                    errEl.hidden = false;
                }
                return;
            }
            showTeamToast(data.message || 'Данные участника обновлены');
            close();
            initTeamPage();
        } catch (e) {
            console.error(e);
            if (errEl) {
                errEl.textContent = 'Ошибка сети';
                errEl.hidden = false;
            }
        } finally {
            saveBtn.disabled = false;
        }
    });

    removeBtn?.addEventListener('click', async () => {
        const member = teamPageState.selectedMember;
        if (!member || !teamPageState.canManageRoles || member.isSelf) return;
        openTeamConfirmModal({
            title: 'Удалить из команды',
            message: `Удалить ${memberShortName(member)} из команды?`,
            confirmLabel: 'Удалить',
            danger: true,
            onConfirm: () => runRemoveMember(member, removeBtn),
        });
    });

    async function runRemoveMember(member, removeBtn) {
        const errEl = document.getElementById('teamMemberModalError');
        removeBtn.disabled = true;
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = '';
        }

        try {
            const res = await fetch(apiUrl('/team/members/remove'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ userPublicId: member.publicId }),
            });
            const text = await res.text();
            let data = {};
            if (text) {
                try { data = JSON.parse(text); } catch { data = {}; }
            }
            if (!res.ok) {
                if (errEl) {
                    errEl.textContent = parseApiError(res, data);
                    errEl.hidden = false;
                }
                return;
            }
            showTeamToast('Участник удалён из команды');
            closeTeamMemberModal();
            initTeamPage();
        } catch (e) {
            console.error(e);
            if (errEl) {
                errEl.textContent = 'Ошибка сети';
                errEl.hidden = false;
            }
        } finally {
            removeBtn.disabled = false;
        }
    }

    mailSendBtn?.addEventListener('click', async () => {
        const member = teamPageState.selectedMember;
        if (!member || member.isSelf) return;

        const subject = String(document.getElementById('teamMailSubject')?.value || '').trim();
        const body = String(document.getElementById('teamMailBody')?.value || '').trim();
        const errEl = document.getElementById('teamMemberModalError');

        if (!subject || !body) {
            if (errEl) {
                errEl.textContent = 'Заполните тему и текст письма';
                errEl.hidden = false;
            }
            return;
        }

        mailSendBtn.disabled = true;
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = '';
        }

        try {
            const res = await fetch(apiUrl('/team/members/message'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    userPublicId: member.publicId,
                    subject,
                    body,
                }),
            });
            const text = await res.text();
            let data = {};
            if (text) {
                try { data = JSON.parse(text); } catch { data = {}; }
            }
            if (!res.ok) {
                if (errEl) {
                    errEl.textContent = parseApiError(res, data);
                    errEl.hidden = false;
                }
                return;
            }
            showTeamToast(data.message || 'Сообщение отправлено');
            document.getElementById('teamMailSubject').value = '';
            document.getElementById('teamMailBody').value = '';
        } catch (e) {
            console.error(e);
            if (errEl) {
                errEl.textContent = 'Ошибка сети';
                errEl.hidden = false;
            }
        } finally {
            mailSendBtn.disabled = false;
        }
    });
}

function renderModalStats(stats) {
    const assigned = stats?.assigned ?? 0;
    const inProgress = stats?.inProgress ?? 0;
    const doneMonth = stats?.monthDone ?? stats?.doneMonth ?? 0;
    return `
        <div class="profile-modal__stat br-5">
            <span class="text-signature">Назначено</span>
            <span class="text-header">${assigned}</span>
        </div>
        <div class="profile-modal__stat br-5">
            <span class="text-signature">В работе</span>
            <span class="text-header">${inProgress}</span>
        </div>
        <div class="profile-modal__stat br-5">
            <span class="text-signature">Завершено (мес.)</span>
            <span class="text-header">${doneMonth}</span>
        </div>
    `;
}

function personalDisplayValue(value) {
    const text = String(value ?? '').trim();
    if (!text || text === '-' || text === '—') return '';
    if (/^не\s+указан/i.test(text)) return '';
    return text;
}

function renderPersonalRows(member) {
    const rows = [];
    const birth = personalDisplayValue(member?.birthDisplay);
    if (birth) {
        const label = personalDisplayValue(member?.birthFieldLabel) || 'Дата рождения';
        rows.push([label, birth]);
    }
    return rows;
}

function setModalSectionVisible(section, visible) {
    if (!section) return;
    section.hidden = !visible;
    section.style.display = visible ? '' : 'none';
    if (visible) {
        section.removeAttribute('aria-hidden');
    } else {
        section.setAttribute('aria-hidden', 'true');
    }
}

function fillPersonalSection(member) {
    const section = document.getElementById('teamMemberPersonalSection');
    const list = document.getElementById('teamMemberPersonalList');
    if (!section || !list) return;

    const rows = renderPersonalRows(member);
    if (!rows.length) {
        setModalSectionVisible(section, false);
        list.innerHTML = '';
        return;
    }

    setModalSectionVisible(section, true);
    list.innerHTML = rows.map(([k, v]) => `
        <li class="profile-modal__activity-row">
            <span class="profile-modal__activity-key text-signature">${escapeHtml(k)}</span>
            <span class="profile-modal__activity-value text-basic">${escapeHtml(v)}</span>
        </li>
    `).join('');
}

function setupMailSection(member) {
    const mailSection = document.getElementById('teamMemberMailSection');
    const fromEl = document.getElementById('teamMailFrom');
    const toEl = document.getElementById('teamMailTo');
    const subjectEl = document.getElementById('teamMailSubject');
    const bodyEl = document.getElementById('teamMailBody');

    if (!mailSection) return;

    if (member.isSelf || !member.email) {
        mailSection.hidden = true;
        return;
    }

    mailSection.hidden = false;
    if (fromEl) fromEl.textContent = teamPageState.currentUserEmail || '-';
    if (toEl) toEl.textContent = member.email;
    if (subjectEl) subjectEl.value = '';
    if (bodyEl) bodyEl.value = '';
}

function setMemberRoleMode(canEdit) {
    const wrap = document.getElementById('teamMemberRoleWrap');
    if (!wrap) return;
    wrap.classList.toggle('is-editing', Boolean(canEdit));
}

function initMemberComboboxes() {
    const posInput = document.getElementById('teamMemberPositionEdit');
    const depInput = document.getElementById('teamMemberDepartmentEdit');
    if (typeof window.initTpCombobox !== 'function') return;

    if (posInput && !posInput.dataset.tpCombobox) {
        memberPositionCombobox = window.initTpCombobox(posInput, {
            options: teamPageState.positions || [],
            createLabel: 'Добавить должность «{value}»',
            onAddOption: (value) => {
                if (!teamPageState.positions.includes(value)) {
                    teamPageState.positions.push(value);
                    teamPageState.positions.sort((a, b) => a.localeCompare(b, 'ru'));
                    setupPositionFilter();
                    memberPositionCombobox?.setOptions(teamPageState.positions);
                }
            },
        });
    }

    if (depInput && !depInput.dataset.tpCombobox) {
        memberDepartmentCombobox = window.initTpCombobox(depInput, {
            options: teamPageState.departments || [],
            createLabel: 'Добавить отдел «{value}»',
            onAddOption: (value) => {
                if (!teamPageState.departments.includes(value)) {
                    teamPageState.departments.push(value);
                    teamPageState.departments.sort((a, b) => a.localeCompare(b, 'ru'));
                    setupDepartmentFilter();
                    memberDepartmentCombobox?.setOptions(teamPageState.departments);
                }
            },
        });
    }
}

function memberPositionValue(member) {
    const p = String(member?.position || '').trim();
    return p && p !== 'Участник команды' ? p : '';
}

function memberDepartmentValue(member) {
    const d = String(member?.department || '').trim();
    return d && d !== 'Команда' ? d : '';
}

function fillMemberModal(member) {
    const canEdit = teamPageState.canManageRoles && !member.isSelf;
    const roleSection = document.getElementById('teamMemberRoleSection');
    const contactsSection = document.getElementById('teamMemberContactsSection');
    const statsSection = document.getElementById('teamMemberStatsSection');
    const statsEl = document.getElementById('teamMemberModalStats');
    const removeBtn = document.getElementById('teamMemberModalRemove');

    document.getElementById('teamMemberModalName').textContent = memberFullName(member);
    document.getElementById('teamMemberModalPosition').textContent = [
        member.position,
        member.department,
    ].filter(Boolean).join(' · ') || '-';

    const metaEl = document.getElementById('teamMemberModalMeta');
    if (metaEl) metaEl.textContent = member.accessRoleLabel || 'Участник';

    const avatarEl = document.getElementById('teamMemberModalAvatar');
    if (avatarEl) {
        avatarEl.src = avatarSrc(member);
        avatarEl.alt = memberDisplayName(member);
    }

    fillPersonalSection(member);
    setupMailSection(member);

    const roleSelect = document.getElementById('teamMemberRoleSelect');
    const roleLabel = document.getElementById('teamMemberRoleLabel');
    const positionField = document.getElementById('teamMemberPositionField');
    const departmentField = document.getElementById('teamMemberDepartmentField');
    const positionInput = document.getElementById('teamMemberPositionEdit');
    const departmentInput = document.getElementById('teamMemberDepartmentEdit');
    const saveBtn = document.getElementById('teamMemberModalSave');

    if (removeBtn) removeBtn.hidden = !canEdit;

    if (statsSection) statsSection.hidden = false;
    if (roleSection) roleSection.hidden = false;

    initMemberComboboxes();
    memberPositionCombobox?.setOptions(teamPageState.positions || []);
    memberDepartmentCombobox?.setOptions(teamPageState.departments || []);

    if (canEdit) {
        setMemberRoleMode(true);
        if (positionField) positionField.hidden = false;
        if (departmentField) departmentField.hidden = false;
        if (roleSelect) roleSelect.value = member.accessRole || 'member';
        memberPositionCombobox?.setValue(memberPositionValue(member));
        memberDepartmentCombobox?.setValue(memberDepartmentValue(member));
        if (saveBtn) saveBtn.hidden = false;
    } else {
        setMemberRoleMode(false);
        if (positionField) positionField.hidden = true;
        if (departmentField) departmentField.hidden = true;
        if (roleLabel) roleLabel.value = member.accessRoleLabel || 'Участник';
        if (saveBtn) saveBtn.hidden = true;
    }

    if (statsEl) statsEl.innerHTML = renderModalStats(member);

    const contactsList = document.getElementById('teamMemberModalContacts');
    const contactRows = [];
    if (member.email) contactRows.push(['Email', member.email]);
    if (member.phone) contactRows.push(['Телефон', member.phone]);

    if (contactsSection && contactsList) {
        if (contactRows.length) {
            setModalSectionVisible(contactsSection, true);
            contactsList.innerHTML = contactRows.map(([k, v]) => `
                <li class="profile-modal__activity-row">
                    <span class="profile-modal__activity-key text-signature">${escapeHtml(k)}</span>
                    <span class="profile-modal__activity-value text-basic">${escapeHtml(v)}</span>
                </li>
            `).join('');
        } else {
            setModalSectionVisible(contactsSection, false);
            contactsList.innerHTML = '';
        }
    }
}

function memberCardContactsHtml(member) {
    const email = String(member.email || '').trim();
    const phone = String(member.phone || '').trim();
    const parts = [];

    if (email) {
        parts.push(`
            <button type="button" class="member-card__contact member-card__contact--email member-card__contact-action" data-action="mail" data-member-id="${escapeHtml(member.publicId)}" title="Написать на email">
                <span class="member-card__contact-label">Email</span>
                <span class="member-card__contact-value">${escapeHtml(email)}</span>
            </button>
        `);
    }

    if (phone) {
        parts.push(`
            <div class="member-card__contact member-card__contact--phone">
                <span class="member-card__contact-label">Телефон</span>
                <span class="member-card__contact-value">${escapeHtml(phone)}</span>
            </div>
        `);
    }

    if (!parts.length) return '';
    const contactsClass = phone ? 'member-card__contacts' : 'member-card__contacts member-card__contacts--email-only';
    return `<div class="${contactsClass}">${parts.join('')}</div>`;
}

function renderMemberCard(member) {
    const subtitle = [member.position, member.department].filter(Boolean).join(' · ');
    const selfBadge = member.isSelf
        ? '<span class="member-card__self-badge project-card__chip text-signature">Вы</span>'
        : '';

    return `
        <article class="member-card project-card${member.isSelf ? ' member-card--self' : ''}" data-member-id="${escapeHtml(member.publicId)}" tabindex="0" role="button" aria-label="Открыть карточку ${escapeHtml(memberShortName(member))}">
            <div class="project-card__body member-card__body">
                <div class="project-card__head member-card__head">
                    <img class="member-card__avatar-img" src="${escapeHtml(avatarSrc(member))}" alt="">
                    <div class="project-card__titles">
                        <p class="text-header project-card__title">
                            ${escapeHtml(memberShortName(member))}
                            ${selfBadge}
                        </p>
                        <p class="text-signature project-card__subtitle">${escapeHtml(subtitle || '-')}</p>
                    </div>
                    <span class="project-card__chip text-signature">${escapeHtml(member.accessRoleLabel)}</span>
                </div>
                ${memberCardContactsHtml(member)}
                <div class="project-card__stats member-card__stats">
                    <div class="project-card__stat">
                        <span class="text-signature">Назначено</span>
                        <span class="text-basic">${member.assigned ?? 0}</span>
                    </div>
                    <div class="project-card__stat">
                        <span class="text-signature">В работе</span>
                        <span class="text-basic">${member.inProgress ?? 0}</span>
                    </div>
                    <div class="project-card__stat">
                        <span class="text-signature">Завершено</span>
                        <span class="text-basic">${member.doneMonth ?? 0}</span>
                    </div>
                </div>
            </div>
        </article>
    `;
}

function memberSortRank(member) {
    if (member?.isSelf) return 0;
    const role = String(member?.accessRole || 'member');
    if (role === 'team_admin') return 1;
    if (role === 'observer') return 3;
    return 2;
}

function sortMembersForDisplay(members) {
    return [...members].sort((a, b) => {
        const rankDiff = memberSortRank(a) - memberSortRank(b);
        if (rankDiff !== 0) return rankDiff;
        const nameA = memberShortName(a);
        const nameB = memberShortName(b);
        return nameA.localeCompare(nameB, 'ru', { sensitivity: 'base' });
    });
}

function filterMembers() {
    const q = String(document.getElementById('teamSearchInput')?.value || '').trim().toLowerCase();
    const position = document.getElementById('teamPositionFilter')?.value || '';
    const department = document.getElementById('teamDepartmentFilter')?.value || '';

    return teamPageState.members.filter((m) => {
        if (position && (m.position || '') !== position) return false;
        if (department && (m.department || '') !== department) return false;
        if (!q) return true;
        const hay = [
            m.fullName,
            m.lastName,
            m.firstName,
            m.patronymic,
            m.position,
            m.department,
            m.accessRoleLabel,
            m.email,
            m.phone,
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
    });
}

let teamTitleEditing = false;

function updateTeamHero() {
    const count = teamPageState.members.length;
    const title = document.getElementById('teamPageTitle');
    const badge = document.getElementById('teamPageCountBadge');

    if (title && !teamTitleEditing) {
        title.textContent = teamPageState.teamName || 'Команда';
    }
    if (badge) badge.textContent = `${count} ${pluralMembers(count)}`;
    applyTeamTitleAdminUi();
}

function applyTeamTitleAdminUi() {
    const title = document.getElementById('teamPageTitle');
    if (!title || teamTitleEditing) return;
    if (teamPageState.canManageRoles) {
        title.classList.add('is-editable');
    } else {
        title.classList.remove('is-editable');
    }
}

async function saveTeamName(name) {
    const res = await fetch(apiUrl('/team/members/role'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName: name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(parseApiError(res, data, 'Не удалось переименовать команду'));
    }
    return data;
}

function beginTeamTitleEdit() {
    const title = document.getElementById('teamPageTitle');
    if (!title || teamTitleEditing || !teamPageState.canManageRoles) return;

    const row = title.closest('.team-page__title-row');
    if (!row) return;

    teamTitleEditing = true;
    const previous = teamPageState.teamName || title.textContent.trim() || 'Команда';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'teamPageTitleInput';
    input.className = 'team-page__title-input text-header';
    input.value = previous;
    input.maxLength = 140;
    input.setAttribute('aria-label', 'Название команды');

    title.hidden = true;
    row.insertBefore(input, title.nextSibling);
    input.focus();
    input.select();

    let finished = false;
    const finish = async (save) => {
        if (finished) return;
        finished = true;

        const next = input.value.trim();
        input.remove();
        title.hidden = false;
        teamTitleEditing = false;

        if (!save || !next || next === previous) {
            title.textContent = previous;
            applyTeamTitleAdminUi();
            return;
        }

        try {
            const data = await saveTeamName(next);
            teamPageState.teamName = data.teamName || next;
            title.textContent = teamPageState.teamName;
            showTeamToast('Название команды обновлено');
        } catch (err) {
            console.error(err);
            title.textContent = previous;
            showTeamToast(err.message || 'Не удалось переименовать команду');
        }
        applyTeamTitleAdminUi();
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
        }
    });
    input.addEventListener('blur', () => finish(true));
}

function setupTeamTitleRename() {
    const title = document.getElementById('teamPageTitle');
    if (!title || title.dataset.tpRenameBound) return;
    title.dataset.tpRenameBound = '1';
    title.addEventListener('click', (e) => {
        if (!teamPageState.canManageRoles) return;
        e.preventDefault();
        beginTeamTitleEdit();
    });
}

function setupSelectFilter(selectId, wrapId, items, emptyLabel) {
    const wrap = document.getElementById(wrapId);
    const select = document.getElementById(selectId);
    if (!select) return;

    const values = items || [];
    if (!values.length) {
        if (wrap) wrap.hidden = true;
        select.value = '';
        return;
    }

    if (wrap) wrap.hidden = false;
    const current = select.value;
    select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>` + values.map((p) => `
        <option value="${escapeHtml(p)}">${escapeHtml(p)}</option>
    `).join('');
    if (current && values.includes(current)) {
        select.value = current;
    }
    select._tpSelectApi?.refresh?.();
}

function setupPositionFilter() {
    setupSelectFilter('teamPositionFilter', 'teamPositionFilterWrap', teamPageState.positions, 'Все должности');
}

function setupDepartmentFilter() {
    setupSelectFilter('teamDepartmentFilter', 'teamDepartmentFilterWrap', teamPageState.departments, 'Все отделы');
}

function openMemberFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const memberId = params.get('member');
    if (!memberId) return;
    const member = teamPageState.members.find((m) => m.publicId === memberId);
    if (member) openMemberModal(member);
    const clean = window.location.pathname;
    window.history.replaceState({}, '', clean);
}

function openMemberModal(member) {
    if (member.isSelf && typeof window.openProfileModal === 'function') {
        window.openProfileModal();
        return;
    }

    teamPageState.selectedMember = member;
    fillMemberModal(member);
    openTeamMemberModal();
}

function bindMemberCardEvents(card) {
    const id = card.dataset.memberId;
    const member = teamPageState.members.find((m) => m.publicId === id);
    if (!member) return;

    card.addEventListener('click', (e) => {
        if (e.target.closest('.member-card__contact-action')) return;
        openMemberModal(member);
    });

    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            if (e.target.closest('.member-card__contact-action')) return;
            e.preventDefault();
            openMemberModal(member);
        }
    });

    card.querySelectorAll('.member-card__contact-action[data-action="mail"]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openMemberModal(member);
            const mailSection = document.getElementById('teamMemberMailSection');
            mailSection?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            document.getElementById('teamMailSubject')?.focus();
        });
    });
}

function renderTeamGrid() {
    const grid = document.getElementById('teamMembersGrid');
    if (!grid) return;

    const filtered = sortMembersForDisplay(filterMembers());
    if (!filtered.length) {
        grid.innerHTML = `<p class="text-basic">${teamPageState.members.length ? 'Ничего не найдено' : 'В команде пока нет участников'}</p>`;
        return;
    }

    grid.innerHTML = filtered.map(renderMemberCard).join('');
    grid.querySelectorAll('.member-card[data-member-id]').forEach(bindMemberCardEvents);
}

function bindTeamFilters() {
    const search = document.getElementById('teamSearchInput');
    const position = document.getElementById('teamPositionFilter');
    const department = document.getElementById('teamDepartmentFilter');
    const rerender = () => renderTeamGrid();
    if (search && !search.dataset.tpBound) {
        search.dataset.tpBound = '1';
        search.addEventListener('input', rerender);
    }
    if (position && !position.dataset.tpBound) {
        position.dataset.tpBound = '1';
        position.addEventListener('change', rerender);
    }
    if (department && !department.dataset.tpBound) {
        department.dataset.tpBound = '1';
        department.addEventListener('change', rerender);
    }
}

function initTeamPage() {
    const grid = document.getElementById('teamMembersGrid');
    if (!grid) return;

    setupTeamMemberModal();
    setupAddMemberModal();
    setupTeamTitleRename();
    bindTeamFilters();

    const addBtn = document.getElementById('teamAddMemberBtn');
    if (addBtn && !addBtn.dataset.tpBound) {
        addBtn.dataset.tpBound = '1';
        addBtn.addEventListener('click', () => openAddMemberModal());
    }

    fetch(apiUrl('/team/members'), { credentials: 'same-origin' })
        .then((res) => {
            if (!res.ok) throw new Error('team members api failed');
            return res.json();
        })
        .then((data) => {
            teamPageState.members = Array.isArray(data.members) ? data.members : [];
            teamPageState.positions = Array.isArray(data.positions) ? data.positions : [];
            teamPageState.departments = Array.isArray(data.departments) ? data.departments : [];
            teamPageState.canManageRoles = !!data.canManageRoles;
            teamPageState.canAddMembers = !!data.canAddMembers;
            teamPageState.teamName = data.teamName || 'Команда';
            teamPageState.currentUserEmail = data.currentUserEmail || '';

            if (addBtn) addBtn.hidden = !teamPageState.canAddMembers;

            setupPositionFilter();
            setupDepartmentFilter();
            if (typeof window.initAllTpSelects === 'function') {
                window.initAllTpSelects(document.querySelector('.team-page') || document);
            }
            updateTeamHero();
            renderTeamGrid();
            openMemberFromQuery();
        })
        .catch((err) => {
            console.error(err);
            grid.innerHTML = '<p class="text-basic">Не удалось загрузить состав команды</p>';
        });
}

window.initTeamPage = initTeamPage;

function bootTeamPage() {
    initTeamPage();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootTeamPage);
} else {
    bootTeamPage();
}
