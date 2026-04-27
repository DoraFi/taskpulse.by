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

        fetch('/api/index/mini-chart')
            .then(r => r.ok ? r.json() : Promise.reject(new Error('mini chart api')))
            .then(data => {
                drawMiniChart(data.team || [], data.me || [], {
                    min: Number.isFinite(data.min) ? data.min : 0,
                    max: Number.isFinite(data.max) ? data.max : 14
                });
            })
            .catch(err => console.error(err));

        fetch('/api/index/summary')
            .then(r => r.ok ? r.json() : Promise.reject(new Error('index summary failed')))
            .then(data => {
                const grid = document.querySelector('.tasks-to-do-grid');
                if (grid && Array.isArray(data.todo)) {
                    grid.innerHTML = data.todo.map(task => {
                        const overdue = isOverdueDate(task.dueDate);
                        const dueClass = isAttentionDate(task.dueDate) ? 'pink' : 'light-gray';
                        return `
                            <div class="grid-row">
                                <div class="col-task">
                                    <div class="basic-and-signature">
                                        <p class="text-basic">${task.name || ''}</p>
                                        <p class="text-signature">${task.project || ''}</p>
                                    </div>
                                </div>
                                <div class="col-date">
                                    ${overdue
                                        ? `<div class="due-attention"><p class="text-basic">Просрочено</p><p class="text-signature">${formatRelativeDate(task.dueDate) || '—'}</p></div>`
                                        : `<p class="text-basic ${dueClass}">${formatRelativeDate(task.dueDate) || '—'}</p>`
                                    }
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                const statCards = document.querySelectorAll('.cards .card .text-header');
                if (statCards.length >= 3) {
                    if (data.assigned != null) statCards[0].textContent = String(data.assigned);
                    if (data.inProgress != null) statCards[1].textContent = String(data.inProgress);
                    if (data.done != null) statCards[2].textContent = String(data.done);
                }

                const projectsCard = document.querySelector('.card.activ-projects');
                if (projectsCard && Array.isArray(data.activeProjects) && data.activeProjects.length > 0) {
                    projectsCard.querySelectorAll('.project').forEach(el => el.remove());
                    const projectsHtml = data.activeProjects.map((p) => `
                        <div class="project">
                            <div class="basic-and-signature">
                                <p class="text-basic">${p.name || ''}</p>
                                <p class="text-signature">${p.summary || ''}</p>
                            </div>
                            <div class="project-percents">
                                <div class="done" style="width: ${p.donePercent || 0}%;">${p.donePercent || 0}%</div>
                                <div class="inprocess" style="width: ${p.inProgressPercent || 0}%;">${p.inProgressPercent || 0}%</div>
                                <div class="todo" style="width: ${p.queuePercent || 0}%;">${p.queuePercent || 0}%</div>
                            </div>
                        </div>
                    `).join('');
                    const legends = projectsCard.querySelector('.legends');
                    if (legends) {
                        legends.insertAdjacentHTML('beforebegin', projectsHtml);
                    }
                }

                const teamCard = document.querySelector('.card.team');
                if (teamCard && Array.isArray(data.team) && data.team.length > 0) {
                    const teamList = teamCard.querySelector('.team-members-list');
                    if (!teamList) return;
                    const teamHtml = data.team.map((m) => `
                        <div class="user-img-text">
                            ${m.online ? `<div class="status-online"><img src="/static/source/user_img/${m.avatar || 'basic_avatar.png'}" alt=""></div>` : `<img src="/static/source/user_img/${m.avatar || 'basic_avatar.png'}" alt="">`}
                            <div class="basic-and-signature">
                                <p class="text-basic">${m.name || ''}</p>
                                <p class="text-signature">${m.role || ''}</p>
                            </div>
                        </div>
                    `).join('');
                    teamList.innerHTML = teamHtml;
                }

                const recentRoot = document.getElementById('indexRecentActions');
                if (recentRoot && Array.isArray(data.recentActions)) {
                    if (data.recentActions.length === 0) {
                        return;
                    }
                    recentRoot.innerHTML = data.recentActions.slice(0, 5).map((a) => `
                        <div class="grid-row">
                            <div class="col-avatar"><img class="avatar" src="/static/source/user_img/${a.avatar || 'basic_avatar.png'}" alt=""></div>
                            <div class="col-task">
                                <div class="basic-and-signature">
                                    <span class="id-name">
                                        <p class="text-basic" id="tasknumber">${a.id || ''}</p>
                                        <p class="text-basic" id="taskname">${a.name || ''}</p>
                                    </span>
                                    <p class="text-signature" id="projectname">${a.project || ''}</p>
                                </div>
                            </div>
                            <div class="col-status"><span class="status ${a.status || 'neutral'}">${statusName(a.status)}</span></div>
                            <div class="col-date"><p class="text-basic light-gray">${a.date || ''}</p></div>
                        </div>
                    `).join('');
                }
            })
            .catch(err => console.error(err));
    })();
}

function statusName(status) {
    switch (status) {
        case 'inprocess': return 'В работе';
        case 'done': return 'Завершено';
        case 'exit': return 'Отложено';
        default: return 'Назначена';
    }
}

function parseDateValue(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    if (dateStr.includes('.')) {
        const [day, month, year] = dateStr.split('.');
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (dateStr.includes('-')) {
        const [year, month, day] = dateStr.split('-');
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
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
    if (diff == null) return dateStr || '';
    if (diff === -1) return 'Вчера';
    if (diff === 0) return 'Сегодня';
    if (diff === 1) return 'Завтра';
    return dateStr;
}

function isAttentionDate(dateStr) {
    const diff = daysDiffFromToday(dateStr);
    if (diff == null) return false;
    return diff <= 2;
}

function isOverdueDate(dateStr) {
    const diff = daysDiffFromToday(dateStr);
    if (diff == null) return false;
    return diff < 0;
}

console.log('index.js загружен, initIndexPage определена:', typeof window.initIndexPage);
window.initIndexPage = initIndexPage;

document.addEventListener('DOMContentLoaded', initIndexPage);