(function (global) {
    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function toIsoDate(year, monthIndex, day) {
        return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
    }

    function todayIso() {
        const t = new Date();
        return toIsoDate(t.getFullYear(), t.getMonth(), t.getDate());
    }

    /**
     * @param {string} dateStr ISO yyyy-mm-dd
     * @param {{ selectedIso?: string|null, selectionStart?: string|null, selectionEnd?: string|null }} ctx
     */
    function dayClasses(dateStr, ctx) {
        const opts = ctx || {};
        let classes = 'day';
        const parts = String(dateStr || '').split('-').map(Number);
        if (parts.length === 3) {
            const dow = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
            if (dow === 0 || dow === 6) classes += ' weekend';
        }
        if (dateStr === todayIso()) classes += ' today';

        const selectedIso = opts.selectedIso || null;
        const selectionStart = opts.selectionStart || null;
        const selectionEnd = opts.selectionEnd || null;

        if (selectedIso && dateStr === selectedIso) {
            classes += ' selected-start';
        }
        if (selectionStart && dateStr === selectionStart) classes += ' selected-start';
        if (selectionEnd && dateStr === selectionEnd) classes += ' selected-end';
        if (selectionStart && selectionEnd && dateStr > selectionStart && dateStr < selectionEnd) {
            classes += ' in-range';
        }
        return classes;
    }

    function belongsToMonth(iso, year, monthIndex) {
        const parts = String(iso || '').split('-').map(Number);
        return parts.length === 3 && parts[0] === year && parts[1] - 1 === monthIndex;
    }

    function isWeekendIso(iso) {
        const parts = String(iso || '').split('-').map(Number);
        if (parts.length !== 3) return false;
        const dow = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
        return dow === 0 || dow === 6;
    }

    function otherMonthCellHtml(dayNum, iso) {
        let cls = 'other-month';
        if (isWeekendIso(iso)) cls += ' weekend';
        return `<div class="${cls}">${dayNum}</div>`;
    }

    global.tpCalendarTodayIso = todayIso;
    global.tpCalendarDayClasses = dayClasses;
    global.tpCalendarToIsoDate = toIsoDate;
    global.tpCalendarBelongsToMonth = belongsToMonth;
    global.tpCalendarIsWeekendIso = isWeekendIso;
    global.tpCalendarOtherMonthCell = otherMonthCellHtml;
})(typeof window !== 'undefined' ? window : this);
