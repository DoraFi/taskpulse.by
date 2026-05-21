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

    function parseTimeValue(value) {
        if (!value || typeof value !== 'string') return { hour: 9, minute: 0 };
        const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return { hour: 9, minute: 0 };
        const hour = Math.min(23, Math.max(0, Number(m[1])));
        const minute = Math.min(59, Math.max(0, Number(m[2])));
        return { hour, minute };
    }

    function formatTimeValue(hour, minute) {
        return `${pad2(hour)}:${pad2(minute)}`;
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
            html += typeof global.tpCalendarOtherMonthCell === 'function'
                ? global.tpCalendarOtherMonthCell(prevDate, dateStr)
                : `<div class="other-month">${prevDate}</div>`;
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
            html += typeof global.tpCalendarOtherMonthCell === 'function'
                ? global.tpCalendarOtherMonthCell(i, dateStr)
                : `<div class="other-month">${i}</div>`;
        }

        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.day[data-date]').forEach((dayEl) => {
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
        const title = options.title || (options.withTime ? 'Дата и время' : 'Выберите дату');
        const minYear = options.minYear ?? 1920;
        const maxYear = options.maxYear ?? (new Date().getFullYear() + 5);
        const allowClear = options.allowClear !== false;
        const withTime = options.withTime === true;

        let selectedIso = options.value ? String(options.value).trim() : null;
        const parsedTime = parseTimeValue(options.timeValue || options.time);
        let selectedHour = parsedTime.hour;
        let selectedMinute = parsedTime.minute;
        if (selectedIso && !parseIsoDate(selectedIso)) selectedIso = null;

        const parsed = parseIsoDate(selectedIso);
        let viewYear = parsed?.year ?? new Date().getFullYear();
        let viewMonth = parsed?.month ?? new Date().getMonth();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay custom-calendar-modal tp-date-picker-modal';
        modal.setAttribute('aria-hidden', 'false');

        const wrapper = document.createElement('div');
        wrapper.className = withTime
            ? 'custom-calendar tp-date-picker'
            : 'custom-calendar tp-date-picker tp-date-picker--no-time';
        const timeBlock = withTime
            ? [
                '<div class="tp-date-picker__time">',
                '  <p class="text-signature tp-date-picker__time-label">Время</p>',
                '  <div class="tp-date-picker__time-fields">',
                '    <select class="tp-date-picker-hour filter-input create-task-select" aria-label="Часы"></select>',
                '    <span class="tp-date-picker__time-sep">:</span>',
                '    <select class="tp-date-picker-minute filter-input create-task-select" aria-label="Минуты"></select>',
                '  </div>',
                '</div>',
            ].join('')
            : '';
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
            timeBlock,
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
        const timeWrap = wrapper.querySelector('.tp-date-picker__time');
        const hourSelect = wrapper.querySelector('.tp-date-picker-hour');
        const minuteSelect = wrapper.querySelector('.tp-date-picker-minute');

        if (titleEl) titleEl.textContent = title;
        if (clearBtn) clearBtn.hidden = !allowClear;

        if (withTime && hourSelect && minuteSelect) {
            for (let h = 0; h < 24; h++) {
                const opt = document.createElement('option');
                opt.value = String(h);
                opt.textContent = pad2(h);
                hourSelect.appendChild(opt);
            }
            for (let m = 0; m < 60; m += 5) {
                const opt = document.createElement('option');
                opt.value = String(m);
                opt.textContent = pad2(m);
                minuteSelect.appendChild(opt);
            }
        }

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
        if (withTime) {
            enhancePickerSelect(hourSelect);
            enhancePickerSelect(minuteSelect);
        }

        function syncSelects() {
            yearSelect.value = String(viewYear);
            monthSelect.value = String(viewMonth);
            yearSelect._tpSelectApi?.refresh?.();
            monthSelect._tpSelectApi?.refresh?.();
            if (withTime && hourSelect && minuteSelect) {
                hourSelect.value = String(selectedHour);
                minuteSelect.value = String(selectedMinute);
                hourSelect._tpSelectApi?.refresh?.();
                minuteSelect._tpSelectApi?.refresh?.();
            }
        }

        function emitApply() {
            if (!withTime) {
                options.onApply?.(selectedIso);
                return;
            }
            options.onApply?.({
                date: selectedIso,
                time: formatTimeValue(selectedHour, selectedMinute),
            });
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

        hourSelect?.addEventListener('change', () => {
            selectedHour = Number(hourSelect.value);
        });
        minuteSelect?.addEventListener('change', () => {
            selectedMinute = Number(minuteSelect.value);
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
            if (withTime) {
                options.onApply?.({ date: null, time: null });
            } else {
                options.onApply?.(null);
            }
            close();
        });

        wrapper.querySelector('.tp-date-picker-apply')?.addEventListener('click', () => {
            emitApply();
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

    function openTpDateTimePicker(opts) {
        openTpDatePicker({ ...(opts || {}), withTime: true });
    }

    function isIsoInRange(iso, minIso, maxIso) {
        if (!iso) return false;
        if (minIso && iso < minIso) return false;
        if (maxIso && iso > maxIso) return false;
        return true;
    }

    function openTpEventSchedulePicker(opts) {
        const options = opts || {};
        const minDate = options.minDate || null;
        const maxDate = options.maxDate || null;
        let selectionStart = options.startDate || null;
        let selectionEnd = options.endDate || null;
        if (selectionStart && !selectionEnd) selectionEnd = selectionStart;
        if (!selectionStart && selectionEnd) selectionStart = selectionEnd;

        const parsedTime = parseTimeValue(options.timeValue || options.time);
        let selectedHour = parsedTime.hour;
        let selectedMinute = parsedTime.minute;

        const parsed = parseIsoDate(selectionStart);
        let viewYear = parsed?.year ?? new Date().getFullYear();
        let viewMonth = parsed?.month ?? new Date().getMonth();

        const dayClassFn = typeof global.tpCalendarDayClasses === 'function'
            ? global.tpCalendarDayClasses
            : (iso, ctx) => (iso === ctx?.selectedIso ? 'day selected-start' : 'day');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay custom-calendar-modal tp-date-picker-modal';
        modal.setAttribute('aria-hidden', 'false');

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-calendar tp-date-picker';
        wrapper.innerHTML = [
            '<p class="text-header custom-calendar-title tp-date-picker__title">Дата и время события</p>',
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
            '<div class="tp-date-picker__time">',
            '  <p class="text-signature tp-date-picker__time-label">Время</p>',
            '  <div class="tp-date-picker__time-fields">',
            '    <select class="tp-date-picker-hour filter-input create-task-select" aria-label="Часы"></select>',
            '    <span class="tp-date-picker__time-sep">:</span>',
            '    <select class="tp-date-picker-minute filter-input create-task-select" aria-label="Минуты"></select>',
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

        const daysHost = wrapper.querySelector('.tp-date-picker-days');
        const yearSelect = wrapper.querySelector('.tp-date-picker-year');
        const monthSelect = wrapper.querySelector('.tp-date-picker-month');
        const hourSelect = wrapper.querySelector('.tp-date-picker-hour');
        const minuteSelect = wrapper.querySelector('.tp-date-picker-minute');
        const clearBtn = wrapper.querySelector('.tp-date-picker-clear');
        const minYear = minDate ? Number(String(minDate).slice(0, 4)) : 1920;
        const maxYear = maxDate ? Number(String(maxDate).slice(0, 4)) : (new Date().getFullYear() + 5);

        for (let h = 0; h < 24; h++) {
            const opt = document.createElement('option');
            opt.value = String(h);
            opt.textContent = pad2(h);
            hourSelect.appendChild(opt);
        }
        for (let m = 0; m < 60; m += 5) {
            const opt = document.createElement('option');
            opt.value = String(m);
            opt.textContent = pad2(m);
            minuteSelect.appendChild(opt);
        }
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
            if (!select || select.dataset.tpSelect === '1') return select?._tpSelectApi || null;
            if (typeof global.initTpSelect === 'function') {
                return global.initTpSelect(select, { searchable: true });
            }
            return null;
        }

        enhancePickerSelect(monthSelect);
        enhancePickerSelect(yearSelect);
        enhancePickerSelect(hourSelect);
        enhancePickerSelect(minuteSelect);

        function syncSelects() {
            yearSelect.value = String(viewYear);
            monthSelect.value = String(viewMonth);
            yearSelect._tpSelectApi?.refresh?.();
            monthSelect._tpSelectApi?.refresh?.();
            hourSelect.value = String(selectedHour);
            minuteSelect.value = String(selectedMinute);
            hourSelect._tpSelectApi?.refresh?.();
            minuteSelect._tpSelectApi?.refresh?.();
        }

        function buildRangeMonthGrid() {
            const firstDay = new Date(viewYear, viewMonth, 1).getDay();
            const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
            const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
            const startOffset = firstDay === 0 ? 6 : firstDay - 1;
            const todayStr = typeof global.tpCalendarTodayIso === 'function'
                ? global.tpCalendarTodayIso()
                : toIsoDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

            let html = `
                <div class="weekdays">
                    <div>Пн</div><div>Вт</div><div>Ср</div>
                    <div>Чт</div><div>Пт</div><div>Сб</div><div>Вс</div>
                </div>
                <div class="days">
            `;

            const renderCell = (dateStr, dayNum, inMonth) => {
                if (!inMonth || !isIsoInRange(dateStr, minDate, maxDate)) {
                    return typeof global.tpCalendarOtherMonthCell === 'function'
                        ? global.tpCalendarOtherMonthCell(dayNum, dateStr)
                        : `<div class="other-month">${dayNum}</div>`;
                }
                const dayCtx = {
                    today: todayStr,
                    selectionStart,
                    selectionEnd,
                    selectedIso: selectionStart,
                };
                let classes = dayClassFn(dateStr, dayCtx);
                if (dateStr === selectionStart && dateStr === selectionEnd) {
                    classes += ' selected-start selected-end';
                }
                return `<div class="${classes}" data-date="${dateStr}">${dayNum}</div>`;
            };

            for (let i = 0; i < startOffset; i++) {
                const prevDate = prevMonthDays - startOffset + i + 1;
                const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
                const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
                const dateStr = toIsoDate(prevYear, prevMonth, prevDate);
                html += renderCell(dateStr, prevDate, false);
            }
            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = toIsoDate(viewYear, viewMonth, d);
                html += renderCell(dateStr, d, true);
            }
            const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
            const remaining = totalCells - (startOffset + daysInMonth);
            for (let i = 1; i <= remaining; i++) {
                const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
                const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
                const dateStr = toIsoDate(nextYear, nextMonth, i);
                html += renderCell(dateStr, i, false);
            }
            html += '</div>';
            daysHost.innerHTML = html;

            daysHost.querySelectorAll('.day[data-date]').forEach((dayEl) => {
                dayEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dateStr = dayEl.dataset.date;
                    if (!dateStr || dayEl.dataset.disabled === '1') return;
                    if (!selectionStart || (selectionStart && selectionEnd)) {
                        selectionStart = dateStr;
                        selectionEnd = dateStr;
                    } else if (dateStr < selectionStart) {
                        selectionEnd = selectionStart;
                        selectionStart = dateStr;
                    } else {
                        selectionEnd = dateStr;
                    }
                    buildRangeMonthGrid();
                });
            });
        }

        function render() {
            syncSelects();
            buildRangeMonthGrid();
        }

        yearSelect.addEventListener('change', () => {
            viewYear = Number(yearSelect.value);
            render();
        });
        monthSelect.addEventListener('change', () => {
            viewMonth = Number(monthSelect.value);
            render();
        });
        hourSelect.addEventListener('change', () => { selectedHour = Number(hourSelect.value); });
        minuteSelect.addEventListener('change', () => { selectedMinute = Number(minuteSelect.value); });

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

        function close() {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
        }

        clearBtn?.addEventListener('click', () => {
            options.onApply?.({ startDate: null, endDate: null, time: null });
            close();
        });

        wrapper.querySelector('.tp-date-picker-apply')?.addEventListener('click', () => {
            if (!selectionStart) {
                options.onApply?.({ startDate: null, endDate: null, time: null });
                close();
                return;
            }
            const end = selectionEnd || selectionStart;
            options.onApply?.({
                startDate: selectionStart,
                endDate: end === selectionStart ? null : end,
                time: formatTimeValue(selectedHour, selectedMinute),
            });
            close();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });

        render();
    }

    global.openTpDatePicker = openTpDatePicker;
    global.openTpDateTimePicker = openTpDateTimePicker;
    global.openTpEventSchedulePicker = openTpEventSchedulePicker;
    global.tpFormatDateRu = formatDisplayRu;
})(window);
