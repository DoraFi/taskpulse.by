/**
 * Общий календарь диапазона дат (фильтры задач, модалка создания задачи).
 * Стили: .custom-calendar-modal
 */
function openCustomCalendarRange({ start, end, onApply }) {
    let selectionStart = start || null;
    let selectionEnd = end || null;
    let currentYear;
    let currentMonth;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay custom-calendar-modal';
    const calendarWrapper = document.createElement('div');
    calendarWrapper.className = 'custom-calendar';
    calendarWrapper.innerHTML = `
        <div class="custom-calendar-header">
            <button type="button" class="prev-both">←</button>
            <div class="custom-calendar-title">Выберите диапазон дат</div>
            <button type="button" class="next-both">→</button>
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

        for (let i = 0; i < startOffset; i++) {
            const prevDate = prevMonthDays - startOffset + i + 1;
            const prevYear = month === 0 ? year - 1 : year;
            const prevMonth = month === 0 ? 11 : month - 1;
            const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(prevDate).padStart(2, '0')}`;
            html += `<div class="other-month" data-date="${dateStr}">${prevDate}</div>`;
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            let classes = 'day';
            if (selectionStart === dateStr) classes += ' selected-start';
            if (selectionEnd === dateStr) classes += ' selected-end';
            if (selectionStart && selectionEnd && dateStr > selectionStart && dateStr < selectionEnd) classes += ' in-range';
            html += `<div class="${classes}" data-date="${dateStr}">${d}</div>`;
        }

        const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
        const remaining = totalCells - (startOffset + daysInMonth);
        for (let i = 1; i <= remaining; i++) {
            const nextYear = month === 11 ? year + 1 : year;
            const nextMonth = month === 11 ? 0 : month + 1;
            const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            html += `<div class="other-month" data-date="${dateStr}">${i}</div>`;
        }

        html += `</div></div>`;
        container.innerHTML = html;

        container.querySelectorAll('.day').forEach(dayEl => {
            dayEl.addEventListener('click', e => {
                e.stopPropagation();
                const dateStr = dayEl.dataset.date;
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
                    if (currentMonth === 0) {
                        currentMonth = 11;
                        currentYear--;
                    } else {
                        currentMonth--;
                    }
                } else if (currentMonth === 11) {
                    currentMonth = 0;
                    currentYear++;
                } else {
                    currentMonth++;
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
        const now = new Date();
        currentYear = now.getFullYear();
        currentMonth = now.getMonth();
    }

    renderBothMonths();

    const close = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
    };

    calendarWrapper.querySelector('.prev-both').addEventListener('click', () => {
        if (currentMonth === 0) {
            currentMonth = 11;
            currentYear--;
        } else {
            currentMonth--;
        }
        renderBothMonths();
    });
    calendarWrapper.querySelector('.next-both').addEventListener('click', () => {
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
        if (onApply) onApply({ start: selectionStart, end: selectionEnd || selectionStart });
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

window.openCustomCalendarRange = openCustomCalendarRange;
