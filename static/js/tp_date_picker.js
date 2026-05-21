(function (global) {
    const MONTH_NAMES = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
    ];

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function toIsoDate(year, month, day) {
        return `${year}-${pad2(month + 1)}-${pad2(day)}`;
    }

    function parseIsoDate(value) {
        if (!value || typeof value !== 'string') return null;
        const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        const y = Number(m[1]);
        const mo = Number(m[2]) - 1;
        const d = Number(m[3]);
        const dt = new Date(y, mo, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
        return { year: y, month: mo, day: d };
    }

    function formatDisplayRu(iso) {
        const p = parseIsoDate(iso);
        if (!p) return '';
        return `${pad2(p.day)}.${pad2(p.month + 1)}.${p.year}`;
    }

    function buildMonthGrid(container, year, month, selectedIso) {
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();
        const startOffset = firstDay === 0 ? 6 : firstDay - 1;

        let html = `
            <div class="weekdays">
                <div>Пн</div><div>Вт</div><div>Ср</div>
                <div>Чт</div><div>Пт</div><div>Сб</div><div>Вс</div>
            </div>
            <div class="days">
        `;

        for (let i = 0; i < startOffset; i++) {
            const prevDate = prevMonthDays - startOffset + i + 1;
            const prevYear = month === 0 ? year - 1 : year;
            const prevMonth = month === 0 ? 11 : month - 1;
            const dateStr = toIsoDate(prevYear, prevMonth, prevDate);
            html += `<div class="other-month" data-date="${dateStr}">${prevDate}</div>`;
        }

        const dayCtx = { selectedIso };
        const dayClassFn = typeof global.tpCalendarDayClasses === 'function'
            ? global.tpCalendarDayClasses
            : (iso) => (iso === selectedIso ? 'day selected-start' : 'day');

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = toIsoDate(year, month, d);
            const classes = dayClassFn(dateStr, dayCtx);
            html += `<div class="${classes}" data-date="${dateStr}">${d}</div>`;
        }

        const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
        const remaining = totalCells - (startOffset + daysInMonth);
        for (let i = 1; i <= remaining; i++) {
            const nextYear = month === 11 ? year + 1 : year;
            const nextMonth = month === 11 ? 0 : month + 1;
            const dateStr = toIsoDate(nextYear, nextMonth, i);
            html += `<div class="other-month" data-date="${dateStr}">${i}</div>`;
        }

        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.day, .other-month').forEach((dayEl) => {
            dayEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const dateStr = dayEl.dataset.date;
                if (!dateStr) return;
                container.dispatchEvent(new CustomEvent('tp-date-select', { detail: { date: dateStr }, bubbles: true }));
            });
        });
    }

    function openTpDatePicker(opts) {
        const options = opts || {};
        const title = options.title || 'Выберите дату';
        const minYear = options.minYear ?? 1920;
        const maxYear = options.maxYear ?? new Date().getFullYear();
        const allowClear = options.allowClear !== false;

        let selectedIso = options.value ? String(options.value).trim() : null;
        if (selectedIso && !parseIsoDate(selectedIso)) selectedIso = null;

        const parsed = parseIsoDate(selectedIso);
        let viewYear = parsed?.year ?? new Date().getFullYear();
        let viewMonth = parsed?.month ?? new Date().getMonth();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay custom-calendar-modal tp-date-picker-modal';
        modal.setAttribute('aria-hidden', 'false');

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-calendar tp-date-picker';
        wrapper.innerHTML = [
            '<p class="text-header custom-calendar-title tp-date-picker__title"></p>',
            '<div class="custom-calendar-header tp-date-picker__header">',
            '  <button type="button" class="tp-date-picker-nav" data-dir="prev" aria-label="Предыдущий месяц">\u2190</button>',
            '  <div class="tp-date-picker__selects">',
            '    <select class="tp-date-picker-month filter-input create-task-select" aria-label="Месяц"></select>',
            '    <select class="tp-date-picker-year filter-input create-task-select" aria-label="Год"></select>',
            '  </div>',
            '  <button type="button" class="tp-date-picker-nav" data-dir="next" aria-label="Следующий месяц">\u2192</button>',
            '</div>',
            '<div class="custom-calendar-months tp-date-picker__month">',
            '  <div class="custom-calendar-month">',
            '    <div class="tp-date-picker-days"></div>',
            '  </div>',
            '</div>',
            '<div class="custom-calendar-footer">',
            '  <button type="button" class="button-secondary tp-date-picker-clear">Сбросить</button>',
            '  <button type="button" class="button-basic tp-date-picker-apply">Применить</button>',
            '</div>',
        ].join('');

        modal.appendChild(wrapper);
        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('show'));

        const titleEl = wrapper.querySelector('.tp-date-picker__title');
        const daysHost = wrapper.querySelector('.tp-date-picker-days');
        const yearSelect = wrapper.querySelector('.tp-date-picker-year');
        const monthSelect = wrapper.querySelector('.tp-date-picker-month');
        const clearBtn = wrapper.querySelector('.tp-date-picker-clear');

        if (titleEl) titleEl.textContent = title;
        if (clearBtn) clearBtn.hidden = !allowClear;

        for (let y = maxYear; y >= minYear; y--) {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            yearSelect.appendChild(opt);
        }
        MONTH_NAMES.forEach((name, idx) => {
            const opt = document.createElement('option');
            opt.value = String(idx);
            opt.textContent = name;
            monthSelect.appendChild(opt);
        });

        function enhancePickerSelect(select) {
            if (!select || select.dataset.tpSelect === '1') {
                return select?._tpSelectApi || null;
            }
            if (typeof global.initTpSelect === 'function') {
                return global.initTpSelect(select, { searchable: true });
            }
            return null;
        }

        enhancePickerSelect(monthSelect);
        enhancePickerSelect(yearSelect);

        function syncSelects() {
            yearSelect.value = String(viewYear);
            monthSelect.value = String(viewMonth);
            yearSelect._tpSelectApi?.refresh?.();
            monthSelect._tpSelectApi?.refresh?.();
        }

        function render() {
            syncSelects();
            buildMonthGrid(daysHost, viewYear, viewMonth, selectedIso);
        }

        daysHost.addEventListener('tp-date-select', (e) => {
            selectedIso = e.detail?.date || null;
            render();
        });

        yearSelect.addEventListener('change', () => {
            viewYear = Number(yearSelect.value);
            render();
        });
        monthSelect.addEventListener('change', () => {
            viewMonth = Number(monthSelect.value);
            render();
        });

        wrapper.querySelector('[data-dir="prev"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (viewMonth === 0) {
                viewMonth = 11;
                viewYear -= 1;
            } else {
                viewMonth -= 1;
            }
            if (viewYear < minYear) {
                viewYear = minYear;
                viewMonth = 0;
            }
            render();
        });

        wrapper.querySelector('[data-dir="next"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (viewMonth === 11) {
                viewMonth = 0;
                viewYear += 1;
            } else {
                viewMonth += 1;
            }
            if (viewYear > maxYear) {
                viewYear = maxYear;
                viewMonth = 11;
            }
            render();
        });

        clearBtn?.addEventListener('click', () => {
            selectedIso = null;
            options.onApply?.(null);
            close();
        });

        wrapper.querySelector('.tp-date-picker-apply')?.addEventListener('click', () => {
            options.onApply?.(selectedIso);
            close();
        });

        function close() {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });

        render();
    }

    global.openTpDatePicker = openTpDatePicker;
    global.tpFormatDateRu = formatDisplayRu;
})(window);
