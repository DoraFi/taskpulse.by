(function () {
    function getApiBasePath() {
        const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
        if (!m) return '/api';
        return `/o/${m[1]}/t/${m[2]}/api`;
    }

    function apiUrl(path) {
        return `${getApiBasePath()}${path}`;
    }

    function escapeHtml(s) {
        if (s == null || s === '') return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function parseDateValue(dateStr) {
        if (!dateStr) return null;
        if (dateStr.includes('.')) {
            const parts = dateStr.split('.');
            let d, m, y;
            if (parts.length === 2) {
                [d, m] = parts;
                y = String(new Date().getFullYear());
            } else {
                [d, m, y] = parts;
            }
            const date = new Date(Number(y), Number(m) - 1, Number(d));
            return Number.isNaN(date.getTime()) ? null : date;
        }
        if (dateStr.includes('-')) {
            const [y, m, d] = dateStr.split('-');
            const date = new Date(Number(y), Number(m) - 1, Number(d));
            return Number.isNaN(date.getTime()) ? null : date;
        }
        return null;
    }

    function isoToUiDate(iso) {
        if (!iso || !String(iso).includes('-')) return iso || '';
        const [y, m, d] = String(iso).split('-');
        return `${d}.${m}.${y}`;
    }

    function daysDiffFromToday(dateStr) {
        const date = parseDateValue(dateStr);
        if (!date) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);
        return Math.round((date - today) / 86400000);
    }

    function formatRelativeDate(dateStr) {
        const diff = daysDiffFromToday(dateStr);
        if (diff == null) {
            if (dateStr && String(dateStr).includes('-')) return isoToUiDate(dateStr);
            return dateStr || '';
        }
        if (diff === -1) return 'Вчера';
        if (diff === 0) return 'Сегодня';
        if (diff === 1) return 'Завтра';
        if (dateStr && String(dateStr).includes('-')) return isoToUiDate(dateStr);
        return dateStr;
    }

    function stripCurrentYearFromUi(ui) {
        if (!ui) return '';
        const currentYear = new Date().getFullYear();
        const suffix = '.' + currentYear;
        const text = String(ui).trim();
        if (text.endsWith(suffix)) return text.slice(0, -suffix.length);
        return text;
    }

    function formatLocaleDateFromIso(iso, withWeekday) {
        if (!iso || !String(iso).includes('-')) return '';
        const [y, m, d] = String(iso).split('-');
        const date = new Date(Number(y), Number(m) - 1, Number(d));
        if (Number.isNaN(date.getTime())) return '';
        const currentYear = new Date().getFullYear();
        const opts = withWeekday
            ? (date.getFullYear() === currentYear
                ? { weekday: 'long', day: 'numeric', month: 'long' }
                : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            : (date.getFullYear() === currentYear
                ? { day: 'numeric', month: 'long' }
                : { day: 'numeric', month: 'long', year: 'numeric' });
        return date.toLocaleDateString('ru-RU', opts);
    }

    window.tpFormatEventDate = function tpFormatEventDate(isoOrUi, uiFallback) {
        const rel = formatRelativeDate(isoOrUi);
        if (rel === 'Сегодня' || rel === 'Завтра' || rel === 'Вчера') return rel;
        if (isoOrUi && String(isoOrUi).includes('-')) {
            return formatLocaleDateFromIso(isoOrUi, false);
        }
        if (uiFallback && !String(uiFallback).includes('-')) {
            return stripCurrentYearFromUi(uiFallback);
        }
        return stripCurrentYearFromUi(isoToUiDate(isoOrUi)) || uiFallback || '';
    };

    window.tpFormatDashboardDate = function tpFormatDashboardDate(isoOrUi, uiFallback) {
        return window.tpFormatEventDate(isoOrUi, uiFallback);
    };

    window.tpBirthdayListTitle = function tpBirthdayListTitle(personName) {
        const name = (personName || '').trim();
        return name ? `День рождения у ${name}` : 'День рождения';
    };

    window.tpBirthdayAgePhrase = function tpBirthdayAgePhrase(event) {
        if (!event?.ageLabel) return '';
        const iso = event.dateIso || '';
        const past = event.birthdayPast === true
            || (iso && iso < (window.tpCalendarTodayIso ? window.tpCalendarTodayIso() : new Date().toISOString().slice(0, 10)));
        return `${past ? 'исполнилось' : 'исполнится'} ${event.ageLabel}`;
    };

    function formatEventScheduleDisplay(startIso, endIso, time) {
        if (!startIso) return '';
        const startText = window.tpFormatEventDate(startIso, null);
        const endText = endIso && endIso !== startIso
            ? window.tpFormatEventDate(endIso, null)
            : '';
        let text = endText ? `${startText} - ${endText}` : startText;
        if (time) text = `${text}, ${time}`;
        return text;
    }

    function updateEventFormScheduleDisplay(overlay) {
        const root = overlay || document.getElementById('eventFormModal');
        if (!root) return;
        const start = root.querySelector('#eventFormDate')?.value || '';
        const end = root.querySelector('#eventFormEndDate')?.value || '';
        const time = root.querySelector('#eventFormTime')?.value || '';
        const startDisplay = root.querySelector('#eventFormDateStartDisplay');
        const endDisplay = root.querySelector('#eventFormDateEndDisplay');
        const timeDisplay = root.querySelector('#eventFormTimeDisplay');
        if (startDisplay) {
            startDisplay.textContent = start
                ? window.tpFormatEventDate(start, null)
                : 'Не выбрана';
        }
        if (endDisplay) {
            endDisplay.textContent = end
                ? window.tpFormatEventDate(end, null)
                : (start ? 'Совпадает с началом' : 'Не выбрана');
        }
        if (timeDisplay) {
            timeDisplay.textContent = time || 'Не выбрано';
        }
    }

    function setDetailField(rowId, fieldId, text) {
        const row = document.getElementById(rowId);
        const field = document.getElementById(fieldId);
        const has = text != null && String(text).trim() !== '';
        if (row) {
            row.hidden = !has;
            row.style.display = has ? '' : 'none';
        }
        if (!field) return;
        if ('value' in field) {
            field.value = has ? text : '';
        } else {
            field.textContent = has ? text : '';
        }
    }

    function ensureModalsInBody() {
        ['eventDetailModal', 'eventFormModal'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.parentElement !== document.body) {
                document.body.appendChild(el);
            }
        });
    }

    function closeModal(overlay) {
        if (!overlay) return;
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
    }

    function openModal(overlay) {
        if (!overlay) return;
        ensureModalsInBody();
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function renderEventDetail(event) {
        const titleEl = document.getElementById('eventDetailTitle');
        const subtitleEl = document.getElementById('eventDetailSubtitle');
        const hero = document.getElementById('eventDetailHero');
        const avatarEl = document.getElementById('eventDetailAvatar');
        const personEl = document.getElementById('eventDetailPerson');
        const personMeta = document.getElementById('eventDetailPersonMeta');
        const footer = document.getElementById('eventDetailFooter');
        const editBtn = document.getElementById('eventDetailEditBtn');
        const deleteBtn = document.getElementById('eventDetailDeleteBtn');
        const titleHeader = document.getElementById('eventDetailModalTitle');
        const titleRow = document.getElementById('eventDetailTitleRow');
        const sectionLabel = document.getElementById('eventDetailSectionLabel');
        const dateSingleRow = document.getElementById('eventDetailDateSingleRow');
        const dateStartRow = document.getElementById('eventDetailDateStartRow');
        const dateEndRow = document.getElementById('eventDetailDateEndRow');
        const timeRow = document.getElementById('eventDetailTimeRow');
        const isBirthday = event.kind === 'birthday';

        if (titleHeader) titleHeader.textContent = isBirthday ? 'День рождения' : 'Событие';
        if (sectionLabel) sectionLabel.textContent = isBirthday ? 'День рождения' : 'Данные события';

        const displayTitle = isBirthday
            ? (typeof window.tpBirthdayListTitle === 'function'
                ? window.tpBirthdayListTitle(event.personName)
                : (`День рождения у ${event.personName || ''}`.trim()))
            : (event.title || '');

        setDetailField('eventDetailTitleRow', 'eventDetailTitle', isBirthday ? '' : displayTitle);

        const agePhrase = typeof window.tpBirthdayAgePhrase === 'function'
            ? window.tpBirthdayAgePhrase(event)
            : (event.ageLabel ? `исполнится ${event.ageLabel}` : '');

        if (subtitleEl) {
            if (isBirthday && agePhrase) {
                subtitleEl.textContent = agePhrase.charAt(0).toUpperCase() + agePhrase.slice(1);
                subtitleEl.hidden = false;
                subtitleEl.style.display = '';
            } else {
                subtitleEl.textContent = '';
                subtitleEl.hidden = true;
                subtitleEl.style.display = 'none';
            }
        }

        const startIso = event.dateIso || (event.date && String(event.date).includes('-') ? event.date : null);
        const endIso = event.endDateIso || (event.endDate && String(event.endDate).includes('-') ? event.endDate : null);
        const sameDay = !endIso || endIso === startIso;
        const startText = startIso ? window.tpFormatEventDate(startIso, event.date) : '';
        const endText = endIso && !sameDay ? window.tpFormatEventDate(endIso, event.endDate) : '';

        setDetailField('eventDetailDateSingleRow', 'eventDetailDateSingle', '');
        setDetailField('eventDetailDateStartRow', 'eventDetailDateStart', '');
        setDetailField('eventDetailDateEndRow', 'eventDetailDateEnd', '');

        if (isBirthday) {
            setDetailField('eventDetailDateSingleRow', 'eventDetailDateSingle', startText);
        } else if (sameDay) {
            setDetailField('eventDetailDateSingleRow', 'eventDetailDateSingle', startText);
        } else {
            setDetailField('eventDetailDateStartRow', 'eventDetailDateStart', startText);
            setDetailField('eventDetailDateEndRow', 'eventDetailDateEnd', endText);
        }

        const eventTime = !isBirthday && event.eventTime ? String(event.eventTime).trim() : '';
        setDetailField('eventDetailTimeRow', 'eventDetailTime', eventTime);

        setDetailField('eventDetailScopeRow', 'eventDetailScope', event.scopeLabel || '');
        setDetailField('eventDetailLocationRow', 'eventDetailLocation', isBirthday ? '' : (event.location || ''));

        const desc = (event.description || '').trim();
        setDetailField('eventDetailDescRow', 'eventDetailDescription', isBirthday ? '' : desc);

        if (hero) {
            if (isBirthday) {
                hero.hidden = false;
                hero.style.display = '';
                if (avatarEl) avatarEl.src = `/static/source/user_img/${event.avatar || 'basic_avatar.png'}`;
                if (personEl) personEl.textContent = event.personName || 'Участник команды';
                if (personMeta) {
                    const bits = [event.scopeLabel, agePhrase].filter(Boolean);
                    personMeta.textContent = bits.join(' · ');
                }
            } else {
                hero.hidden = true;
                hero.style.display = 'none';
                if (avatarEl) avatarEl.removeAttribute('src');
                if (personEl) personEl.textContent = '';
                if (personMeta) personMeta.textContent = '';
            }
        }

        const canEdit = Boolean(event.canEdit) && !isBirthday;
        const canDelete = Boolean(event.canDelete) && !isBirthday;
        if (editBtn) editBtn.hidden = !canEdit;
        if (deleteBtn) deleteBtn.hidden = !canDelete;
        if (footer) footer.hidden = !(canEdit || canDelete);
    }

    async function fetchEventById(eventId) {
        const res = await fetch(apiUrl(`/events/${encodeURIComponent(eventId)}`));
        if (!res.ok) throw new Error('event load failed');
        return res.json();
    }

    window.tpOpenEventDetail = async function tpOpenEventDetail(eventOrId) {
        try {
            const event = typeof eventOrId === 'string'
                ? await fetchEventById(eventOrId)
                : eventOrId;
            if (!event) return;
            renderEventDetail(event);
            const overlay = document.getElementById('eventDetailModal');
            openModal(overlay);
            overlay._currentEvent = event;
        } catch (err) {
            console.error(err);
            if (typeof window.showToast === 'function') {
                window.showToast('Не удалось открыть событие');
            }
        }
    };

    function bindDetailModal() {
        const overlay = document.getElementById('eventDetailModal');
        if (!overlay) return;
        if (overlay._eventDetailBound) return;
        overlay._eventDetailBound = true;
        overlay.querySelector('#eventDetailModalClose')?.addEventListener('click', () => closeModal(overlay));
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeModal(overlay);
        });
        overlay.querySelector('#eventDetailEditBtn')?.addEventListener('click', () => {
            const ev = overlay._currentEvent;
            if (!ev || ev.kind === 'birthday' || !ev.canEdit) return;
            closeModal(overlay);
            if (typeof window.tpOpenEventForm === 'function') {
                window.tpOpenEventForm(ev);
            }
        });
        overlay.querySelector('#eventDetailDeleteBtn')?.addEventListener('click', async () => {
            const ev = overlay._currentEvent;
            if (!ev || !ev.canDelete) return;
            if (!confirm('Удалить это событие?')) return;
            try {
                const res = await fetch(apiUrl(`/events/${encodeURIComponent(ev.id)}`), { method: 'DELETE' });
                if (!res.ok) throw new Error('delete failed');
                closeModal(overlay);
                if (typeof window.showToast === 'function') window.showToast('Событие удалено');
                if (typeof window.tpRefreshEventsPage === 'function') window.tpRefreshEventsPage();
                if (typeof window.tpRefreshIndexPage === 'function') window.tpRefreshIndexPage();
            } catch (err) {
                console.error(err);
                if (typeof window.showToast === 'function') window.showToast('Не удалось удалить событие');
            }
        });
    }

    let editingEventId = null;

    function isoToday() {
        return window.tpCalendarTodayIso ? window.tpCalendarTodayIso() : new Date().toISOString().slice(0, 10);
    }

    function normalizeEventForForm(event) {
        if (!event) return null;
        let dateIso = event.dateIso || '';
        if (!dateIso && event.date && String(event.date).includes('-')) {
            dateIso = event.date;
        }
        let endDateIso = event.endDateIso || '';
        if (!endDateIso && event.endDate && String(event.endDate).includes('-')) {
            endDateIso = event.endDate;
        }
        return { ...event, dateIso, endDateIso };
    }

    function eventFormDateBounds() {
        const pad = n => String(n).padStart(2, '0');
        const today = new Date();
        const minIso = isoToday();
        const max = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
        const maxIso = `${max.getFullYear()}-${pad(max.getMonth() + 1)}-${pad(max.getDate())}`;
        return { minIso, maxIso };
    }

    function bindEventFormSchedule(overlay) {
        if (!overlay || overlay._eventDatesBound) return;
        overlay._eventDatesBound = true;
        const triggers = overlay.querySelectorAll('.events-form-schedule__trigger');
        if (!triggers.length || overlay.dataset.tpScheduleBound === '1') return;
        overlay.dataset.tpScheduleBound = '1';

        const openPicker = () => {
            const bounds = eventFormDateBounds();
            const dateInput = overlay.querySelector('#eventFormDate');
            const endInput = overlay.querySelector('#eventFormEndDate');
            const timeInput = overlay.querySelector('#eventFormTime');
            const start = dateInput?.value || null;
            const end = endInput?.value || null;

            if (typeof window.openCustomCalendarRangeWithTime !== 'function') return;
            window.openCustomCalendarRangeWithTime({
                startDate: start,
                endDate: end || start,
                timeValue: timeInput?.value || '',
                minDate: bounds.minIso,
                maxDate: bounds.maxIso,
                title: 'Дата и время события',
                onApply: (result) => {
                    if (!result || !result.startDate) {
                        if (dateInput) dateInput.value = '';
                        if (endInput) endInput.value = '';
                        if (timeInput) timeInput.value = '';
                    } else {
                        if (dateInput) dateInput.value = result.startDate;
                        if (endInput) endInput.value = result.endDate || '';
                        if (timeInput) timeInput.value = result.time || '';
                    }
                    updateEventFormScheduleDisplay(overlay);
                },
            });
        };

        const onActivate = (e) => {
            e.preventDefault();
            openPicker();
        };

        triggers.forEach(trigger => {
            trigger.addEventListener('click', onActivate);
            trigger.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') onActivate(e);
            });
        });
    }

    function closeFormModal() {
        const overlay = document.getElementById('eventFormModal');
        if (!overlay) return;
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        editingEventId = null;
    }

    function refreshScopeSelect(scopeSel) {
        if (!scopeSel) return;
        if (scopeSel._tpSelectApi && typeof scopeSel._tpSelectApi.refresh === 'function') {
            scopeSel._tpSelectApi.refresh();
            return;
        }
        const overlay = document.getElementById('eventFormModal');
        if (overlay && typeof window.initAllTpSelects === 'function') {
            window.initAllTpSelects(overlay);
        }
    }

    window.tpOpenEventForm = function tpOpenEventForm(event, options) {
        const overlay = document.getElementById('eventFormModal');
        if (!overlay) return;
        ensureModalsInBody();
        const normalized = normalizeEventForForm(event);
        if (normalized?.kind === 'birthday') {
            if (typeof window.showToast === 'function') {
                window.showToast('День рождения нельзя редактировать');
            }
            return;
        }
        editingEventId = normalized?.id || null;
        const title = document.getElementById('eventFormModalTitle');
        if (title) title.textContent = editingEventId ? 'Редактировать событие' : 'Новое событие';

        const defaultDate = (options && options.defaultDate)
            || window.tpEventFormDefaultDate
            || isoToday();

        const titleInput = document.getElementById('eventFormTitle');
        const descInput = document.getElementById('eventFormDescription');
        const locationInput = document.getElementById('eventFormLocation');
        const dateInput = document.getElementById('eventFormDate');
        const timeInput = document.getElementById('eventFormTime');
        const endInput = document.getElementById('eventFormEndDate');
        const scopeSel = document.getElementById('eventFormScope');

        if (titleInput) titleInput.value = normalized?.title || '';
        if (descInput) descInput.value = normalized?.description || '';
        if (locationInput) locationInput.value = normalized?.location || '';
        const startIso = normalized?.dateIso || defaultDate;
        if (dateInput) dateInput.value = startIso;
        if (timeInput) timeInput.value = normalized?.eventTime || '';
        if (endInput) {
            const endIso = normalized?.endDateIso || '';
            endInput.value = endIso && endIso !== startIso ? endIso : '';
        }
        if (scopeSel) {
            scopeSel.value = normalized?.scope === 'organization' ? 'organization' : 'team';
            refreshScopeSelect(scopeSel);
        }
        updateEventFormScheduleDisplay(overlay);

        openModal(overlay);
    };

    async function saveEventForm() {
        const title = document.getElementById('eventFormTitle')?.value?.trim();
        const description = document.getElementById('eventFormDescription')?.value?.trim() || '';
        const location = document.getElementById('eventFormLocation')?.value?.trim() || '';
        const eventTime = document.getElementById('eventFormTime')?.value?.trim() || '';
        const eventDate = document.getElementById('eventFormDate')?.value;
        const eventEndDate = document.getElementById('eventFormEndDate')?.value || '';
        const scope = document.getElementById('eventFormScope')?.value || 'team';
        if (!title || !eventDate) {
            if (typeof window.showToast === 'function') window.showToast('Укажите название и дату');
            return;
        }
        const payload = { title, description, location, eventTime, eventDate, scope };
        if (eventEndDate) payload.eventEndDate = eventEndDate;
        const url = editingEventId
            ? apiUrl(`/events/${encodeURIComponent(editingEventId)}`)
            : apiUrl('/events');
        const wasEdit = Boolean(editingEventId);
        const res = await fetch(url, {
            method: editingEventId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            if (typeof window.showToast === 'function') window.showToast('Не удалось сохранить событие');
            return;
        }
        closeFormModal();
        if (typeof window.showToast === 'function') {
            window.showToast(wasEdit ? 'Событие обновлено' : 'Событие создано');
        }
        if (typeof window.tpRefreshEventsPage === 'function') {
            await window.tpRefreshEventsPage();
        }
        if (typeof window.tpRefreshIndexPage === 'function') {
            await window.tpRefreshIndexPage();
        }
    }

    function bindFormModal() {
        const overlay = document.getElementById('eventFormModal');
        if (!overlay || overlay._formBound) return;
        overlay._formBound = true;
        ensureModalsInBody();
        overlay.querySelector('#eventFormModalClose')?.addEventListener('click', closeFormModal);
        overlay.querySelector('#eventFormCancelBtn')?.addEventListener('click', closeFormModal);
        overlay.querySelector('#eventFormSaveBtn')?.addEventListener('click', () => saveEventForm().catch(console.error));
        overlay.addEventListener('click', e => { if (e.target === overlay) closeFormModal(); });
        bindEventFormSchedule(overlay);
    }

    window.tpFormatEventRelativeDate = formatRelativeDate;
    window.tpEscapeEventHtml = escapeHtml;

    window.tpInitEventModals = function tpInitEventModals() {
        bindDetailModal();
        bindFormModal();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.tpInitEventModals());
    } else {
        window.tpInitEventModals();
    }
})();
