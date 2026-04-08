(function () {
    if (window.__profileModalBoot) return;
    window.__profileModalBoot = true;

    const MODAL_URL = '/templates/components/profile_modal.html';

    function openModal(overlay) {
        if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function closeModal(overlay) {
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
            if (!window.confirm('Выйти из профиля? Несохранённые изменения не будут сохранены.')) return;
            closeModal(overlay);
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

    function bindHeader() {
        const btn = document.getElementById('headerProfileBtn');
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
