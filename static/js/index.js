function initIndexPage() {
    console.log('initIndexPage вызван');

    (function(){
        const root = document.getElementById('chartRoot');
        if(root){
            root.style.width = '100%';
            root.style.minWidth = '0';
            root.style.boxSizing = 'border-box';
        }
        const s = document.getElementById('miniChart');
        if(s){
            s.style.display = 'block';
            s.style.width = '100%';
            s.style.height = 'auto';
            s.style.minHeight = '160px';
            s.style.maxWidth = '100%';
            s.style.boxSizing = 'border-box';
            s.style.overflow = 'visible';
        }
    })();

    (function () {
        const svg = document.getElementById('miniChart');
        if (!svg) {
            console.warn('miniChart не найден');
            return;
        }

        const linesLayer = svg.querySelector('#linesLayer');
        const pointsLayer = svg.querySelector('#pointsLayer');
        const xLabelsGroup = svg.querySelector('#xLabels');

        const left = 100, right = 1040, top = 0, bottom = 284;
        const usableW = right - left;
        const stepX = usableW / 4;

        function clamp(v, a, b) { return Math.max(a, Math.min(b, Number(v) || a)); }

        function computeY(value, minV, maxV) {
            const stepY = (bottom - top) / (maxV - minV);
            return top + (maxV - clamp(value, minV, maxV)) * stepY;
        }

        function isWorkingDay(date) {
            const dayOfWeek = date.getDay();
            return dayOfWeek >= 1 && dayOfWeek <= 5;
        }

        function getLastWorkingDays() {
            const today = new Date();
            const workingDays = [];
            let currentDate = new Date(today);
            while (workingDays.length < 5) {
                if (isWorkingDay(currentDate)) {
                    workingDays.unshift(new Date(currentDate));
                }
                currentDate.setDate(currentDate.getDate() - 1);
            }
            return workingDays;
        }

        function getWeekdayName(date) {
            const weekdays = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
            return weekdays[date.getDay()];
        }

        function formatDateWithLeadingZero(date) {
            const day = date.getDate();
            const month = date.getMonth() + 1;
            const monthStr = month < 10 ? `0${month}` : `${month}`;
            return `${day}.${monthStr}`;
        }

        function formatLabel(date, index, totalDays) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);
            const isTodayWorking = isWorkingDay(today);
            const isLastDay = (index === totalDays - 1);
            const isSecondLast = (index === totalDays - 2);
            const dateStr = formatDateWithLeadingZero(targetDate);
            const weekdayName = getWeekdayName(targetDate);
            if (isLastDay && isTodayWorking) return `Сегодня, ${dateStr}`;
            if (isSecondLast) return `Вчера, ${dateStr}`;
            return `${weekdayName}, ${dateStr}`;
        }

        function drawMiniChart(team, me, opts) {
            const workingDays = getLastWorkingDays();
            const xLabels = workingDays.map((date, index) => formatLabel(date, index, workingDays.length));
            opts = opts || {};
            const minV = ('min' in opts) ? opts.min : 2;
            const maxV = ('max' in opts) ? opts.max : 14;
            const normalize = (arr) => {
                const out = Array.isArray(arr) ? arr.slice(0, 5) : [];
                while (out.length < 5) out.push(minV);
                return out;
            };
            const teamA = normalize(team);
            const meA = normalize(me);
            const xs = [];
            for (let i = 0; i < 5; i++) xs.push(left + i * stepX);
            xLabelsGroup.innerHTML = '';
            for (let i = 0; i < 5; i++) {
                const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                t.setAttribute('x', xs[i]);
                t.setAttribute('y', 320);
                t.setAttribute('text-anchor', 'middle');
                t.setAttribute('class', 'x-label');
                t.setAttribute('font-size', '12');
                t.textContent = xLabels[i] || '';
                xLabelsGroup.appendChild(t);
            }
            const teamYs = teamA.map(v => computeY(v, minV, maxV));
            const meYs = meA.map(v => computeY(v, minV, maxV));
            linesLayer.innerHTML = '';
            const makePolyline = (xs, ys, cls) => {
                const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                poly.setAttribute('points', xs.map((x, i) => `${x},${ys[i]}`).join(' '));
                poly.setAttribute('class', cls);
                poly.setAttribute('filter', 'url(#blur)');
                linesLayer.appendChild(poly);
            };
            makePolyline(xs, teamYs, 'mc-line-team');
            makePolyline(xs, meYs, 'mc-line-me');
            pointsLayer.innerHTML = '';
            const drawPoint = (cx, cy, color) => {
                const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                c.setAttribute('cx', cx);
                c.setAttribute('cy', cy);
                c.setAttribute('r', 6);
                c.setAttribute('fill', '#F6FBF2');
                c.setAttribute('stroke', color);
                c.setAttribute('stroke-width', 3);
                pointsLayer.appendChild(c);
            };
            for (let i = 0; i < 5; i++) drawPoint(xs[i], teamYs[i], '#2D3229');
            for (let i = 0; i < 5; i++) drawPoint(xs[i], meYs[i], '#61A039');
            return { xs, teamYs, meYs, xLabels, workingDays };
        }

        window.drawMiniChart = drawMiniChart;

        const sampleTeam = [10, 9, 2, 8, 7];
        const sampleMe = [12, 5, 5, 4, 7];
        drawMiniChart(sampleTeam, sampleMe, { min: 2, max: 14 });
    })();
}

console.log('index.js загружен, initIndexPage определена:', typeof window.initIndexPage);
window.initIndexPage = initIndexPage;

document.addEventListener('DOMContentLoaded', initIndexPage);