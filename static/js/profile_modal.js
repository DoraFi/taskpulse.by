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

    function initModal(overlay) {
        if (overlay._profileModalInited) return;
        const panel = overlay.querySelector('.profile-modal');
        if (!panel) return;
        overlay._profileModalInited = true;

        overlay.querySelector('#profileModalClose')?.addEventListener('click', e => {
            e.preventDefault();
            closeModal(overlay);
        });
        overlay.querySelector('#profileModalDone')?.addEventListener('click', e => {
            e.preventDefault();
            closeModal(overlay);
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
