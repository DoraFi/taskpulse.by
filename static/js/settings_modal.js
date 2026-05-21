(function () {
    if (window.__settingsModalBoot) return;
    window.__settingsModalBoot = true;

    const MODAL_URL = '/templates/components/settings_modal.html';

    function showSettingsToast(message) {
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

    function syncThemeSelect(overlay) {
        const sel = overlay.querySelector('#settingsTheme');
        if (!sel || typeof window.tpGetThemeMode !== 'function') return;
        const mode = window.tpGetThemeMode();
        if (['light', 'dark', 'system'].includes(mode)) sel.value = mode;
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function loadSessions(overlay) {
        const list = overlay.querySelector('#settingsSessionList');
        if (!list) return;
        try {
            const res = await fetch('/api/me', { credentials: 'same-origin' });
            if (!res.ok) throw new Error('me api failed');
            const data = await res.json();
            const sessions = Array.isArray(data.sessions) ? data.sessions : [];
            if (!sessions.length) {
                list.innerHTML = `
                    <li class="settings-modal__session-row br-5">
                        <div>
                            <p class="text-basic settings-modal__session-device">Нет данных о входах</p>
                            <p class="text-signature">Войдите снова, чтобы обновить информацию</p>
                        </div>
                    </li>`;
                return;
            }
            list.innerHTML = sessions.map(s => {
                const device = escapeHtml(s.device || 'Устройство');
                const subtitle = escapeHtml(s.subtitle || s.when || '');
                if (s.current) {
                    return `
                        <li class="settings-modal__session-row br-5">
                            <div>
                                <p class="text-basic settings-modal__session-device">${device}</p>
                                <p class="text-signature">${subtitle}</p>
                            </div>
                            <span class="text-signature settings-modal__session-badge">Текущая</span>
                        </li>`;
                }
                return `
                    <li class="settings-modal__session-row br-5">
                        <div>
                            <p class="text-basic settings-modal__session-device">${device}</p>
                            <p class="text-signature">${subtitle}</p>
                        </div>
                        <button type="button" class="button-secondary settings-modal__session-revoke" disabled title="Скоро">Завершить</button>
                    </li>`;
            }).join('');
        } catch (err) {
            console.error(err);
            list.innerHTML = `
                <li class="settings-modal__session-row br-5">
                    <p class="text-signature">Не удалось загрузить сессии</p>
                </li>`;
        }
    }

    function openModal(overlay, panelId) {
        if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
        const panel = panelId || 'general';
        switchPanel(overlay, panel);
        syncThemeSelect(overlay);
        if (panel === 'security') loadSessions(overlay);
    }

    window.tpOpenSettingsModal = async function tpOpenSettingsModal(panelId) {
        try {
            const overlay = await ensureModal();
            if (overlay) openModal(overlay, panelId);
        } catch (err) {
            console.error(err);
        }
    };

    function closeModal(overlay) {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.removeProperty('display');
        overlay.style.removeProperty('align-items');
        overlay.style.removeProperty('justify-content');
    }

    function switchPanel(overlay, panelId) {
        const panels = overlay.querySelectorAll('.settings-modal__panel');
        const navItems = overlay.querySelectorAll('.settings-modal__nav-item');

        panels.forEach(panel => {
            const match = panel.id === `settings-panel-${panelId}`;
            panel.hidden = !match;
            panel.setAttribute('aria-hidden', match ? 'false' : 'true');
        });

        navItems.forEach(btn => {
            const match = btn.dataset.settingsPanel === panelId;
            btn.classList.toggle('is-active', match);
            btn.setAttribute('aria-selected', match ? 'true' : 'false');
        });

        const panelsEl = overlay.querySelector('.settings-modal__panels');
        if (panelsEl) panelsEl.scrollTop = 0;
    }

    function initModal(overlay) {
        if (overlay._settingsModalInited) return;
        const panel = overlay.querySelector('.settings-modal');
        if (!panel) return;
        overlay._settingsModalInited = true;

        overlay.querySelector('#settingsModalClose')?.addEventListener('click', e => {
            e.preventDefault();
            closeModal(overlay);
        });
        overlay.querySelector('#settingsModalCloseFooter')?.addEventListener('click', e => {
            e.preventDefault();
            closeModal(overlay);
        });
        overlay.querySelector('#settingsModalSave')?.addEventListener('click', e => {
            e.preventDefault();
            showSettingsToast('Настройки сохранены');
        });
        overlay.querySelectorAll('.settings-modal__nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.settingsPanel;
                if (id) {
                    switchPanel(overlay, id);
                    if (id === 'appearance') syncThemeSelect(overlay);
                    if (id === 'security') loadSessions(overlay);
                }
            });
        });

        overlay.querySelector('#settingsTheme')?.addEventListener('change', e => {
            const v = e.target.value;
            if (typeof window.tpSetThemeMode === 'function') window.tpSetThemeMode(v);
        });

        overlay.querySelectorAll('.settings-modal__inline-link').forEach(a => {
            a.addEventListener('click', e => e.preventDefault());
        });

        overlay.addEventListener('click', e => {
            if (!e.target.closest('.settings-modal')) closeModal(overlay);
        });

        if (!window.__settingsModalEsc) {
            window.__settingsModalEsc = true;
            document.addEventListener('keydown', e => {
                const o = document.getElementById('settingsModal');
                if (e.key === 'Escape' && o && o.classList.contains('show')) closeModal(o);
            });
        }
    }

    async function ensureModal() {
        let overlay = document.getElementById('settingsModal');
        if (overlay) return overlay;

        const res = await fetch(MODAL_URL);
        if (!res.ok) throw new Error('settings_modal load failed');
        const html = await res.text();
        const tmp = document.createElement('div');
        tmp.innerHTML = html.trim();
        overlay = tmp.querySelector('#settingsModal');
        if (!overlay) return null;
        document.body.appendChild(overlay);
        initModal(overlay);
        if (typeof window.initAllTpSelects === 'function') {
            window.initAllTpSelects(overlay);
        }
        return overlay;
    }

    function bindHeader() {
        const btn = document.getElementById('headerSettingsBtn');
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
