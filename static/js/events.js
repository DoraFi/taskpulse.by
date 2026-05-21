(function () {
    const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const WINDOW_MONTH_COUNT = 4;

    let meta = { canManage: false };
    let calendarWindow = null;
    let viewSlot = 1;
    let selectedIso = null;
    let eventsByDate = new Map();
    let allEvents = [];
    function getApiBasePath() {
        const m = window.location.pathname.match(/^\/o\/([^/]+)\/t\/([^/]+)/);
        if (!m) return '/api';
        return `/o/${m[1]}/t/${m[2]}/api`;
    }

    function apiUrl(path) {
        return `${getApiBasePath()}${path}`;
    }

    function escapeHtml(s) {
        return window.tpEscapeEventHtml ? window.tpEscapeEventHtml(s) : String(s ?? '');
    }

    function formatListDate(ev) {
        if (typeof window.tpFormatEventDate === 'function') {
            return window.tpFormatEventDate(ev.dateIso || ev.date, ev.date);
        }
        return ev.date || ev.dateIso || '';
    }

    function formatDayListHeading(iso) {
        if (typeof window.tpFormatEventDate === 'function') {
            const rel = window.tpFormatEventDate(iso, null);
            if (rel === 'Сегодня' || rel === 'Завтра' || rel === 'Вчера') return rel;
        }
        const parts = iso.split('-');
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const currentYear = new Date().getFullYear();
        const opts = d.getFullYear() === currentYear
            ? { weekday: 'long', day: 'numeric', month: 'long' }
            : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        return d.toLocaleDateString('ru-RU', opts);
    }

    function isoToday() {
        return window.tpCalendarTodayIso ? window.tpCalendarTodayIso() : new Date().toISOString().slice(0, 10);
    }

    function buildCalendarWindow() {
        const today = new Date();
        const anchor = new Date(today.getFullYear(), today.getMonth(), 1);
        const start = new Date(anchor);
        start.setMonth(start.getMonth() - 1);
        const months = [];
        for (let i = 0; i < WINDOW_MONTH_COUNT; i++) {
            const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
            months.push({ year: d.getFullYear(), month: d.getMonth() });
        }
        const pad = n => String(n).padStart(2, '0');
        const first = months[0];
        const last = months[months.length - 1];
        const from = `${first.year}-${pad(first.month + 1)}-01`;
        const lastDay = new Date(last.year, last.month + 1, 0).getDate();
        const to = `${last.year}-${pad(last.month + 1)}-${pad(lastDay)}`;
        return { months, from, to, minIso: from, maxIso: to };
    }

    function currentViewMonth() {
        return calendarWindow?.months?.[viewSlot] || null;
    }

    function updateCalendarNav() {
        const title = document.getElementById('eventsCalendarTitle');
        const prev = document.getElementById('eventsPrevMonth');
        const next = document.getElementById('eventsNextMonth');
        const vm = currentViewMonth();
        if (title && vm) {
            const currentYear = new Date().getFullYear();
            title.textContent = vm.year === currentYear ? MONTHS[vm.month] : `${MONTHS[vm.month]} ${vm.year}`;
        }
        if (prev) {
            prev.disabled = viewSlot <= 0;
            prev.style.visibility = viewSlot <= 0 ? 'hidden' : '';
        }
        if (next) {
            next.disabled = viewSlot >= WINDOW_MONTH_COUNT - 1;
            next.style.visibility = viewSlot >= WINDOW_MONTH_COUNT - 1 ? 'hidden' : '';
        }
    }

    async function loadMeta() {
        const res = await fetch(apiUrl('/events/meta'));
        if (!res.ok) throw new Error('meta failed');
        meta = await res.json();
        const btn = document.getElementById('eventsCreateBtn');
        if (btn) btn.hidden = !meta.canManage;
        const sub = document.getElementById('eventsPageSubtitle');
        if (sub) {
            sub.textContent = [meta.organizationName, meta.teamName].filter(Boolean).join(' · ');
        }
    }

    async function loadWindowEvents() {
        if (!calendarWindow) calendarWindow = buildCalendarWindow();
        const res = await fetch(apiUrl(`/events?from=${calendarWindow.from}&to=${calendarWindow.to}`));
        if (!res.ok) throw new Error('events failed');
        const list = await res.json();
        allEvents = Array.isArray(list) ? list : [];
        eventsByDate = new Map();
        allEvents.forEach(ev => {
            const iso = ev.dateIso;
            if (!iso) return;
            if (!eventsByDate.has(iso)) eventsByDate.set(iso, []);
            eventsByDate.get(iso).push(ev);
        });
    }

    function findNearestEventAfter(iso) {
        if (!iso || !allEvents.length) return null;
        const sorted = [...allEvents]
            .filter(ev => ev.dateIso && ev.dateIso > iso)
            .sort((a, b) => String(a.dateIso).localeCompare(String(b.dateIso)));
        return sorted[0] || null;
    }

    function eventCardTitle(ev) {
        if (ev.kind === 'birthday') {
            return typeof window.tpBirthdayListTitle === 'function'
                ? window.tpBirthdayListTitle(ev.personName)
                : `День рождения у ${ev.personName || ''}`.trim();
        }
        return ev.title || '';
    }

    function eventCardMeta(ev, { showDate }) {
        const bits = [];
        if (ev.kind === 'birthday') {
            const agePhrase = typeof window.tpBirthdayAgePhrase === 'function'
                ? window.tpBirthdayAgePhrase(ev)
                : (ev.ageLabel ? `исполнится ${ev.ageLabel}` : '');
            if (agePhrase) bits.push(agePhrase);
        }
        if (ev.scopeLabel) bits.push(ev.scopeLabel);
        if (ev.kind !== 'birthday' && ev.location) bits.push(ev.location);
        if (ev.kind !== 'birthday' && ev.eventTime) bits.push(ev.eventTime);
        if (showDate) {
            const when = formatListDate(ev);
            if (when) bits.push(when);
        }
        return bits.filter(Boolean).join(' · ');
    }

    function renderEventCardsHtml(items, { showDate }) {
        return items.map(ev => `
            <button type="button" class="events-day-item" data-event-id="${escapeHtml(ev.id)}">
                <span class="events-day-item__kind events-day-item__kind--${ev.kind === 'birthday' ? 'birthday' : 'custom'}">${escapeHtml(ev.kindLabel)}</span>
                <span class="text-basic events-day-item__title">${escapeHtml(eventCardTitle(ev))}</span>
                <span class="text-signature">${escapeHtml(eventCardMeta(ev, { showDate }))}</span>
            </button>
        `).join('');
    }

    function applyDayListLayout(listEl, count) {
        if (!listEl) return;
        listEl.classList.remove('events-day-list--row');
        if (count > 1) listEl.classList.add('events-day-list--row');
    }

    function bindEventCardClicks(root) {
        if (!root) return;
        root.querySelectorAll('.events-day-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-event-id');
                if (id && typeof window.tpOpenEventDetail === 'function') {
                    window.tpOpenEventDetail(id);
                }
            });
        });
    }

    function dayEventsMarkup(dayEvents) {
        if (!dayEvents.length) return '';
        return `<span class="events-calendar__dots" aria-hidden="true">${dayEvents.slice(0, 3).map(e =>
            `<span class="events-calendar__dot events-calendar__dot--${e.kind === 'birthday' ? 'birthday' : 'custom'}"></span>`
        ).join('')}</span>`;
    }

    function buildMonthHtml(year, month) {
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();
        const startOffset = firstDay === 0 ? 6 : firstDay - 1;
        const todayStr = isoToday();
        const dayClassFn = window.tpCalendarDayClasses || (() => 'day');

        let html = `
            <div class="custom-calendar-month">
                <div class="weekdays">
                    <div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Вс</div>
                </div>
                <div class="days">
        `;

        const belongsToMonth = (dateStr) => {
            if (typeof window.tpCalendarBelongsToMonth === 'function') {
                return window.tpCalendarBelongsToMonth(dateStr, year, month);
            }
            const p = String(dateStr).split('-').map(Number);
            return p.length === 3 && p[0] === year && p[1] - 1 === month;
        };
        const otherMonthCell = (dateStr, dayNum) => (
            typeof window.tpCalendarOtherMonthCell === 'function'
                ? window.tpCalendarOtherMonthCell(dayNum, dateStr)
                : `<div class="other-month">${dayNum}</div>`
        );

        const renderDayCell = (dateStr, dayNum, inRange) => {
            const dayEvents = eventsByDate.get(dateStr) || [];
            if (!belongsToMonth(dateStr)) {
                return otherMonthCell(dateStr, dayNum);
            }
            if (!inRange) {
                return otherMonthCell(dateStr, dayNum);
            }
            let classes = dayClassFn(dateStr, { selectedIso, today: todayStr });
            if (!classes.includes('weekend')) {
                const isWeekend = typeof window.tpCalendarIsWeekendIso === 'function'
                    ? window.tpCalendarIsWeekendIso(dateStr)
                    : (() => {
                        const p = String(dateStr).split('-').map(Number);
                        if (p.length !== 3) return false;
                        const dow = new Date(p[0], p[1] - 1, p[2]).getDay();
                        return dow === 0 || dow === 6;
                    })();
                if (isWeekend) classes += ' weekend';
            }
            if (dateStr === todayStr && !classes.includes('today')) classes += ' today';
            if (dateStr === selectedIso) classes += ' selected-start';
            if (dayEvents.length) classes += ' has-events';
            return `<div class="${classes}" data-date="${dateStr}">${dayNum}${dayEventsMarkup(dayEvents)}</div>`;
        };

        for (let i = 0; i < startOffset; i++) {
            const prevDate = prevMonthDays - startOffset + i + 1;
            const prevYear = month === 0 ? year - 1 : year;
            const prevMonth = month === 0 ? 11 : month - 1;
            const dateStr = window.tpCalendarToIsoDate
                ? window.tpCalendarToIsoDate(prevYear, prevMonth, prevDate)
                : `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(prevDate).padStart(2, '0')}`;
            html += otherMonthCell(dateStr, prevDate);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = window.tpCalendarToIsoDate
                ? window.tpCalendarToIsoDate(year, month, d)
                : `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            html += renderDayCell(dateStr, d, true);
        }

        const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
        const remaining = totalCells - (startOffset + daysInMonth);
        for (let i = 1; i <= remaining; i++) {
            const nextYear = month === 11 ? year + 1 : year;
            const nextMonth = month === 11 ? 0 : month + 1;
            const dateStr = window.tpCalendarToIsoDate
                ? window.tpCalendarToIsoDate(nextYear, nextMonth, i)
                : `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            html += otherMonthCell(dateStr, i);
        }

        html += '</div></div>';
        return html;
    }

    function renderCalendar() {
        const container = document.getElementById('eventsCalendarMonths');
        const vm = currentViewMonth();
        if (!container || !vm) return;
        container.innerHTML = buildMonthHtml(vm.year, vm.month);
        updateCalendarNav();

        container.querySelectorAll('.day[data-date]').forEach(cell => {
            cell.addEventListener('click', () => {
                const iso = cell.getAttribute('data-date');
                if (!iso) return;
                selectedIso = iso;
                renderCalendar();
                renderDayList();
            });
        });
    }

    function renderDayList() {
        const dayPanel = document.getElementById('eventsDayPanel');
        const list = document.getElementById('eventsDayList');
        const heading = document.getElementById('eventsDayListTitle');
        const nearestPanel = document.getElementById('eventsNearestPanel');
        const nearestList = document.getElementById('eventsNearestList');
        if (!list || !heading) return;

        if (nearestPanel) nearestPanel.hidden = true;
        if (nearestList) nearestList.innerHTML = '';

        if (!selectedIso) {
            heading.textContent = 'Выберите день в календаре';
            list.innerHTML = '<p class="text-signature">Нажмите на дату, чтобы увидеть события</p>';
            return;
        }

        const items = eventsByDate.get(selectedIso) || [];
        heading.textContent = formatDayListHeading(selectedIso);

        if (!items.length) {
            list.innerHTML = '<p class="text-signature">На этот день событий нет</p>';
            const nearest = findNearestEventAfter(selectedIso);
            if (nearest && nearestPanel && nearestList) {
                nearestPanel.hidden = false;
                applyDayListLayout(nearestList, 1);
                nearestList.innerHTML = renderEventCardsHtml([nearest], { showDate: true });
                bindEventCardClicks(nearestList);
            }
            return;
        }

        applyDayListLayout(list, items.length);
        list.innerHTML = renderEventCardsHtml(items, { showDate: false });
        bindEventCardClicks(dayPanel || list);
    }

    function bindControls() {
        document.getElementById('eventsCreateBtn')?.addEventListener('click', () => {
            if (typeof window.tpOpenEventForm === 'function') {
                window.tpEventFormDefaultDate = selectedIso;
                window.tpOpenEventForm(null);
            }
        });
        document.getElementById('eventsPrevMonth')?.addEventListener('click', () => {
            if (viewSlot <= 0) return;
            viewSlot--;
            renderCalendar();
        });
        document.getElementById('eventsNextMonth')?.addEventListener('click', () => {
            if (viewSlot >= WINDOW_MONTH_COUNT - 1) return;
            viewSlot++;
            renderCalendar();
        });
    }

    async function refreshPage() {
        await loadWindowEvents();
        renderCalendar();
        renderDayList();
    }

    async function initEventsPage() {
        if (!document.getElementById('eventsPage')) return;
        calendarWindow = buildCalendarWindow();
        viewSlot = 1;
        selectedIso = isoToday();
        bindControls();
        if (typeof window.tpInitEventModals === 'function') {
            window.tpInitEventModals();
        }
        try {
            await loadMeta();
            await refreshPage();
        } catch (err) {
            console.error(err);
        }
    }

    window.tpRefreshEventsPage = refreshPage;
    window.initEventsPage = initEventsPage;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEventsPage);
    } else {
        initEventsPage();
    }
})();
