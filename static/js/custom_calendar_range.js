function parseIsoParts(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

function monthIndex(year, month) {
    return year * 12 + month;
}

function parseTimeValue(value) {
    if (!value || typeof value !== 'string') return { hour: 9, minute: 0 };
    const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return { hour: 9, minute: 0 };
    return {
        hour: Math.min(23, Math.max(0, Number(m[1]))),
        minute: Math.min(59, Math.max(0, Number(m[2]))),
    };
}

function formatTimeValue(hour, minute) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function openCustomCalendarRange(options) {
    const opts = options || {};
    const {
        start,
        end,
        onApply,
        time,
        timeValue,
        withTime = false,
        minDate = null,
        maxDate = null,
        title = 'Выберите диапазон дат',
        forwardMonthsOnly = false,
    } = opts;

    let selectionStart = start || null;
    let selectionEnd = end || null;
    const showTime = withTime || time != null || timeValue != null;
    const parsedTime = parseTimeValue(timeValue || time);
    let selectedHour = parsedTime.hour;
    let selectedMinute = parsedTime.minute;

    let currentYear;
    let currentMonth;

    const today = new Date();
    const navMinMonth = forwardMonthsOnly ? monthIndex(today.getFullYear(), today.getMonth()) : null;
    const navMaxMonth = forwardMonthsOnly ? navMinMonth + 3 : null;
    const dayClassFn = typeof window.tpCalendarDayClasses === 'function'
        ? window.tpCalendarDayClasses
        : (dateStr, ctx) => {
            let classes = 'day';
            const p = String(dateStr).split('-').map(Number);
            if (p.length === 3) {
                const dow = new Date(p[0], p[1] - 1, p[2]).getDay();
                if (dow === 0 || dow === 6) classes += ' weekend';
            }
            if (dateStr === (ctx?.today || '')) classes += ' today';
            if (ctx?.selectionStart === dateStr) classes += ' selected-start';
            if (ctx?.selectionEnd === dateStr) classes += ' selected-end';
            if (ctx?.selectionStart && ctx?.selectionEnd && dateStr > ctx.selectionStart && dateStr < ctx.selectionEnd) {
                classes += ' in-range';
            }
            return classes;
        };
    const todayStr = typeof window.tpCalendarTodayIso === 'function'
        ? window.tpCalendarTodayIso()
        : (() => {
            const today = new Date();
            return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        })();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay custom-calendar-modal';
    const calendarWrapper = document.createElement('div');
    calendarWrapper.className = 'custom-calendar';
    const timeBlock = showTime
        ? `<div class="tp-date-picker__time custom-calendar-range__time">
            <p class="text-signature tp-date-picker__time-label">Время</p>
            <div class="tp-date-picker__time-fields">
                <select class="tp-date-picker-hour filter-input create-task-select" aria-label="Часы"></select>
                <span class="tp-date-picker__time-sep">:</span>
                <select class="tp-date-picker-minute filter-input create-task-select" aria-label="Минуты"></select>
            </div>
        </div>`
        : '';

    calendarWrapper.innerHTML = `
        <div class="custom-calendar-header">
            <button type="button" class="prev-both">←</button>
            <div class="custom-calendar-title">${title}</div>
            <button type="button" class="next-both">→</button>
        </div>
        <div class="custom-calendar-months"></div>
        ${timeBlock}
        <div class="custom-calendar-footer">
            <button type="button" class="button-secondary reset-dates">Сбросить</button>
            <button type="button" class="button-basic apply-dates">Применить</button>
        </div>
    `;
    modal.appendChild(calendarWrapper);
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    const monthsContainer = calendarWrapper.querySelector('.custom-calendar-months');
    const hourSelect = calendarWrapper.querySelector('.tp-date-picker-hour');
    const minuteSelect = calendarWrapper.querySelector('.tp-date-picker-minute');

    if (showTime && hourSelect && minuteSelect) {
        for (let h = 0; h < 24; h++) {
            const opt = document.createElement('option');
            opt.value = String(h);
            opt.textContent = String(h).padStart(2, '0');
            hourSelect.appendChild(opt);
        }
        for (let m = 0; m < 60; m += 5) {
            const opt = document.createElement('option');
            opt.value = String(m);
            opt.textContent = String(m).padStart(2, '0');
            minuteSelect.appendChild(opt);
        }
        hourSelect.value = String(selectedHour);
        minuteSelect.value = String(selectedMinute);
        if (typeof window.initTpSelect === 'function') {
            window.initTpSelect(hourSelect, { searchable: true });
            window.initTpSelect(minuteSelect, { searchable: true });
        }
        hourSelect.addEventListener('change', () => { selectedHour = Number(hourSelect.value); });
        minuteSelect.addEventListener('change', () => { selectedMinute = Number(minuteSelect.value); });
    }

    function isDateSelectable(dateStr) {
        if (!dateStr) return false;
        if (minDate && dateStr < minDate) return false;
        if (maxDate && dateStr > maxDate) return false;
        return true;
    }

    function syncNavButtons() {
        const prevBtn = calendarWrapper.querySelector('.prev-both');
        const nextBtn = calendarWrapper.querySelector('.next-both');
        if (!forwardMonthsOnly || navMinMonth == null || navMaxMonth == null) return;
        const firstIdx = monthIndex(currentYear, currentMonth);
        let sy = currentYear;
        let sm = currentMonth + 1;
        if (sm > 11) {
            sm = 0;
            sy += 1;
        }
        const secondIdx = monthIndex(sy, sm);
        if (prevBtn) {
            prevBtn.disabled = firstIdx <= navMinMonth;
            prevBtn.style.visibility = firstIdx <= navMinMonth ? 'hidden' : '';
        }
        if (nextBtn) {
            nextBtn.disabled = secondIdx >= navMaxMonth;
            nextBtn.style.visibility = secondIdx >= navMaxMonth ? 'hidden' : '';
        }
    }

    function renderBothMonths() {
        monthsContainer.innerHTML = '';
        const firstMonth = document.createElement('div');
        buildMonthCalendar(firstMonth, currentYear, currentMonth, true);
        monthsContainer.appendChild(firstMonth);
        let secondYear = currentYear;
        let secondMonth = currentMonth + 1;
        if (secondMonth === 12) {
            secondMonth = 0;
            secondYear++;
        }
        const secondMonthDiv = document.createElement('div');
        buildMonthCalendar(secondMonthDiv, secondYear, secondMonth, false);
        monthsContainer.appendChild(secondMonthDiv);
        syncNavButtons();
    }

    function buildMonthCalendar(container, year, month, isFirstMonth) {
        const date = new Date(year, month, 1);
        const firstDay = date.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();
        const startOffset = firstDay === 0 ? 6 : firstDay - 1;

        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

        let html = `
            <div class="custom-calendar-month">
                <div class="month-header">
                    <button type="button" class="change-month" data-month="${month}" data-year="${year}" data-dir="${isFirstMonth ? 'prev' : 'next'}">
                        ${monthNames[month]} ${year}
                    </button>
                </div>
                <div class="weekdays">
                    <div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Вс</div>
                </div>
                <div class="days">
        `;

        const belongsToMonth = (dateStr) => (
            typeof window.tpCalendarBelongsToMonth === 'function'
                ? window.tpCalendarBelongsToMonth(dateStr, year, month)
                : (() => {
                    const p = String(dateStr).split('-').map(Number);
                    return p.length === 3 && p[0] === year && p[1] - 1 === month;
                })()
        );
        const otherMonthCell = (dateStr, dayNum) => (
            typeof window.tpCalendarOtherMonthCell === 'function'
                ? window.tpCalendarOtherMonthCell(dayNum, dateStr)
                : `<div class="other-month">${dayNum}</div>`
        );

        const appendCell = (dateStr, dayNum) => {
            if (!belongsToMonth(dateStr)) {
                html += otherMonthCell(dateStr, dayNum);
                return;
            }
            const selectable = isDateSelectable(dateStr);
            if (!selectable) {
                html += otherMonthCell(dateStr, dayNum);
                return;
            }
            const dayCtx = { today: todayStr, selectionStart, selectionEnd };
            const classes = dayClassFn(dateStr, dayCtx);
            html += `<div class="${classes}" data-date="${dateStr}">${dayNum}</div>`;
        };

        for (let i = 0; i < startOffset; i++) {
            const prevDate = prevMonthDays - startOffset + i + 1;
            const prevYear = month === 0 ? year - 1 : year;
            const prevMonth = month === 0 ? 11 : month - 1;
            const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(prevDate).padStart(2, '0')}`;
            appendCell(dateStr, prevDate);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            appendCell(dateStr, d);
        }

        const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
        const remaining = totalCells - (startOffset + daysInMonth);
        for (let i = 1; i <= remaining; i++) {
            const nextYear = month === 11 ? year + 1 : year;
            const nextMonth = month === 11 ? 0 : month + 1;
            const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            appendCell(dateStr, i);
        }

        html += `</div></div>`;
        container.innerHTML = html;

        container.querySelectorAll('.day[data-date]').forEach(dayEl => {
            dayEl.addEventListener('click', e => {
                e.stopPropagation();
                const dateStr = dayEl.dataset.date;
                if (!isDateSelectable(dateStr)) return;
                if (!selectionStart || (selectionStart && selectionEnd)) {
                    selectionStart = dateStr;
                    selectionEnd = null;
                } else if (dateStr < selectionStart) {
                    selectionEnd = selectionStart;
                    selectionStart = dateStr;
                } else {
                    selectionEnd = dateStr;
                }
                renderBothMonths();
            });
        });

        const monthBtn = container.querySelector('.change-month');
        if (monthBtn) {
            monthBtn.addEventListener('click', e => {
                e.stopPropagation();
                const dir = monthBtn.dataset.dir;
                if (dir === 'prev') {
                    if (forwardMonthsOnly && monthIndex(currentYear, currentMonth) <= navMinMonth) return;
                    if (currentMonth === 0) {
                        currentMonth = 11;
                        currentYear--;
                    } else {
                        currentMonth--;
                    }
                } else {
                    let sy = currentYear;
                    let sm = currentMonth + 1;
                    if (sm > 11) {
                        sm = 0;
                        sy += 1;
                    }
                    if (forwardMonthsOnly && monthIndex(sy, sm) >= navMaxMonth) return;
                    if (currentMonth === 11) {
                        currentMonth = 0;
                        currentYear++;
                    } else {
                        currentMonth++;
                    }
                }
                renderBothMonths();
            });
        }
    }

    if (selectionEnd) {
        const endDate = new Date(selectionEnd);
        currentYear = endDate.getFullYear();
        currentMonth = endDate.getMonth();
    } else if (selectionStart) {
        const sd = new Date(selectionStart);
        currentYear = sd.getFullYear();
        currentMonth = sd.getMonth();
    } else {
        currentYear = today.getFullYear();
        currentMonth = today.getMonth();
    }

    if (forwardMonthsOnly) {
        const idx = monthIndex(currentYear, currentMonth);
        if (idx < navMinMonth) {
            currentYear = today.getFullYear();
            currentMonth = today.getMonth();
        } else if (idx > navMaxMonth) {
            const maxDate = new Date(today.getFullYear(), today.getMonth() + 3, 1);
            currentYear = maxDate.getFullYear();
            currentMonth = maxDate.getMonth();
        }
    }

    renderBothMonths();

    const close = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
    };

    calendarWrapper.querySelector('.prev-both').addEventListener('click', () => {
        if (forwardMonthsOnly && monthIndex(currentYear, currentMonth) <= navMinMonth) return;
        if (currentMonth === 0) {
            currentMonth = 11;
            currentYear--;
        } else {
            currentMonth--;
        }
        renderBothMonths();
    });
    calendarWrapper.querySelector('.next-both').addEventListener('click', () => {
        let sy = currentYear;
        let sm = currentMonth + 1;
        if (sm > 11) {
            sm = 0;
            sy += 1;
        }
        if (forwardMonthsOnly && monthIndex(sy, sm) >= navMaxMonth) return;
        if (currentMonth === 11) {
            currentMonth = 0;
            currentYear++;
        } else {
            currentMonth++;
        }
        renderBothMonths();
    });
    calendarWrapper.querySelector('.reset-dates').addEventListener('click', () => {
        selectionStart = null;
        selectionEnd = null;
        renderBothMonths();
    });
    calendarWrapper.querySelector('.apply-dates').addEventListener('click', () => {
        if (!onApply) {
            close();
            return;
        }
        const end = selectionEnd || selectionStart;
        if (showTime) {
            onApply({
                start: selectionStart,
                end: end && end !== selectionStart ? end : selectionStart,
                time: selectionStart ? formatTimeValue(selectedHour, selectedMinute) : null,
            });
        } else {
            onApply({ start: selectionStart, end: end || selectionStart });
        }
        close();
    });
    modal.addEventListener('click', e => {
        if (e.target === modal) close();
    });
    document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') {
            document.removeEventListener('keydown', onKey);
            close();
        }
    });
}

function openCustomCalendarSingle({ value, minDate, maxDate, title, onApply }) {
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const todayStr = typeof window.tpCalendarTodayIso === 'function'
        ? window.tpCalendarTodayIso()
        : (() => {
            const t = new Date();
            return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
        })();
    const dayClassFn = typeof window.tpCalendarDayClasses === 'function'
        ? window.tpCalendarDayClasses
        : (dateStr, ctx) => {
            let classes = 'day';
            const p = String(dateStr).split('-').map(Number);
            if (p.length === 3) {
                const dow = new Date(p[0], p[1] - 1, p[2]).getDay();
                if (dow === 0 || dow === 6) classes += ' weekend';
            }
            if (dateStr === todayStr) classes += ' today';
            if (ctx?.selectedIso === dateStr) classes += ' selected-start';
            return classes;
        };

    const minIso = minDate || null;
    const maxIso = maxDate || null;
    const minP = parseIsoParts(minIso);
    const maxP = parseIsoParts(maxIso);
    const minMonthIdx = minP ? monthIndex(minP.year, minP.month) : null;
    const maxMonthIdx = maxP ? monthIndex(maxP.year, maxP.month) : null;

    let selectedIso = value ? String(value).trim() : null;
    if (selectedIso && !parseIsoParts(selectedIso)) selectedIso = null;

    let currentYear;
    let currentMonth;
    if (selectedIso) {
        const p = parseIsoParts(selectedIso);
        currentYear = p.year;
        currentMonth = p.month;
    } else {
        const now = new Date();
        currentYear = now.getFullYear();
        currentMonth = now.getMonth();
    }
    if (minMonthIdx != null) {
        const mi = monthIndex(currentYear, currentMonth);
        if (mi < minMonthIdx && minP) {
            currentYear = minP.year;
            currentMonth = minP.month;
        }
    }
    if (maxMonthIdx != null) {
        const mi = monthIndex(currentYear, currentMonth);
        if (mi > maxMonthIdx && maxP) {
            currentYear = maxP.year;
            currentMonth = maxP.month;
        }
    }

    function dateInBounds(iso) {
        if (!iso) return false;
        if (minIso && iso < minIso) return false;
        if (maxIso && iso > maxIso) return false;
        return true;
    }

    function canGoPrev() {
        if (minMonthIdx == null) return true;
        return monthIndex(currentYear, currentMonth) > minMonthIdx;
    }

    function canGoNext() {
        if (maxMonthIdx == null) return true;
        return monthIndex(currentYear, currentMonth) < maxMonthIdx;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay custom-calendar-modal';
    const calendarWrapper = document.createElement('div');
    calendarWrapper.className = 'custom-calendar';
    calendarWrapper.innerHTML = `
        <div class="custom-calendar-header">
            <button type="button" class="prev-both" aria-label="Предыдущий месяц">←</button>
            <div class="custom-calendar-title">${title || 'Выберите дату'}</div>
            <button type="button" class="next-both" aria-label="Следующий месяц">→</button>
        </div>
        <div class="custom-calendar-months"></div>
        <div class="custom-calendar-footer">
            <button type="button" class="button-secondary reset-dates">Сбросить</button>
            <button type="button" class="button-basic apply-dates">Применить</button>
        </div>
    `;
    modal.appendChild(calendarWrapper);
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    const monthsContainer = calendarWrapper.querySelector('.custom-calendar-months');
    const prevBtn = calendarWrapper.querySelector('.prev-both');
    const nextBtn = calendarWrapper.querySelector('.next-both');

    function buildMonthCalendar(container, year, month) {
        const date = new Date(year, month, 1);
        const firstDay = date.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const prevMonthDays = new Date(year, month, 0).getDate();
        const startOffset = firstDay === 0 ? 6 : firstDay - 1;

        let html = `
            <div class="custom-calendar-month">
                <div class="month-header">
                    <button type="button" class="change-month">${monthNames[month]} ${year}</button>
                </div>
                <div class="weekdays">
                    <div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Вс</div>
                </div>
                <div class="days">
        `;

        const belongsToMonth = (dateStr) => (
            typeof window.tpCalendarBelongsToMonth === 'function'
                ? window.tpCalendarBelongsToMonth(dateStr, year, month)
                : (() => {
                    const p = String(dateStr).split('-').map(Number);
                    return p.length === 3 && p[0] === year && p[1] - 1 === month;
                })()
        );
        const otherMonthCell = (dateStr, dayNum) => (
            typeof window.tpCalendarOtherMonthCell === 'function'
                ? window.tpCalendarOtherMonthCell(dayNum, dateStr)
                : `<div class="other-month">${dayNum}</div>`
        );

        for (let i = 0; i < startOffset; i++) {
            const prevDate = prevMonthDays - startOffset + i + 1;
            const prevYear = month === 0 ? year - 1 : year;
            const prevMonth = month === 0 ? 11 : month - 1;
            const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(prevDate).padStart(2, '0')}`;
            html += otherMonthCell(dateStr, prevDate);
        }

        const dayCtx = { selectedIso };
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const clickable = dateInBounds(dateStr);
            if (!clickable) {
                html += otherMonthCell(dateStr, d);
            } else {
                const classes = dayClassFn(dateStr, dayCtx);
                html += `<div class="${classes}" data-date="${dateStr}">${d}</div>`;
            }
        }

        const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
        const remaining = totalCells - (startOffset + daysInMonth);
        for (let i = 1; i <= remaining; i++) {
            const nextYear = month === 11 ? year + 1 : year;
            const nextMonth = month === 11 ? 0 : month + 1;
            const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            html += otherMonthCell(dateStr, i);
        }

        html += '</div></div>';
        container.innerHTML = html;

        container.querySelectorAll('.day[data-date]').forEach(dayEl => {
            dayEl.addEventListener('click', e => {
                e.stopPropagation();
                const dateStr = dayEl.dataset.date;
                if (!dateStr || !dateInBounds(dateStr)) return;
                selectedIso = dateStr;
                renderMonth();
            });
        });
    }

    function syncNavButtons() {
        if (prevBtn) {
            prevBtn.disabled = !canGoPrev();
            prevBtn.style.visibility = canGoPrev() ? '' : 'hidden';
        }
        if (nextBtn) {
            nextBtn.disabled = !canGoNext();
            nextBtn.style.visibility = canGoNext() ? '' : 'hidden';
        }
    }

    function shiftMonth(delta) {
        if (delta < 0 && !canGoPrev()) return;
        if (delta > 0 && !canGoNext()) return;
        if (currentMonth + delta < 0) {
            currentMonth = 11;
            currentYear--;
        } else if (currentMonth + delta > 11) {
            currentMonth = 0;
            currentYear++;
        } else {
            currentMonth += delta;
        }
        renderMonth();
    }

    function renderMonth() {
        monthsContainer.innerHTML = '';
        const firstMonth = document.createElement('div');
        buildMonthCalendar(firstMonth, currentYear, currentMonth);
        monthsContainer.appendChild(firstMonth);

        let secondYear = currentYear;
        let secondMonth = currentMonth + 1;
        if (secondMonth > 11) {
            secondMonth = 0;
            secondYear++;
        }
        if (maxMonthIdx == null || monthIndex(secondYear, secondMonth) <= maxMonthIdx) {
            const secondMonthDiv = document.createElement('div');
            buildMonthCalendar(secondMonthDiv, secondYear, secondMonth);
            monthsContainer.appendChild(secondMonthDiv);
        }
        syncNavButtons();
    }

    prevBtn?.addEventListener('click', e => {
        e.stopPropagation();
        shiftMonth(-1);
    });
    nextBtn?.addEventListener('click', e => {
        e.stopPropagation();
        shiftMonth(1);
    });

    const close = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
    };

    calendarWrapper.querySelector('.reset-dates')?.addEventListener('click', () => {
        selectedIso = null;
        if (onApply) onApply(null);
        close();
    });
    calendarWrapper.querySelector('.apply-dates')?.addEventListener('click', () => {
        if (onApply) onApply(selectedIso);
        close();
    });
    modal.addEventListener('click', e => {
        if (e.target === modal) close();
    });
    document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') {
            document.removeEventListener('keydown', onKey);
            close();
        }
    });

    renderMonth();
}

function openCustomCalendarRangeWithTime(opts) {
    const options = opts || {};
    return openCustomCalendarRange({
        start: options.startDate || options.start,
        end: options.endDate || options.end,
        timeValue: options.timeValue || options.time,
        withTime: true,
        minDate: options.minDate,
        maxDate: options.maxDate,
        title: options.title || 'Дата и время',
        forwardMonthsOnly: true,
        onApply: (result) => {
            if (!options.onApply) return;
            if (!result?.start) {
                options.onApply({ startDate: null, endDate: null, time: null });
                return;
            }
            const end = result.end && result.end !== result.start ? result.end : null;
            options.onApply({
                startDate: result.start,
                endDate: end,
                time: result.time || null,
            });
        },
    });
}

window.openCustomCalendarRange = openCustomCalendarRange;
window.openCustomCalendarRangeWithTime = openCustomCalendarRangeWithTime;
window.openCustomCalendarSingle = openCustomCalendarSingle;
