(function () {
    const COLORS = {
        green: '#61A039',
        darkGreen: '#2A4D14',
        greenLight: 'rgba(97, 160, 57, 0.55)',
        greenPale: 'rgba(97, 160, 57, 0.15)',
        queue: '#7F8C73',
        wip: '#61A039',
        test: 'rgba(97, 160, 57, 0.35)',
        done: '#2A4D14',
        urgent: '#F8085C',
        normal: 'rgba(97, 160, 57, 0.22)',
        grid: 'rgba(45, 50, 41, 0.08)',
    };

    const CFD_PALETTE = {
        queue: { fill: '#9aa892', stroke: '#9aa892' },
        wip:   { fill: '#61a039', stroke: '#61a039' },
        test:  { fill: '#467727', stroke: '#467727' },
        done:  { fill: '#2a4d14', stroke: '#2a4d14' },
    };

    const charts = {};
    let dashboardData = null;

    function chartTextColor() {
        return document.body.dataset.theme === 'dark' ? '#E8EDE4' : '#2D3229';
    }

    function chartMutedColor() {
        return document.body.dataset.theme === 'dark' ? 'rgba(232, 237, 228, 0.65)' : '#7F8C73';
    }

    function chartGridColor() {
        return document.body.dataset.theme === 'dark' ? 'rgba(232, 237, 228, 0.1)' : COLORS.grid;
    }

    function chartFont(size, weight) {
        return { family: 'SN Pro, sans-serif', size, weight: weight || '400' };
    }

    function registerOutwardTooltip() {
        if (typeof Chart === 'undefined' || !Chart.Tooltip?.positioners) return;
        Chart.Tooltip.positioners.outward = function (items) {
            if (!items?.length) {
                return Chart.Tooltip.positioners.average.call(this, items);
            }
            const chart = this.chart;
            const el = items[0].element;
            if (!chart?.chartArea || !el || typeof el.getCenterPoint !== 'function') {
                return Chart.Tooltip.positioners.average.call(this, items);
            }

            const { x, y } = el.getCenterPoint(true);
            const { left, right, top, bottom } = chart.chartArea;
            const cx = (left + right) / 2;
            const cy = (top + bottom) / 2;
            let dx = x - cx;
            let dy = y - cy;
            const len = Math.hypot(dx, dy) || 1;
            dx /= len;
            dy /= len;

            const offset = 36;
            return {
                x: x + dx * offset,
                y: y + dy * offset,
                xAlign: dx > 0.2 ? 'left' : dx < -0.2 ? 'right' : 'center',
                yAlign: dy > 0.2 ? 'top' : dy < -0.2 ? 'bottom' : 'center',
            };
        };
    }

    function chartTooltipTheme() {
        const dark = document.body.dataset.theme === 'dark';
        return {
            enabled: true,
            backgroundColor: dark ? '#2D3229' : '#EEF7E9',
            titleColor: dark ? '#E8EDE4' : '#2D3229',
            bodyColor: dark ? 'rgba(232, 237, 228, 0.92)' : '#2D3229',
            borderColor: dark ? 'rgba(97, 160, 57, 0.45)' : 'rgba(97, 160, 57, 0.35)',
            borderWidth: 1,
            cornerRadius: 5,
            padding: 10,
            caretSize: 6,
            caretPadding: 8,
            boxPadding: 6,
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            titleFont: chartFont(13, '500'),
            bodyFont: chartFont(12, '400'),
            footerFont: chartFont(12, '600'),
            footerColor: dark ? '#E8EDE4' : '#2D3229',
            position: 'average',
        };
    }

    function mergeChartOptions(base, extra) {
        if (!extra) return base;
        const out = { ...base, ...extra };
        if (base.plugins || extra.plugins) {
            out.plugins = {
                ...base.plugins,
                ...extra.plugins,
                legend: { ...(base.plugins?.legend || {}), ...(extra.plugins?.legend || {}), labels: { ...(base.plugins?.legend?.labels || {}), ...(extra.plugins?.legend?.labels || {}) } },
                tooltip: { ...(base.plugins?.tooltip || {}), ...(extra.plugins?.tooltip || {}) },
            };
        }
        if (base.scales || extra.scales) {
            out.scales = { ...base.scales, ...extra.scales };
            ['x', 'y'].forEach((axis) => {
                if (base.scales?.[axis] || extra.scales?.[axis]) {
                    out.scales[axis] = {
                        ...(base.scales?.[axis] || {}),
                        ...(extra.scales?.[axis] || {}),
                        ticks: { ...(base.scales?.[axis]?.ticks || {}), ...(extra.scales?.[axis]?.ticks || {}) },
                        grid: { ...(base.scales?.[axis]?.grid || {}), ...(extra.scales?.[axis]?.grid || {}) },
                    };
                }
            });
        }
        if (extra.cutout !== undefined) out.cutout = extra.cutout;
        if (extra.indexAxis !== undefined) out.indexAxis = extra.indexAxis;
        return out;
    }

    function countYScale(extraTicks) {
        return {
            beginAtZero: true,
            ticks: {
                color: chartTextColor(),
                stepSize: 1,
                precision: 0,
                callback: (value) => (Number.isInteger(value) ? value : undefined),
                ...extraTicks,
            },
            grid: { color: chartGridColor() },
        };
    }

    function chartLegendBottom(extra) {
        return {
            position: 'bottom',
            align: 'center',
            labels: {
                color: chartTextColor(),
                font: chartFont(12),
                boxWidth: 10,
                boxHeight: 10,
                padding: 12,
                usePointStyle: true,
                pointStyle: 'circle',
            },
            ...extra,
        };
    }

    function defaultChartOptions(extra) {
        const tickColor = chartMutedColor();
        const textColor = chartTextColor();
        const base = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: chartLegendBottom(),
                tooltip: chartTooltipTheme(),
            },
        };
        const withScales = extra?.scales
            ? mergeChartOptions({
                ...base,
                scales: {
                    x: { ticks: { color: tickColor, font: chartFont(11) }, grid: { color: chartGridColor() } },
                    y: { ticks: { color: tickColor, font: chartFont(11) }, grid: { color: chartGridColor() } },
                },
            }, extra)
            : mergeChartOptions(base, extra);
        return withScales;
    }

    async function ensureChartFonts() {
        if (!document.fonts?.load) return;
        try {
            await Promise.all([
                document.fonts.load('400 12px "SN Pro"'),
                document.fonts.load('500 13px "SN Pro"'),
            ]);
        } catch (_) { }
    }

    function applyChartDefaults() {
        if (!chartsAvailable()) return;
        registerOutwardTooltip();
        const textColor = chartTextColor();
        Chart.defaults.font.family = 'SN Pro, sans-serif';
        Chart.defaults.font.size = 12;
        Chart.defaults.font.weight = '400';
        Chart.defaults.color = textColor;
        Object.assign(Chart.defaults.plugins.tooltip, chartTooltipTheme());
        Chart.defaults.plugins.legend.labels.font = chartFont(12);
        Chart.defaults.plugins.legend.labels.color = textColor;
    }

    function destroyChart(id) {
        if (charts[id]) {
            charts[id].destroy();
            delete charts[id];
        }
    }

    function int(v) {
        return Number(v) || 0;
    }

    function pluralRu(n, one, few, many) {
        const abs = Math.abs(int(n));
        const mod10 = abs % 10;
        const mod100 = abs % 100;
        if (mod100 >= 11 && mod100 <= 14) return many;
        if (mod10 === 1) return one;
        if (mod10 >= 2 && mod10 <= 4) return few;
        return many;
    }

    function pluralProjects(n) {
        return pluralRu(n, 'проект', 'проекта', 'проектов');
    }

    function pluralDays(n) {
        return pluralRu(n, 'день', 'дня', 'дней');
    }

    function pluralTasks(n) {
        return pluralRu(n, 'задача', 'задачи', 'задач');
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function healthClass(health) {
        if (health === 'high_risk') return 'is-danger';
        if (health === 'attention') return 'is-warn';
        return 'is-ok';
    }

    function renderKpis(kpis, executive) {
        const grid = document.getElementById('analyticsKpiGrid');
        if (!grid) return;
        const items = [
            { label: 'Всего задач', value: kpis.total, hint: 'Задачи с активностью за выбранный период' },
            { label: 'Готово', value: kpis.done, hint: `В «Готово» на конец периода · ${executive.doneRate}% завершено за период` },
            { label: 'В работе', value: kpis.inProgress, hint: 'Включая тестирование' },
            { label: 'В очереди', value: kpis.queue, hint: 'Ещё не взяты в работу' },
            { label: 'Просрочено', value: kpis.overdue, hint: `${executive.overdueRate}% от среза периода` },
            { label: 'Срочные', value: kpis.urgent, hint: 'Приоритет «срочно» в срезе периода' },
            { label: 'Создано за период', value: kpis.createdPeriod, hint: 'Новые задачи за период' },
        ];
        grid.innerHTML = items.map((item) => `
            <div class="analytics-kpi">
                <span class="text-signature">${escapeHtml(item.label)}</span>
                <span class="text-header">${int(item.value)}</span>
                <span class="text-signature analytics-kpi__hint">${escapeHtml(item.hint)}</span>
            </div>
        `).join('');
    }

    function renderHealth(executive, meta) {
        const el = document.getElementById('analyticsHealthCard');
        if (!el) return;
        el.className = `analytics-health card br-10 ${healthClass(executive.health)}`;
        el.innerHTML = `
            <div class="analytics-health__main">
                <span class="text-header">Состояние портфеля</span>
                <span class="analytics-health__badge text-signature">${escapeHtml(executive.healthLabel)}</span>
            </div>
            <p class="text-basic analytics-health__text">
                Проанализировано <strong>${int(meta.projectCount)}</strong> ${pluralProjects(meta.projectCount)} и
                <strong>${int(meta.taskCount)}</strong> ${pluralTasks(meta.taskCount)} за <strong>${int(meta.periodDays)}</strong> ${pluralDays(meta.periodDays)}.
                Доля завершённых: <strong>${int(executive.doneRate)}%</strong>,
                просрочек: <strong>${int(executive.overdueRate)}%</strong>.
            </p>
        `;
    }

    function renderVelocity(data) {
        if (!chartsAvailable()) return;
        destroyChart('chartVelocity');
        const ctx = document.getElementById('chartVelocity');
        if (!ctx) return;
        charts.chartVelocity = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [
                    { label: 'Создано', data: data.created, backgroundColor: COLORS.greenPale, borderRadius: 5, borderSkipped: false },
                    { label: 'Завершено', data: data.completed, backgroundColor: COLORS.green, borderRadius: 5, borderSkipped: false },
                ],
            },
            options: defaultChartOptions({
                plugins: { legend: chartLegendBottom() },
                scales: {
                    x: { ticks: { color: chartTextColor() }, grid: { color: chartGridColor() } },
                    y: countYScale(),
                },
            }),
        });
    }

    function pickColors(count, palette) {
        return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
    }

    const STAGE_PALETTE = [
        COLORS.queue,
        COLORS.wip,
        COLORS.test,
        COLORS.green,
        COLORS.done,
        COLORS.greenPale,
        COLORS.greenLight,
        COLORS.darkGreen,
    ];

    function resizeAllCharts() {
        Object.values(charts).forEach((chart) => {
            try {
                chart?.resize();
            } catch (_) {}
        });
    }

    function renderDonut(id, items, colors) {
        if (!chartsAvailable()) return;
        destroyChart(id);
        const ctx = document.getElementById(id);
        if (!ctx || !items.length) return;
        const palette = pickColors(items.length, colors);
        const legendEl = document.getElementById(`${id}Legend`);
        charts[id] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: items.map((i) => i.label),
                datasets: [{
                    data: items.map((i) => i.count),
                    backgroundColor: palette,
                    borderWidth: 0,
                }],
            },
            options: defaultChartOptions({
                cutout: '58%',
                plugins: {
                    legend: { display: false },
                    tooltip: { position: 'outward' },
                },
            }),
        });
        if (legendEl) {
            legendEl.innerHTML = items.map((item, i) => `
                <div class="analytics-chart-legend__item">
                    <span class="analytics-chart-legend__dot" style="background:${palette[i]}"></span>
                    <span class="analytics-chart-legend__text">
                        <span class="text-signature analytics-chart-legend__label">${escapeHtml(item.label)}</span>
                        <span class="analytics-chart-legend__value">${int(item.count)}</span>
                    </span>
                </div>
            `).join('');
        }
        requestAnimationFrame(resizeAllCharts);
    }

    function renderActivity(data) {
        destroyChart('chartActivity');
        const ctx = document.getElementById('chartActivity');
        if (!ctx) return;
        charts.chartActivity = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Изменения статусов',
                    data: data.changes,
                    borderColor: COLORS.green,
                    backgroundColor: 'rgba(97, 160, 57, 0.2)',
                    fill: true,
                    tension: 0.35,
                }],
            },
            options: defaultChartOptions({
                plugins: { legend: chartLegendBottom() },
                scales: {
                    x: { ticks: { color: chartTextColor(), maxRotation: 45 }, grid: { color: chartGridColor() } },
                    y: countYScale(),
                },
            }),
        });
    }

    function renderInlineLegend(legendId, items) {
        const legendEl = document.getElementById(legendId);
        if (!legendEl) return;
        legendEl.innerHTML = items.map((item) => `
            <div class="analytics-chart-legend__item analytics-chart-legend__item--inline">
                <span class="analytics-chart-legend__dot" style="background:${item.color}"></span>
                <span class="text-signature analytics-chart-legend__label">${escapeHtml(item.label)}</span>
            </div>
        `).join('');
    }

    function renderCfd(data) {
        destroyChart('chartCfd');
        const ctx = document.getElementById('chartCfd');
        if (!ctx) return;

        const series = [
            { label: 'Очередь', data: data.queue, fill: CFD_PALETTE.queue.fill, line: CFD_PALETTE.queue.stroke },
            { label: 'В работе', data: data.inProgress, fill: CFD_PALETTE.wip.fill, line: CFD_PALETTE.wip.stroke },
            { label: 'Тестирование', data: data.testing, fill: CFD_PALETTE.test.fill, line: CFD_PALETTE.test.stroke },
            { label: 'Готово', data: data.done, fill: CFD_PALETTE.done.fill, line: CFD_PALETTE.done.stroke },
        ];

        renderInlineLegend('chartCfdLegend', series.map((s) => ({ label: s.label, color: s.line })));

        charts.chartCfd = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: series.map((s) => ({
                    label: s.label,
                    data: s.data,
                    fill: true,
                    stack: 'cfd',
                    backgroundColor: s.fill,
                    borderColor: s.line,
                    borderWidth: 1,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHitRadius: 10,
                    pointHoverBorderWidth: 2,
                    pointHoverBackgroundColor: '#fff',
                    tension: 0.35,
                })),
            },
            options: defaultChartOptions({
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        footerColor: chartTextColor(),
                        footerFont: chartFont(12, '600'),
                        callbacks: {
                            footer: (items) => {
                                const sum = items.reduce((acc, item) => acc + (item.parsed?.y || 0), 0);
                                return sum ? `Всего: ${sum}` : '';
                            },
                        },
                    },
                },
                layout: { padding: { top: 4, right: 4, bottom: 0, left: 0 } },
                scales: {
                    x: {
                        stacked: true,
                        ticks: {
                            color: chartMutedColor(),
                            font: chartFont(11),
                            maxTicksLimit: 8,
                            maxRotation: 0,
                            autoSkip: true,
                            padding: 8,
                        },
                        grid: { color: chartGridColor() },
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: {
                            color: chartMutedColor(),
                            font: chartFont(11),
                            padding: 10,
                            precision: 0,
                            maxTicksLimit: 6,
                        },
                        grid: { color: chartGridColor() },
                    },
                },
            }),
        });
        requestAnimationFrame(resizeAllCharts);
    }

    function formatTransitionLabel(from, to) {
        return `${from} → ${to}`;
    }

    function renderAssignee(rows) {
        destroyChart('chartAssignee');
        const ctx = document.getElementById('chartAssignee');
        if (!ctx) return;
        const top = rows.slice(0, 12);
        charts.chartAssignee = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top.map((r) => r.name),
                datasets: [
                    { label: 'Назначено', data: top.map((r) => r.assigned), backgroundColor: COLORS.greenPale },
                    { label: 'Готово', data: top.map((r) => r.done), backgroundColor: COLORS.green },
                    { label: 'Просрочено', data: top.map((r) => r.overdue), backgroundColor: COLORS.urgent },
                ],
            },
            options: defaultChartOptions({
                plugins: { legend: chartLegendBottom() },
                indexAxis: 'y',
                scales: {
                    x: countYScale({ color: chartTextColor() }),
                    y: { ticks: { color: chartTextColor() }, grid: { display: false } },
                },
            }),
        });
    }

    function renderTransitions(rows) {
        destroyChart('chartTransitions');
        const ctx = document.getElementById('chartTransitions');
        if (!ctx) return;
        const labels = rows.map((r) => formatTransitionLabel(r.from, r.to));
        charts.chartTransitions = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                    datasets: [{ label: 'Переходов', data: rows.map((r) => r.count), backgroundColor: COLORS.greenLight, borderRadius: 5 }],
            },
            options: defaultChartOptions({
                plugins: { legend: chartLegendBottom() },
                indexAxis: 'y',
                scales: {
                    x: countYScale({ color: chartTextColor() }),
                    y: { ticks: { color: chartTextColor(), font: chartFont(11) }, grid: { display: false } },
                },
            }),
        });
    }

    function renderRiskBar(projects) {
        destroyChart('chartRiskBar');
        const ctx = document.getElementById('chartRiskBar');
        if (!ctx) return;
        charts.chartRiskBar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: projects.map((p) => p.project),
                datasets: [
                    { label: 'Просрочено', data: projects.map((p) => p.overdue), backgroundColor: COLORS.urgent },
                    { label: 'Срочные', data: projects.map((p) => p.urgent), backgroundColor: COLORS.wip },
                ],
            },
            options: defaultChartOptions({
                plugins: { legend: chartLegendBottom() },
                scales: {
                    x: { ticks: { color: chartTextColor(), maxRotation: 45 }, grid: { color: chartGridColor() } },
                    y: countYScale({ color: chartTextColor() }),
                },
            }),
        });
    }

    function renderCompare(projects) {
        destroyChart('chartCompareDone');
        destroyChart('chartCompareStack');
        const ctxDone = document.getElementById('chartCompareDone');
        const ctxStack = document.getElementById('chartCompareStack');
        if (ctxDone) {
            charts.chartCompareDone = new Chart(ctxDone, {
                type: 'bar',
                data: {
                    labels: projects.map((p) => p.project),
                    datasets: [{
                        label: '% готовности',
                        data: projects.map((p) => p.doneRate),
                        backgroundColor: COLORS.green,
                        borderRadius: 5,
                    }],
                },
                options: defaultChartOptions({
                    plugins: { legend: chartLegendBottom() },
                    scales: {
                        y: { max: 100, ticks: { color: chartTextColor(), callback: (v) => `${v}%` }, grid: { color: chartGridColor() } },
                        x: { ticks: { color: chartTextColor(), maxRotation: 45 }, grid: { color: chartGridColor() } },
                    },
                }),
            });
        }
        if (ctxStack) {
            charts.chartCompareStack = new Chart(ctxStack, {
                type: 'bar',
                data: {
                    labels: projects.map((p) => p.project),
                    datasets: [
                        { label: 'Очередь', data: projects.map((p) => p.queue), backgroundColor: COLORS.queue, stack: 's' },
                        { label: 'В работе', data: projects.map((p) => p.inProgress), backgroundColor: COLORS.wip, stack: 's' },
                        { label: 'Готово', data: projects.map((p) => p.done), backgroundColor: COLORS.done, stack: 's' },
                    ],
                },
                options: defaultChartOptions({
                    plugins: { legend: chartLegendBottom() },
                    scales: {
                        x: { stacked: true, ticks: { color: chartTextColor(), maxRotation: 45 }, grid: { color: chartGridColor() } },
                        y: { stacked: true, ...countYScale({ color: chartTextColor() }) },
                    },
                }),
            });
        }
    }

    function renderReportsTable(rows, summary) {
        const wrap = document.getElementById('analyticsReportsSummary');
        if (wrap) {
            wrap.innerHTML = `
                <div class="analytics-reports-chip">
                    <span class="text-signature">Проектов</span>
                    <span class="text-header">${int(summary.projects)}</span>
                </div>
                <div class="analytics-reports-chip">
                    <span class="text-signature">Задач</span>
                    <span class="text-header">${int(summary.tasks)}</span>
                </div>
                <div class="analytics-reports-chip">
                    <span class="text-signature">Готово</span>
                    <span class="text-header">${int(summary.done)}</span>
                </div>
                <div class="analytics-reports-chip">
                    <span class="text-signature">Просрочено</span>
                    <span class="text-header">${int(summary.overdue)}</span>
                </div>
            `;
        }
        const tbody = document.querySelector('#analyticsProjectsTable tbody');
        if (!tbody) return;
        tbody.innerHTML = rows.map((r) => `
            <tr>
                <td>${escapeHtml(r.project)}</td>
                <td>${int(r.total)}</td>
                <td>${int(r.queue)}</td>
                <td>${int(r.inProgress)}</td>
                <td>${int(r.done)}</td>
                <td>${int(r.urgent)}</td>
                <td>${int(r.overdue)}</td>
                <td>${int(r.doneRate)}%</td>
            </tr>
        `).join('') || '<tr><td colspan="8">Нет данных</td></tr>';
    }

    function renderLeadTime(lt) {
        const el = document.getElementById('analyticsLeadTime');
        if (!el) return;
        el.innerHTML = `
            <div class="analytics-lead-time__item">
                <span class="text-signature">Средний lead time</span>
                <span class="text-header">${int(lt.avgDays)} дней</span>
            </div>
            <div class="analytics-lead-time__item">
                <span class="text-signature">Медиана</span>
                <span class="text-header">${int(lt.medianDays)} дней</span>
            </div>
            <div class="analytics-lead-time__item">
                <span class="text-signature">Выборка</span>
                <span class="text-header">${int(lt.sampleSize)} задач</span>
            </div>
        `;
    }

    function renderRisks(risks) {
        const el = document.getElementById('analyticsRisksList');
        if (!el) return;
        if (!risks.length) {
            el.innerHTML = '<p class="text-signature">Рисков не обнаружено</p>';
            return;
        }
        el.innerHTML = risks.map((r) => `
            <div class="analytics-risk br-5 ${r.riskLevel === 'high' ? 'is-high' : r.riskLevel === 'medium' ? 'is-medium' : ''}">
                <span class="text-header">${escapeHtml(r.project)}</span>
                <span class="text-signature">Просрочено: ${int(r.overdue)} · Срочных: ${int(r.urgent)} · Готовность: ${int(r.doneRate)}%</span>
            </div>
        `).join('');
    }

    function renderWorkload(wl) {
        const el = document.getElementById('analyticsWorkloadMsg');
        if (el) {
            el.className = `text-basic analytics-workload ${wl.balanced ? 'is-ok' : 'is-warn'}`;
            el.textContent = wl.message || '';
        }
    }

    function updateChartCaptions(meta) {
        const period = int(meta.periodDays) || 30;
        const distCount = int(meta.distributionTaskCount);
        const daily = meta.chartGranularity === 'workday';
        const activityWeekly = meta.activityGranularity === 'week';

        const velDesc = document.getElementById('analyticsVelocityDesc');
        if (velDesc) {
            if (daily) {
                velDesc.textContent = `Созданные и завершённые задачи по рабочим дням (без выходных) за ${period} дней`;
            } else if (period > 90) {
                velDesc.textContent = `Созданные и завершённые задачи по неделям (до 12 точек) за ${period} дней`;
            } else if (period > 30) {
                velDesc.textContent = `Созданные и завершённые задачи по неделям (до 10 точек) за ${period} дней`;
            } else {
                velDesc.textContent = `Созданные и завершённые задачи по неделям за ${period} дней`;
            }
        }

        const activityDesc = document.getElementById('analyticsActivityDesc');
        if (activityDesc) {
            if (daily) {
                activityDesc.textContent = `Переходы статусов по рабочим дням (без выходных) за ${period} дней`;
            } else if (activityWeekly) {
                activityDesc.textContent = period > 90
                    ? `Переходы статусов по неделям за ${period} дней`
                    : `Переходы статусов по неделям за ${period} дней`;
            } else {
                activityDesc.textContent = `Переходы статусов по дням за ${period} дней`;
            }
        }

        const stagesDesc = document.getElementById('analyticsStagesDesc');
        if (stagesDesc) {
            stagesDesc.textContent = distCount
                ? `Статусы ${distCount} задач с активностью за ${period} дней`
                : 'Нет задач с активностью за выбранный период.';
        }

        const priorityDesc = document.getElementById('analyticsPriorityDesc');
        if (priorityDesc) {
            priorityDesc.textContent = distCount
                ? `Приоритеты ${distCount} задач за ${period} дней`
                : 'Нет задач с активностью за выбранный период';
        }

        const cfdDesc = document.getElementById('analyticsCfdDesc');
        if (cfdDesc) {
            cfdDesc.textContent = daily
                ? `CFD по рабочим дням (без выходных) за ${period} дней - срез WIP на конец каждого дня`
                : `Динамика объёма работ по стадиям по неделям за ${period} дней`;
        }
    }

    function renderAll(data) {
        dashboardData = data;
        const meta = data.meta || {};
        const kpis = data.kpis || {};
        const executive = data.executive || {};

        const title = document.getElementById('analyticsTeamTitle');
        if (title) title.textContent = `Аналитика - ${meta.teamName || 'команда'}`;
        const sub = document.getElementById('analyticsSubtitle');
        if (sub) {
            const period = int(meta.periodDays) || 30;
            const projects = int(meta.projectCount);
            sub.textContent = `Период ${period} ${pluralDays(period)} · ${projects} ${pluralProjects(projects)}`;
        }

        updateChartCaptions(meta);

        renderKpis(kpis, executive);
        renderHealth(executive, meta);
        const reports = data.reports || {};
        renderReportsTable(reports.rows || data.byProject || [], reports.summary || {});
        renderLeadTime(data.leadTime || {});
        renderRisks(data.topRisks || []);
        renderWorkload(data.workload || {});
    }

    function setTab(tabId) {
        document.querySelectorAll('.analytics-tabs__btn').forEach((btn) => {
            const active = btn.dataset.tab === tabId;
            btn.classList.toggle('is-active', active);
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('.analytics-panel').forEach((panel) => {
            panel.hidden = panel.dataset.panel !== tabId;
        });
        const currentTab = (location.hash || '').replace('#', '') || 'overview';
        const hashPart = tabId === 'overview' ? '' : `#${tabId}`;
        if (currentTab !== tabId) {
            history.replaceState(null, '', `${location.pathname}${location.search}${hashPart}`);
        }
        if (typeof updateActiveMenuItem === 'function') {
            updateActiveMenuItem();
        }
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(resizeAllCharts);
    }

    function chartsAvailable() {
        return typeof window.Chart === 'function';
    }

    function renderCharts(data) {
        if (!chartsAvailable()) return;
        applyChartDefaults();
        return ensureChartFonts().then(() => {
            renderVelocity(data.velocity || { labels: [], created: [], completed: [] });
            renderDonut('chartStages', data.stageDistribution || [], STAGE_PALETTE);
            renderDonut('chartPriority', data.priorityDistribution || [], [COLORS.normal, COLORS.urgent]);
            renderActivity(data.activity || { labels: [], changes: [] });
            renderCfd(data.cumulativeFlow || { labels: [], queue: [], inProgress: [], testing: [], done: [] });
            renderAssignee(data.byAssignee || []);
            renderTransitions(data.transitions || []);
            renderRiskBar(data.byProject || []);
            renderCompare(data.byProject || []);
            requestAnimationFrame(() => requestAnimationFrame(resizeAllCharts));
        });
    }

    function getAnalyticsRoot() {
        return document.getElementById('analyticsPage')
            || document.querySelector('.app-container.analytics-page');
    }

    async function fetchDashboard(period) {
        const loading = document.getElementById('analyticsLoading');
        const errEl = document.getElementById('analyticsError');
        const content = document.getElementById('analyticsContent');
        const url = `${typeof apiUrl === 'function' ? apiUrl('/analytics/dashboard') : '/api/analytics/dashboard'}?period=${encodeURIComponent(period)}`;

        if (loading) loading.hidden = false;
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = '';
        }
        if (content) content.hidden = true;

        try {
            const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
            const contentType = res.headers.get('content-type') || '';
            let data = {};
            if (contentType.includes('application/json')) {
                data = await res.json();
            } else {
                const text = await res.text();
                console.error('Analytics API non-JSON response', res.status, text.slice(0, 300));
                throw new Error(
                    res.status === 404
                        ? 'Сервис аналитики не найден. Перезапустите приложение (mvn spring-boot:run).'
                        : `Сервер вернул ответ ${res.status}. Проверьте консоль браузера.`
                );
            }
            if (!res.ok || data.ok === false) {
                throw new Error(data.message || data.detail || `Не удалось загрузить аналитику (${res.status})`);
            }
            if (content) content.hidden = false;
            try {
                renderAll(data);
                renderCharts(data);
                if (!chartsAvailable()) {
                    const warn = document.getElementById('analyticsChartWarn');
                    if (warn) warn.hidden = false;
                }
            } catch (renderErr) {
                console.error('Analytics render error', renderErr);
                throw new Error('Данные получены, но не удалось отрисовать отчёт: ' + (renderErr.message || renderErr));
            }
        } catch (e) {
            console.error('Analytics fetch error', e);
            if (errEl) {
                errEl.hidden = false;
                errEl.textContent = e.message || 'Ошибка загрузки';
            }
        } finally {
            if (loading) loading.hidden = true;
        }
    }

    function initTabs() {
        const root = getAnalyticsRoot();
        if (!root) return;
        if (root.dataset.tabsBound !== '1') {
            root.dataset.tabsBound = '1';
            root.addEventListener('click', (e) => {
                const btn = e.target.closest('.analytics-tabs__btn[data-tab]');
                if (btn && root.contains(btn)) setTab(btn.dataset.tab);
            });
        }
        const hash = (location.hash || '').replace('#', '');
        if (hash && document.querySelector(`.analytics-tabs__btn[data-tab="${hash}"]`)) {
            setTab(hash);
        } else {
            setTab('overview');
        }
    }

    function bindControls() {
        const root = getAnalyticsRoot();
        if (!root || root.dataset.controlsBound === '1') return;
        root.dataset.controlsBound = '1';

        const period = document.getElementById('analyticsPeriod');
        const refresh = document.getElementById('analyticsRefreshBtn');
        const printBtn = document.getElementById('analyticsPrintBtn');
        const load = () => fetchDashboard(period?.value || 30);
        refresh?.addEventListener('click', load);
        period?.addEventListener('change', load);
        printBtn?.addEventListener('click', () => window.print());
        const themeBtn = document.getElementById('themeToggle');
        themeBtn?.addEventListener('click', () => {
            window.setTimeout(() => {
                if (dashboardData) {
                    applyChartDefaults();
                    renderCharts(dashboardData);
                }
            }, 80);
        });
    }

    let analyticsResizeBound = false;

    window.initAnalyticsPage = function initAnalyticsPage() {
        const root = getAnalyticsRoot();
        if (!root) return;
        Object.keys(charts).forEach((id) => destroyChart(id));
        dashboardData = null;
        initTabs();
        bindControls();
        if (!analyticsResizeBound) {
            analyticsResizeBound = true;
            window.addEventListener('resize', () => requestAnimationFrame(resizeAllCharts));
        }
        if (typeof window.Chart !== 'function') {
            const errEl = document.getElementById('analyticsError');
            const loading = document.getElementById('analyticsLoading');
            if (loading) loading.hidden = true;
            if (errEl) {
                errEl.hidden = false;
                errEl.textContent = 'Библиотека графиков не загружена. Обновите страницу.';
            }
            return;
        }
        fetchDashboard(document.getElementById('analyticsPeriod')?.value || 30);
        if (typeof window.initAllTpSelects === 'function') {
            window.initAllTpSelects(root);
        }
    };

    function bootAnalyticsPage() {
        if (getAnalyticsRoot()) {
            window.initAnalyticsPage();
        }
    }

    if (typeof Chart !== 'undefined') {
        registerOutwardTooltip();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootAnalyticsPage);
    } else {
        bootAnalyticsPage();
    }
})();
