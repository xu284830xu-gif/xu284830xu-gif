/* =========================================================
   花间集 · 页面视图
   ========================================================= */
'use strict';

const VIEW_META = {
  dashboard: { kicker: '经营总览', title: '今天，花事如何？' },
  inventory: { kicker: '库存管理', title: '每一枝花，都有数' },
  sales: { kicker: '快速开单', title: '把花，交给对的人' },
  records: { kicker: '销售记录', title: '每一笔，都记得' },
  finance: { kicker: '盈利分析', title: '看见花开的回报' },
  pricing: { kicker: '价格行情', title: '定价，也是一门花艺' }
};

function renderView(view) {
  switch (view) {
    case 'inventory': return renderInventoryView();
    case 'sales': return renderSalesView();
    case 'records': return renderRecordsView();
    case 'finance': return renderFinanceView();
    case 'pricing': return renderPricingView();
    case 'dashboard':
    default: return renderDashboardView();
  }
}

/* ---------------- 通用组件 ---------------- */
function pageHeadHTML({ eyebrow, title, description, actions = '' }) {
  return `<div class="page-head">
    <div class="page-head-copy">
      <div class="eyebrow">${escapeHTML(eyebrow)}</div>
      <h1>${escapeHTML(title)}</h1>
      <p>${description}</p>
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;
}

function emptyStateHTML({ title, description, action = '', iconName = 'flower' }) {
  return `<div class="empty-state">
    <div class="empty-illustration">${icon(iconName, 46)}</div>
    <h3>${escapeHTML(title)}</h3>
    <p>${escapeHTML(description)}</p>
    ${action}
  </div>`;
}

function trendChipHTML(current, previous) {
  if (previous === null || previous === undefined) {
    return `<span class="trend">— 上月暂无对比</span>`;
  }
  const diff = percentDelta(current, previous);
  if (diff === null) return `<span class="trend">— 上月暂无对比</span>`;
  const down = diff < 0;
  return `<span class="trend ${down ? 'is-down' : ''}">${icon(down ? 'trend-down' : 'trend-up', 11)} ${(Math.abs(diff) * 100).toFixed(1)}%</span><span>较上月</span>`;
}

function metricCardHTML({ label, iconName, value, footer, accent = false }) {
  return `<article class="metric-card ${accent ? 'is-accent' : ''}">
    <div class="metric-top">
      <span class="metric-label">${escapeHTML(label)}</span>
      <span class="metric-icon">${icon(iconName, 15)}</span>
    </div>
    <div class="metric-value">${value}</div>
    <div class="metric-foot">${footer}</div>
  </article>`;
}

function badgeForStock(flower) {
  const s = stockStatus(flower);
  return `<span class="badge ${s.badge}">${s.label}</span>`;
}

function segmentedHTML(options, active, action) {
  return `<div class="segmented" role="group" aria-label="时间范围">
    ${options.map((opt) => `<button class="seg-btn ${String(active) === String(opt.value) ? 'is-active' : ''}" data-action="${action}" data-value="${opt.value}">${escapeHTML(opt.label)}</button>`).join('')}
  </div>`;
}

/* ---------------- 图表 ---------------- */
function niceMax(value) {
  const n = Number(value) || 0;
  if (n <= 0) return 100;
  const exponent = Math.floor(Math.log10(n));
  const fraction = n / (10 ** exponent);
  let nice;
  if (fraction <= 1) nice = 1;
  else if (fraction <= 2) nice = 2;
  else if (fraction <= 2.5) nice = 2.5;
  else if (fraction <= 5) nice = 5;
  else nice = 10;
  return nice * (10 ** exponent);
}

function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

function buildLineChart(series, { height = 252, showProfit = true } = {}) {
  const width = 760;
  const pad = { top: 18, right: 16, bottom: 30, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxValue = Math.max(100, ...series.map((s) => s.revenue), ...series.map((s) => s.profit));
  const yMax = niceMax(maxValue * 1.16);
  const xFor = (i) => pad.left + (series.length <= 1 ? innerW / 2 : (innerW * i) / (series.length - 1));
  const yFor = (v) => pad.top + innerH - (clamp(v, 0, yMax) / yMax) * innerH;
  const pointsRevenue = series.map((s, i) => ({ x: xFor(i), y: yFor(s.revenue), data: s }));
  const pointsProfit = series.map((s, i) => ({ x: xFor(i), y: yFor(s.profit), data: s }));

  let grid = '';
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (innerH * i) / 4;
    const value = yMax * (1 - i / 4);
    grid += `<line class="grid-line" x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}"/>`;
    grid += `<text class="axis-label" x="${pad.left - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${moneyCompact(value)}</text>`;
  }

  const labelIndexes = new Set();
  if (series.length <= 7) {
    series.forEach((_, i) => labelIndexes.add(i));
  } else {
    [0, Math.round((series.length - 1) / 3), Math.round(((series.length - 1) * 2) / 3), series.length - 1].forEach((i) => labelIndexes.add(i));
  }
  let xLabels = '';
  labelIndexes.forEach((i) => {
    const s = series[i];
    if (!s) return;
    xLabels += `<text class="axis-label" x="${xFor(i)}" y="${height - 8}" text-anchor="middle">${s.label}</text>`;
  });

  const revenuePath = smoothPath(pointsRevenue);
  const profitPath = smoothPath(pointsProfit);
  const areaPath = `${revenuePath} L${pointsRevenue[pointsRevenue.length - 1]?.x || pad.left},${pad.top + innerH} L${pointsRevenue[0]?.x || pad.left},${pad.top + innerH} Z`;

  let dots = '';
  pointsRevenue.forEach((p, i) => {
    const show = series.length <= 7 || i === 0 || i === series.length - 1 || i % 5 === 0;
    if (!show) return;
    dots += `<circle class="point" cx="${p.x}" cy="${p.y}" r="3.1" fill="#1f5848"><title>${escapeHTML(p.data.key)} · 营收 ${money(p.data.revenue)} · 毛利 ${money(p.data.profit)}</title></circle>`;
  });

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="营收与毛利趋势图">
    <defs>
      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5d8e74" stop-opacity=".2"/>
        <stop offset="72%" stop-color="#8daf9c" stop-opacity=".055"/>
        <stop offset="100%" stop-color="#fffdf8" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    ${xLabels}
    <path d="${areaPath}" fill="url(#revenueFill)"/>
    <path d="${revenuePath}" fill="none" stroke="#1f5848" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    ${showProfit ? `<path d="${profitPath}" fill="none" stroke="#a7c0ac" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 0"/>` : ''}
    ${dots}
    <circle cx="${pointsRevenue[pointsRevenue.length - 1]?.x}" cy="${pointsRevenue[pointsRevenue.length - 1]?.y}" r="5.2" fill="#1f5848" opacity=".12"/>
    <circle cx="${pointsRevenue[pointsRevenue.length - 1]?.x}" cy="${pointsRevenue[pointsRevenue.length - 1]?.y}" r="3.2" fill="#fffdf8" stroke="#1f5848" stroke-width="2"/>
  </svg>`;
}

function buildPriceChart(flower) {
  if (!flower) return '';
  const width = 760;
  const height = 238;
  const pad = { top: 18, right: 18, bottom: 31, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const history = state.priceHistory
    .filter((p) => p.flowerId === flower.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const startDate = toDate(flower.createdAt || new Date());
  const points = [];

  const baselinePrice = history.length ? history[0].oldPrice : flower.price;
  const baselineCost = history.length ? history[0].oldCost : flower.cost;
  points.push({ date: startDate, price: baselinePrice, cost: baselineCost });

  history.forEach((event) => {
    points.push({ date: toDate(event.date), price: event.newPrice, cost: event.newCost });
  });
  const last = points[points.length - 1];
  if (!last || last.date.getTime() < Date.now() - 3600000) {
    points.push({ date: new Date(), price: flower.price, cost: flower.cost });
  }

  const minTime = Math.min(...points.map((p) => p.date.getTime()));
  const maxTime = Math.max(...points.map((p) => p.date.getTime()), minTime + 86400000);
  const maxValue = Math.max(10, ...points.map((p) => p.price), ...points.map((p) => p.cost));
  const minValue = Math.min(...points.map((p) => p.price), ...points.map((p) => p.cost));
  const yMin = Math.max(0, Math.floor((minValue * 0.78) / 5) * 5);
  const yMax = Math.max(niceMax(maxValue * 1.08), yMin + 5);
  const xFor = (date) => pad.left + ((date.getTime() - minTime) / Math.max(1, maxTime - minTime)) * innerW;
  const yFor = (v) => pad.top + innerH - ((clamp(v, yMin, yMax) - yMin) / Math.max(1, yMax - yMin)) * innerH;
  const pricePoints = points.map((p) => ({ x: xFor(p.date), y: yFor(p.price), data: p }));
  const costPoints = points.map((p) => ({ x: xFor(p.date), y: yFor(p.cost), data: p }));

  let grid = '';
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (innerH * i) / 4;
    const value = yMax - ((yMax - yMin) * i) / 4;
    const labelValue = value >= 1000
      ? `¥${(value / 1000).toFixed(1)}k`
      : `¥${Number.isInteger(Math.round(value * 10) / 10) ? Math.round(value) : value.toFixed(1)}`;
    grid += `<line class="grid-line" x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}"/>`;
    grid += `<text class="axis-label" x="${pad.left - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${labelValue}</text>`;
  }

  const midTime = minTime + (maxTime - minTime) / 2;
  const xLabelDates = [new Date(minTime), new Date(midTime), new Date(maxTime)];
  const xLabels = xLabelDates.map((date, i) => `<text class="axis-label" x="${xFor(date)}" y="${height - 8}" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}">${formatDate(date, 'short')}</text>`).join('');

  const pricePath = smoothPath(pricePoints);
  const costPath = smoothPath(costPoints);
  const areaPath = `${pricePath} L${pricePoints[pricePoints.length - 1]?.x || pad.left},${pad.top + innerH} L${pricePoints[0]?.x || pad.left},${pad.top + innerH} Z`;

  const dots = pricePoints.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#1f5848" stroke="#fffdf8" stroke-width="2"><title>${formatDate(p.data.date, 'dot')} · 售价 ${money(p.data.price)} · 成本 ${money(p.data.cost)}</title></circle>`).join('');

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="售价与成本走势图">
    <defs>
      <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4f8068" stop-opacity=".17"/>
        <stop offset="100%" stop-color="#fffdf8" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    ${xLabels}
    <path d="${areaPath}" fill="url(#priceFill)"/>
    <path d="${pricePath}" fill="none" stroke="#1f5848" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${costPath}" fill="none" stroke="#c49a5a" stroke-width="1.7" stroke-dasharray="5 5" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}

function donutGradient(items, total) {
  if (!total) return 'conic-gradient(#e8e5db 0deg 360deg)';
  let cursor = 0;
  const parts = items.map((item, i) => {
    const start = cursor;
    cursor += (item.value / total) * 360;
    return `${CATEGORY_COLORS[i % CATEGORY_COLORS.length]} ${start.toFixed(2)}deg ${cursor.toFixed(2)}deg`;
  });
  if (cursor < 359.99) parts.push(`#e8e5db ${cursor.toFixed(2)}deg 360deg`);
  return `conic-gradient(${parts.join(', ')})`;
}

function collapseCategories(items, limit = 5) {
  if (items.length <= limit) return items;
  const head = items.slice(0, limit - 1);
  const rest = round2(items.slice(limit - 1).reduce((sum, item) => sum + item.value, 0));
  return [...head, { name: '其他', value: rest }];
}

/* ---------------- 经营总览 ---------------- */
function buildDashboardAlerts() {
  const list = activeFlowers();
  const low = list.filter((f) => f.stock <= f.minStock);
  const slow = list.filter((f) => f.stock > 0 && shelfDays(f) >= 7);
  const thin = list.filter((f) => f.price > 0 && grossMargin(f.price, f.cost) < 0.22);
  const alerts = [];
  if (low.length) {
    alerts.push({
      tone: 'red',
      iconName: 'alert',
      title: `${low.length} 种花低于安全库存`,
      desc: `${low.slice(0, 2).map((f) => f.name).join('、')}${low.length > 2 ? '等' : ''} · 建议及时补货`,
      action: 'goto-inventory',
      filter: 'low'
    });
  }
  if (slow.length) {
    alerts.push({
      tone: 'gold',
      iconName: 'clock',
      title: `${slow.length} 种花需要关注库龄`,
      desc: `${slow.slice(0, 2).map((f) => f.name).join('、')}${slow.length > 2 ? '等' : ''} · 到店已超过 7 天`,
      action: 'goto-inventory',
      filter: 'slow'
    });
  }
  if (thin.length) {
    alerts.push({
      tone: 'blue',
      iconName: 'tag',
      title: `${thin.length} 种花毛利偏薄`,
      desc: `${thin.slice(0, 2).map((f) => f.name).join('、')} · 建议检查定价或成本`,
      action: 'nav',
      view: 'pricing'
    });
  }
  if (!alerts.length) {
    alerts.push({
      tone: 'green',
      iconName: 'check-circle',
      title: '库存与毛利状态健康',
      desc: '暂无需处理的经营提醒，保持这个节奏。',
      action: 'goto-inventory',
      filter: 'all'
    });
  }
  return alerts;
}

function renderDashboardView() {
  const now = new Date();
  const month = monthOrders(0);
  const prevMonth = monthOrders(-1);
  const monthSummary = summarizeOrders(month);
  const prevSummary = summarizeOrders(prevMonth);
  const inventory = inventorySummary();
  const today = summarizeOrders(todayOrders());
  const replenish = replenishmentList(1);
  const monthMargin = monthSummary.revenue > 0 ? monthSummary.profit / monthSummary.revenue : 0;
  const alerts = buildDashboardAlerts();
  const chartRange = ui.chartRange === 30 ? 30 : 7;
  const series = salesSeries(chartRange);
  const rangeSummary = summarizeOrders(ordersInRange(String(chartRange)));
  const categoryItems = collapseCategories(inventoryByCategory(), 5);
  const categoryTotal = categoryItems.reduce((sum, item) => sum + item.value, 0);

  const briefText = today.count
    ? `今天已完成 <b>${today.count}</b> 笔订单，实收 <b>${money(today.revenue)}</b>。${inventory.lowCount ? `有 <b>${inventory.lowCount}</b> 种花低于安全库存。` : '库存水位平稳。'}`
    : `今天还没有开单。${replenish.length ? `「${escapeHTML(replenish[0].flower.name)}」按近期销量建议补 ${replenish[0].plan.suggested} ${escapeHTML(replenish[0].flower.unit)}。` : '可以先整理花材、更新今日售价。'}`;

  const alertHTML = alerts.map((alert) => `
    <button class="alert-row" data-action="${alert.action}" ${alert.filter ? `data-filter="${alert.filter}"` : ''} ${alert.view ? `data-view="${alert.view}"` : ''}>
      <span class="alert-symbol tone-${alert.tone}">${icon(alert.iconName, 15)}</span>
      <span class="alert-copy">
        <span class="alert-title">${escapeHTML(alert.title)}</span>
        <span class="alert-desc">${escapeHTML(alert.desc)}</span>
      </span>
      <span class="alert-arrow">${icon('chevron-right', 13)}</span>
    </button>`).join('');

  const stockRows = [...activeFlowers()]
    .sort((a, b) => stockPercent(a) - stockPercent(b))
    .slice(0, 5)
    .map((flower) => {
      const status = stockStatus(flower);
      const fresh = freshness(flower);
      return `<button class="stock-row" data-action="view-flower" data-id="${flower.id}">
        <span class="stock-flower">
          ${flowerAvatar(flower)}
          <span class="stock-copy">
            <span class="stock-name">${escapeHTML(flower.name)}</span>
            <span class="stock-sub">${escapeHTML(flower.category)} · ${escapeHTML(flower.variety || flower.color || '常规品种')}</span>
          </span>
        </span>
        <span class="stock-qty">
          <strong>${number(flower.stock)} <small>${escapeHTML(flower.unit)}</small></strong>
          <small>安全库存 ${number(flower.minStock)}</small>
        </span>
        <span class="stock-bar-wrap">
          <span class="stock-bar"><i class="${status.bar}" style="width:${stockPercent(flower)}%"></i></span>
          <small>${fresh.label} · ${fresh.days} 天</small>
        </span>
        <span class="stock-value">
          <strong>${money(flower.stock * flower.cost)}</strong>
          <small>库存成本</small>
        </span>
      </button>`;
    }).join('');

  const categoryLegend = categoryItems.map((item, i) => `
    <div class="category-item">
      <span class="category-dot" style="background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"></span>
      <span class="category-name">${escapeHTML(item.name)}</span>
      <span class="category-share">${categoryTotal ? Math.round((item.value / categoryTotal) * 100) : 0}%</span>
    </div>`).join('');

  return `
    <div class="dashboard-head">
      <div class="page-head">
        <div class="page-head-copy">
          <div class="eyebrow">DAILY OVERVIEW · ${formatDate(now, 'dot')}</div>
          <h1>${greeting()}，${escapeHTML(state.settings.owner || '花掌柜')}</h1>
          <p>${escapeHTML(state.settings.shopName)}的今日花事与经营数据，都在这里。</p>
        </div>
      </div>
      <div class="dashboard-ornament">
        <span class="ornament-line"></span>
        <span>把日子过成一束花</span>
        <span class="ornament-flower">${icon('flower', 17)}</span>
      </div>
    </div>

    <section class="brief-card" aria-label="今日经营简报">
      <div class="brief-copy">
        <span class="brief-icon">${icon('sparkles', 19)}</span>
        <div>
          <strong>今日经营简报</strong>
          <p>${briefText}</p>
        </div>
      </div>
      <div class="brief-actions">
        <button class="brief-link" data-action="nav" data-view="sales">${icon('cart', 13)} 去开单</button>
        <button class="brief-link" data-action="goto-inventory" data-filter="${inventory.lowCount ? 'low' : 'all'}">${icon('box', 13)} 补货建议 ${icon('arrow-right', 13)}</button>
      </div>
    </section>

    <div class="metric-grid">
      ${metricCardHTML({
        label: '本月营业额',
        iconName: 'wallet',
        accent: true,
        value: `<span class="currency">¥</span>${money(monthSummary.revenue, false)}`,
        footer: `${trendChipHTML(monthSummary.revenue, prevSummary.revenue)}<span>· 今日 ${money(today.revenue)}</span>`
      })}
      ${metricCardHTML({
        label: '本月毛利',
        iconName: 'trend-up',
        value: `<span class="currency">¥</span>${money(monthSummary.profit, false)}`,
        footer: `<span class="trend">${percent(monthMargin, 1)}</span><span>毛利率 · ${month.length} 笔订单</span>`
      })}
      ${metricCardHTML({
        label: '库存成本',
        iconName: 'box',
        value: `<span class="currency">¥</span>${money(inventory.costValue, false)}`,
        footer: `<span>预计可售 ${money(inventory.retailValue)}</span><span>· ${inventory.sku} 种花</span>`
      })}
      ${metricCardHTML({
        label: '在库数量',
        iconName: 'flower',
        value: `${number(inventory.units)}<span class="currency" style="margin-left:4px;font-size:.38em;vertical-align:6px">件</span>`,
        footer: `<span>${inventory.categories} 个品类</span><span>· 低库存 ${inventory.lowCount} 种</span>`
      })}
    </div>

    <div class="dashboard-grid">
      <section class="card chart-card">
        <div class="section-head">
          <div>
            <h2>营收与毛利走势</h2>
            <p>按自然日汇总已完成订单，退款订单不计入</p>
          </div>
          <div class="chart-toolbar">
            ${segmentedHTML([{ label: '近 7 天', value: 7 }, { label: '近 30 天', value: 30 }], chartRange, 'set-chart-range')}
          </div>
        </div>
        <div class="chart-summary">
          <span class="chart-total"><span class="currency">¥</span>${money(rangeSummary.revenue, false)}</span>
          <span class="chart-compare"><span class="trend">${percent(rangeSummary.revenue ? rangeSummary.profit / rangeSummary.revenue : 0, 1)}</span> 毛利率 · 区间实收</span>
        </div>
        <div class="chart-legend">
          <span class="legend-item"><i class="legend-swatch"></i>营业额</span>
          <span class="legend-item"><i class="legend-swatch is-soft"></i>毛利</span>
          <span class="legend-item"><i class="legend-swatch is-dash"></i>提示：悬停数据点查看明细</span>
        </div>
        <div class="chart-shell">${buildLineChart(series)}</div>
      </section>

      <section class="card reminder-card">
        <div class="section-head">
          <div>
            <h2>经营提醒</h2>
            <p>需要你留意的几件小事</p>
          </div>
          <span class="reminder-count">${alerts.length}</span>
        </div>
        <div class="alert-list">${alertHTML}</div>
        ${replenish.length ? `<div class="reminder-suggestion">
          <span class="reminder-suggestion-icon">${icon('sparkles', 15)}</span>
          <div class="reminder-suggestion-copy">
            <span>补货建议 · 近 7 日销量估算</span>
            <strong>${escapeHTML(replenish[0].flower.name)} 建议补 ${number(replenish[0].plan.suggested)} ${escapeHTML(replenish[0].flower.unit)}</strong>
          </div>
          <button class="reminder-suggestion-btn" data-action="adjust-stock" data-id="${replenish[0].flower.id}">去补货 ${icon('arrow-right', 12)}</button>
        </div>` : `<div class="reminder-quote">
          <span>“</span>
          <p>花材周转快一天，损耗就少一分。</p>
          <small>今日经营小笺</small>
        </div>`}
        <div class="reminder-footer">
          <button class="section-link" data-action="goto-inventory" data-filter="all">查看全部库存 ${icon('arrow-right', 13)}</button>
        </div>
      </section>
    </div>

    <div class="dashboard-grid equal">
      <section class="card stock-card">
        <div class="section-head">
          <div>
            <h2>库存快照</h2>
            <p>按库存水位优先展示，先看最需要补的花</p>
          </div>
          <button class="section-link" data-action="nav" data-view="inventory">管理库存 ${icon('arrow-right', 13)}</button>
        </div>
        <div class="stock-list">
          ${stockRows || emptyStateHTML({ title: '还没有花卉', description: '新增第一种花，开始记录库存。', action: '<button class="btn btn-primary btn-sm" data-action="open-add-flower">新增花卉</button>' })}
        </div>
      </section>

      <section class="card category-card">
        <div class="section-head">
          <div>
            <h2>品类库存占比</h2>
            <p>按库存成本计算，了解资金压在哪里</p>
          </div>
        </div>
        <div class="donut-wrap">
          <div class="donut" style="background:${donutGradient(categoryItems, categoryTotal)}">
            <div class="donut-center">
              <span>库存成本</span>
              <strong>${moneyCompact(categoryTotal)}</strong>
            </div>
          </div>
          <div class="category-legend">${categoryLegend || '<span class="muted" style="font-size:10px">暂无库存</span>'}</div>
        </div>
        <div class="category-total">
          <span>共 ${inventory.sku} 种花 · ${inventory.categories} 个品类</span>
          <strong>${money(inventory.costValue)}</strong>
        </div>
      </section>
    </div>`;
}

/* ---------------- 库存管理 ---------------- */
function filteredFlowers() {
  let list = activeFlowers();
  const search = ui.invSearch.trim().toLowerCase();
  if (search) {
    list = list.filter((f) => [f.name, f.variety, f.category, f.color, f.supplier, f.location, f.note]
      .join(' ').toLowerCase().includes(search));
  }
  if (ui.invCategory !== 'all') list = list.filter((f) => f.category === ui.invCategory);
  if (ui.invStatus === 'low') list = list.filter((f) => f.stock <= f.minStock);
  else if (ui.invStatus === 'healthy') list = list.filter((f) => f.stock > f.minStock);
  else if (ui.invStatus === 'slow') list = list.filter((f) => f.stock > 0 && shelfDays(f) >= 7);
  else if (ui.invStatus === 'empty') list = list.filter((f) => f.stock <= 0);

  switch (ui.invSort) {
    case 'stockAsc': list.sort((a, b) => a.stock - b.stock); break;
    case 'stockDesc': list.sort((a, b) => b.stock - a.stock); break;
    case 'priceDesc': list.sort((a, b) => b.price - a.price); break;
    case 'marginAsc': list.sort((a, b) => grossMargin(a.price, a.cost) - grossMargin(b.price, b.cost)); break;
    case 'newest': list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
    case 'name': list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')); break;
    default: list.sort((a, b) => stockPercent(a) - stockPercent(b));
  }
  return list;
}

function inventoryTableInner() {
  const list = filteredFlowers();
  if (!list.length) {
    return emptyStateHTML({
      title: '没有找到匹配的花卉',
      description: '换个关键词或筛选条件试试，也可以新增一种花。',
      action: '<button class="btn btn-primary btn-sm" data-action="open-add-flower">新增花卉</button>'
    });
  }
  const rows = list.map((flower) => {
    const status = stockStatus(flower);
    const fresh = freshness(flower);
    const margin = marginState(flower.price, flower.cost);
    return `<tr>
      <td>
        <div class="flower-cell">
          ${flowerAvatar(flower)}
          <div class="flower-cell-copy">
            <button class="flower-name" data-action="view-flower" data-id="${flower.id}" title="查看 ${escapeHTML(flower.name)} 档案">${escapeHTML(flower.name)}</button>
            <span class="flower-meta">${escapeHTML(flower.category)} · ${escapeHTML(flower.variety || flower.color || '常规')} · ${escapeHTML(flower.grade)} 级</span>
          </div>
        </div>
      </td>
      <td>
        <div class="stock-cell">
          <div class="stock-cell-top"><strong>${number(flower.stock)}</strong><span>${escapeHTML(flower.unit)}</span></div>
          <div class="stock-bar"><i class="${status.bar}" style="width:${stockPercent(flower)}%"></i></div>
          <span class="stock-min">安全库存 ${number(flower.minStock)} ${escapeHTML(flower.unit)}</span>
        </div>
      </td>
      <td class="price-cell">
        <strong>${money(flower.price)}</strong>
        <span>成本 ${money(flower.cost)}</span>
      </td>
      <td>
        <span class="margin-text ${margin.tone}">${percent(margin.margin, 0)}</span>
        <span class="flower-meta">${margin.label}</span>
      </td>
      <td class="age-cell">
        <span class="age-main"><i class="age-dot ${fresh.tone === 'bad' ? 'bad' : fresh.tone === 'warn' ? 'warn' : ''}"></i>${fresh.days} 天</span>
        <span class="age-sub">${fresh.label}</span>
      </td>
      <td class="status-cell">${badgeForStock(flower)}</td>
      <td>
        <div class="row-actions">
          <button class="table-btn" data-action="quick-sale" data-id="${flower.id}" title="加入开单" aria-label="加入开单">${icon('cart', 14)}</button>
          <button class="table-btn" data-action="adjust-stock" data-id="${flower.id}" title="调整库存" aria-label="调整库存">${icon('sliders', 14)}</button>
          <button class="table-btn" data-action="change-price" data-id="${flower.id}" title="调整售价" aria-label="调整售价">${icon('tag', 14)}</button>
          <button class="table-btn" data-action="view-flower" data-id="${flower.id}" title="查看档案" aria-label="查看档案">${icon('more', 14)}</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const mobileCards = list.map((flower) => {
    const status = stockStatus(flower);
    const fresh = freshness(flower);
    const margin = marginState(flower.price, flower.cost);
    return `<article class="mobile-flower-card">
      <div class="mfc-head">
        ${flowerAvatar(flower)}
        <div class="mfc-title">
          <button class="mfc-name" data-action="view-flower" data-id="${flower.id}">${escapeHTML(flower.name)}</button>
          <span class="flower-meta">${escapeHTML(flower.category)} · ${escapeHTML(flower.variety || flower.color || '常规')} · ${escapeHTML(flower.grade)} 级</span>
        </div>
        ${badgeForStock(flower)}
      </div>
      <div class="mfc-stats">
        <div class="mfc-stat"><span>剩余</span><strong>${number(flower.stock)}<small>${escapeHTML(flower.unit)}</small></strong></div>
        <div class="mfc-stat"><span>售价</span><strong>${money(flower.price)}</strong><small>成本 ${money(flower.cost)}</small></div>
        <div class="mfc-stat"><span>毛利率</span><strong class="margin-text ${margin.tone}">${percent(margin.margin, 0)}</strong><small>${margin.label}</small></div>
      </div>
      <div class="mfc-stock">
        <span class="stock-bar"><i class="${status.bar}" style="width:${stockPercent(flower)}%"></i></span>
        <span>安全库存 ${number(flower.minStock)} · 库龄 ${fresh.days} 天 · ${fresh.label}</span>
      </div>
      <div class="mfc-actions">
        <button class="mfc-action is-primary" data-action="quick-sale" data-id="${flower.id}">${icon('cart', 13)} 开单</button>
        <button class="mfc-action" data-action="adjust-stock" data-id="${flower.id}">${icon('box', 13)} 补货</button>
        <button class="mfc-action" data-action="change-price" data-id="${flower.id}">${icon('tag', 13)} 调价</button>
        <button class="mfc-action" data-action="view-flower" data-id="${flower.id}">${icon('more', 13)} 详情</button>
      </div>
    </article>`;
  }).join('');

  return `<div class="mobile-flower-list mobile-only">${mobileCards}</div>
  <div class="table-wrap desktop-table-only">
    <table class="data-table">
      <thead><tr>
        <th>花卉</th><th>剩余数量</th><th>单价 / 成本</th><th>毛利率</th><th>库龄</th><th>库存状态</th><th style="text-align:right">操作</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderInventoryView() {
  const summary = inventorySummary();
  const all = activeFlowers();
  const categories = Array.from(new Set([...CATEGORIES, ...all.map((f) => f.category)]));
  const suggestions = replenishmentList(3);
  const filtersActive = ui.invSearch || ui.invCategory !== 'all' || ui.invStatus !== 'all';

  const suggestionHTML = suggestions.length ? `<section class="restock-panel">
    <div class="restock-head">
      <h3>${icon('sparkles', 16)} 智能补货建议</h3>
      <span>结合近 7 日销量与安全库存估算</span>
    </div>
    <div class="restock-list">
      ${suggestions.map(({ flower, plan }) => `<button class="restock-item" data-action="adjust-stock" data-id="${flower.id}">
        ${flowerAvatar(flower)}
        <span class="restock-copy">
          <strong>${escapeHTML(flower.name)}</strong>
          <small>在库 ${number(flower.stock)} · 近 7 日售 ${number(plan.sold)}</small>
        </span>
        <span class="restock-badge">补 ${number(plan.suggested)} ${escapeHTML(flower.unit)}</span>
      </button>`).join('')}
    </div>
  </section>` : '';

  return `
    ${pageHeadHTML({
      eyebrow: 'INVENTORY · 库存与花材',
      title: VIEW_META.inventory.title,
      description: `当前共 ${summary.sku} 种花卉、${number(summary.units)} 件在库。低库存会标黄，库龄超过 7 天会提醒你优先处理。`,
      actions: `<button class="btn btn-ghost" data-action="export-inventory-csv">${icon('download', 16)} 导出库存</button>
        <button class="btn btn-primary" data-action="open-add-flower">${icon('plus', 16)} 新增花卉</button>`
    })}

    <div class="inventory-stats">
      <div class="inv-stat">
        <span class="inv-stat-icon">${icon('box', 15)}</span>
        <span class="inv-stat-copy"><span>库存成本</span><strong>${money(summary.costValue)} <small>预计可售 ${money(summary.retailValue)}</small></strong></span>
      </div>
      <div class="inv-stat">
        <span class="inv-stat-icon is-gold">${icon('alert', 15)}</span>
        <span class="inv-stat-copy"><span>低于安全库存</span><strong>${summary.lowCount} <small>种 · 缺货 ${summary.emptyCount} 种</small></strong></span>
      </div>
      <div class="inv-stat">
        <span class="inv-stat-icon is-red">${icon('clock', 15)}</span>
        <span class="inv-stat-copy"><span>库龄超过 7 天</span><strong>${summary.slowCount} <small>种 · 建议优先处理</small></strong></span>
      </div>
    </div>

    ${suggestionHTML}

    <div class="filter-bar">
      <div class="search-box">
        ${icon('search', 15)}
        <input id="invSearch" type="search" value="${escapeHTML(ui.invSearch)}" placeholder="搜索花名、品种、供应商、位置..." autocomplete="off" aria-label="搜索库存">
        <button class="search-clear" data-action="clear-search" data-target="inventory" aria-label="清空搜索" ${ui.invSearch ? '' : 'hidden'}>${icon('x', 12)}</button>
      </div>
      <select class="select" id="invCategory" aria-label="筛选品类">
        <option value="all">全部品类</option>
        ${categories.map((cat) => `<option value="${escapeHTML(cat)}" ${ui.invCategory === cat ? 'selected' : ''}>${escapeHTML(cat)}</option>`).join('')}
      </select>
      <select class="select" id="invStatus" aria-label="筛选库存状态">
        <option value="all" ${ui.invStatus === 'all' ? 'selected' : ''}>全部状态</option>
        <option value="low" ${ui.invStatus === 'low' ? 'selected' : ''}>低库存 / 缺货</option>
        <option value="healthy" ${ui.invStatus === 'healthy' ? 'selected' : ''}>库存健康</option>
        <option value="slow" ${ui.invStatus === 'slow' ? 'selected' : ''}>库龄超 7 天</option>
        <option value="empty" ${ui.invStatus === 'empty' ? 'selected' : ''}>已售罄</option>
      </select>
      <select class="select" id="invSort" aria-label="排序方式">
        <option value="default" ${ui.invSort === 'default' ? 'selected' : ''}>库存优先</option>
        <option value="stockAsc" ${ui.invSort === 'stockAsc' ? 'selected' : ''}>库存少 → 多</option>
        <option value="stockDesc" ${ui.invSort === 'stockDesc' ? 'selected' : ''}>库存多 → 少</option>
        <option value="priceDesc" ${ui.invSort === 'priceDesc' ? 'selected' : ''}>售价高 → 低</option>
        <option value="marginAsc" ${ui.invSort === 'marginAsc' ? 'selected' : ''}>毛利低 → 高</option>
        <option value="newest" ${ui.invSort === 'newest' ? 'selected' : ''}>最近建档</option>
        <option value="name" ${ui.invSort === 'name' ? 'selected' : ''}>名称排序</option>
      </select>
      ${filtersActive ? `<button class="btn btn-ghost btn-sm" data-action="reset-inventory-filters">重置</button>` : ''}
    </div>

    <section class="card table-card">
      <div class="table-card-head">
        <div>
          <h2>花卉清单</h2>
          <p>点击花名查看价格、流水与销售记录；库存支持补货、报损和盘点修正。</p>
        </div>
        <span class="count-chip" id="inventoryCount">${filteredFlowers().length} / ${all.length} 种</span>
      </div>
      <div id="inventoryTableWrap">${inventoryTableInner()}</div>
    </section>`;
}

/* ---------------- 快速开单 ---------------- */
function filteredSaleProducts() {
  let list = activeFlowers();
  const search = ui.saleSearch.trim().toLowerCase();
  if (search) {
    list = list.filter((f) => [f.name, f.variety, f.category, f.color, f.supplier]
      .join(' ').toLowerCase().includes(search));
  }
  if (ui.saleCategory !== 'all') list = list.filter((f) => f.category === ui.saleCategory);
  return list;
}

function saleProductsInner() {
  const list = filteredSaleProducts();
  if (!list.length) {
    return emptyStateHTML({
      title: '没有可选的花卉',
      description: '换个关键词试试，或先在库存管理中新增花卉。',
      action: '<button class="btn btn-primary btn-sm" data-action="open-add-flower">新增花卉</button>'
    });
  }
  return `<div class="product-grid">${list.map((flower) => {
    const soldOut = flower.stock <= 0;
    const low = flower.stock > 0 && flower.stock <= flower.minStock;
    return `<button class="product-card" data-action="add-to-cart" data-id="${flower.id}" ${soldOut ? 'disabled' : ''} aria-label="将 ${escapeHTML(flower.name)} 加入清单">
      ${soldOut ? '<span class="sold-out-flag">暂时售罄</span>' : ''}
      <span class="product-top">
        ${flowerAvatar(flower, 'is-lg')}
        <span class="product-stock ${low ? 'is-low' : ''}">${soldOut ? '售罄' : `余 ${number(flower.stock)} ${escapeHTML(flower.unit)}`}</span>
      </span>
      <span class="product-copy">
        <span class="product-name">${escapeHTML(flower.name)}</span>
        <span class="product-meta">${escapeHTML(flower.category)} · ${escapeHTML(flower.color || '')} ${escapeHTML(flower.grade)}级</span>
      </span>
      <span class="product-bottom">
        <span class="product-price">${money(flower.price)}<small>/ ${escapeHTML(flower.unit)}</small></span>
        <span class="add-circle">${icon('plus', 13)}</span>
      </span>
    </button>`;
  }).join('')}</div>`;
}

function cartDetails() {
  return ui.cart.map((item) => {
    const flower = getFlower(item.flowerId);
    if (!flower) return null;
    const qty = clamp(Math.round(item.qty || 1), 1, Math.max(1, flower.stock));
    const unitPrice = round2(Math.max(0, item.unitPrice || 0));
    return {
      flower,
      qty,
      unitPrice,
      subtotal: round2(qty * unitPrice),
      cost: round2(qty * flower.cost)
    };
  }).filter(Boolean);
}

function cartSummary() {
  const details = cartDetails();
  const subtotal = round2(details.reduce((sum, item) => sum + item.subtotal, 0));
  const cost = round2(details.reduce((sum, item) => sum + item.cost, 0));
  return {
    details,
    count: details.reduce((sum, item) => sum + item.qty, 0),
    subtotal,
    cost,
    profit: round2(subtotal - cost)
  };
}

function checkoutInner() {
  const summary = cartSummary();
  const today = summarizeOrders(todayOrders());
  const cartItems = summary.details.map((item) => {
    const flower = item.flower;
    return `<div class="cart-item">
      <div class="cart-item-main">
        ${flowerAvatar(flower, 'is-sm')}
        <span class="cart-item-name">
          <strong>${escapeHTML(flower.name)}</strong>
          <small>${money(flower.price)} / ${escapeHTML(flower.unit)} · 库存 ${number(flower.stock)}</small>
        </span>
        <button class="cart-remove" type="button" data-action="remove-cart" data-id="${flower.id}" title="移除" aria-label="移除 ${escapeHTML(flower.name)}">${icon('x', 12)}</button>
      </div>
      <div class="cart-controls">
        <span class="qty-stepper">
          <button type="button" data-action="cart-dec" data-id="${flower.id}" aria-label="减少数量">${icon('minus', 11)}</button>
          <input type="number" min="1" max="${flower.stock}" step="1" value="${item.qty}" data-cart-qty data-id="${flower.id}" aria-label="${escapeHTML(flower.name)} 数量">
          <button type="button" data-action="cart-inc" data-id="${flower.id}" aria-label="增加数量">${icon('plus', 11)}</button>
        </span>
        <span class="cart-price-input"><span>¥</span><input type="number" min="0" step="0.1" value="${item.unitPrice.toFixed(2)}" data-cart-price data-id="${flower.id}" aria-label="${escapeHTML(flower.name)} 单价"></span>
      </div>
      <div class="cart-line-total" data-line-total="${flower.id}">${money(item.subtotal)}<small>小计</small></div>
    </div>`;
  }).join('');

  return `<form id="saleForm" novalidate>
    <div class="cart-list">
      ${summary.details.length ? cartItems : `<div class="cart-empty">
        ${icon('flower', 39)}
        <strong>清单还是空的</strong>
        <span>从左侧挑选花卉，点一下就能加入本单</span>
      </div>`}
    </div>
    <div class="checkout-summary">
      <div class="summary-line"><span>商品件数</span><strong>${number(summary.count)} 件</strong></div>
      <div class="summary-line"><span>预估成本</span><strong>${money(summary.cost)}</strong></div>
      <div class="summary-line"><span>预估毛利</span><strong>${money(summary.profit)}</strong></div>
      <div class="summary-line total"><span>应收合计</span><strong>${money(summary.subtotal)}</strong></div>
    </div>
    <div class="checkout-fields">
      <div class="field">
        <label for="saleCustomer">客户</label>
        <input id="saleCustomer" name="customer" type="text" placeholder="散客可不填" autocomplete="off">
      </div>
      <div class="field">
        <label for="salePayment">收款方式</label>
        <select id="salePayment" name="payment">
          ${PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="saleDate">开单日期</label>
        <input id="saleDate" name="date" type="date" value="${dateInputValue()}">
      </div>
      <div class="field">
        <label for="saleNote">备注</label>
        <input id="saleNote" name="note" type="text" placeholder="例如：生日花束" autocomplete="off">
      </div>
    </div>
    <div class="form-error" id="saleError"></div>
    <div class="checkout-foot">
      <button class="btn btn-primary btn-block btn-lg" type="submit" id="saleSubmitBtn" ${summary.details.length ? '' : 'disabled'}>${icon('check-circle', 17)} 完成收款 · ${money(summary.subtotal)}</button>
    </div>
    <p class="checkout-hint">收款后将自动扣减库存并计入销售记录，可在销售记录中整单退款。</p>
  </form>
  <div class="today-strip">
    <span>今日已完成 <strong>${today.count}</strong> 单</span>
    <strong>${money(today.revenue)}</strong>
  </div>`;
}

function renderSalesView() {
  const categories = Array.from(new Set([...CATEGORIES, ...activeFlowers().map((f) => f.category)]));
  const products = filteredSaleProducts();
  const summary = cartSummary();
  return `
    ${pageHeadHTML({
      eyebrow: 'NEW ORDER · 快速开单',
      title: VIEW_META.sales.title,
      description: '选择花卉、调整数量与单价，完成收款后自动扣减库存。单价可按现场折扣单独修改。',
      actions: `<button class="btn btn-ghost" data-action="nav" data-view="records">${icon('receipt', 16)} 销售记录</button>`
    })}
    <div class="sale-layout">
      <section class="sale-browser">
        <div class="sale-browser-head">
          <div>
            <h2>选择花卉</h2>
            <p>${products.length} 款可选 · 库存实时同步</p>
          </div>
          <span class="pill"><i></i>点击卡片加入清单</span>
        </div>
        <div class="sale-toolbar">
          <div class="search-box">
            ${icon('search', 15)}
            <input id="saleSearch" type="search" value="${escapeHTML(ui.saleSearch)}" placeholder="搜索花名、品类、颜色..." autocomplete="off" aria-label="搜索可售花卉">
            <button class="search-clear" data-action="clear-search" data-target="sale" aria-label="清空搜索" ${ui.saleSearch ? '' : 'hidden'}>${icon('x', 12)}</button>
          </div>
          <select class="select select-sm" id="saleCategory" aria-label="筛选品类">
            <option value="all">全部品类</option>
            ${categories.map((cat) => `<option value="${escapeHTML(cat)}" ${ui.saleCategory === cat ? 'selected' : ''}>${escapeHTML(cat)}</option>`).join('')}
          </select>
        </div>
        <div id="saleProducts">${saleProductsInner()}</div>
      </section>

      <aside class="checkout-card" id="checkoutCard" aria-label="本单清单">
        <div class="checkout-head">
          <div>
            <h2>本单清单</h2>
            <p>${ui.cart.length ? '确认数量与价格后收款' : '等待挑花入单'}</p>
          </div>
          <span class="checkout-count">${summary.count}</span>
        </div>
        <div class="checkout-body" id="checkoutBody">${checkoutInner()}</div>
      </aside>
    </div>
    ${summary.details.length ? `<button class="mobile-cart-bar" data-action="scroll-checkout">
      <span class="mobile-cart-label">${icon('shopping-bag', 16)} 清单 ${summary.count} 件</span>
      <strong>${money(summary.subtotal)}</strong>
      <span class="mobile-cart-go">查看并收款 ${icon('arrow-right', 14)}</span>
    </button>` : ''}`;
}

/* ---------------- 销售记录 ---------------- */
function filteredOrders() {
  let list = [...state.orders];
  const search = ui.recordSearch.trim().toLowerCase();
  if (search) {
    list = list.filter((o) => {
      const text = [o.no, o.customer, o.note, o.payment, ...o.lines.map((l) => `${l.name} ${l.variety}`)].join(' ').toLowerCase();
      return text.includes(search);
    });
  }
  if (ui.recordPayment !== 'all') list = list.filter((o) => o.payment === ui.recordPayment);
  list = list.filter((o) => isWithinRange(o.date, ui.recordRange));
  return list.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function recordsTableInner() {
  const orders = filteredOrders();
  if (!orders.length) {
    return emptyStateHTML({
      title: '还没有销售记录',
      description: '完成第一笔开单后，订单、收入和毛利会出现在这里。',
      action: '<button class="btn btn-primary btn-sm" data-action="nav" data-view="sales">去开单</button>',
      iconName: 'receipt'
    });
  }
  const rows = orders.map((order) => {
    const preview = order.lines.slice(0, 2).map((line) => `${escapeHTML(line.name)} ×${line.qty}`).join('、');
    const more = order.lines.length > 2 ? ` 等 ${order.lines.length} 项` : '';
    const profit = orderGrossProfit(order);
    return `<tr>
      <td>
        <span class="order-no">${escapeHTML(order.no)}</span>
        ${order.source === 'online' ? '<span class="online-order-chip">线上</span>' : ''}
        <span class="order-date">${formatDateTime(order.date)}</span>
      </td>
      <td>${escapeHTML(order.customer || '散客')}</td>
      <td><span class="order-lines-preview">${preview}${more}</span></td>
      <td><strong>${money(order.total)}</strong></td>
      <td><span class="order-profit ${profit < 0 ? 'is-loss' : ''}">${money(profit)}</span></td>
      <td><span class="payment-tag">${escapeHTML(order.payment)}</span></td>
      <td><span class="order-status ${order.status === 'refunded' ? 'is-refunded' : ''}">${order.status === 'refunded' ? '已退款' : '已完成'}</span></td>
      <td>
        <div class="record-actions">
          <button class="table-btn" data-action="view-order" data-id="${order.id}" title="查看详情" aria-label="查看订单详情">${icon('more', 14)}</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const mobileOrders = orders.map((order) => {
    const preview = order.lines.slice(0, 2).map((line) => `${escapeHTML(line.name)} ×${line.qty}`).join('、');
    const more = order.lines.length > 2 ? ` 等 ${order.lines.length} 项` : '';
    const profit = orderGrossProfit(order);
    const refunded = order.status === 'refunded';
    return `<button class="mobile-order-card ${refunded ? 'is-refunded' : ''}" data-action="view-order" data-id="${order.id}">
      <span class="moc-head">
        <span class="moc-no">${escapeHTML(order.no)}${order.source === 'online' ? ' <em class="online-order-chip">线上</em>' : ''}</span>
        <span class="order-status ${refunded ? 'is-refunded' : ''}">${refunded ? '已退款' : '已完成'}</span>
      </span>
      <span class="moc-main">
        <strong>${escapeHTML(order.customer || '散客')}</strong>
        <span>${preview}${more}</span>
      </span>
      <span class="moc-foot">
        <span><small>实收</small><strong>${money(order.total)}</strong></span>
        <span><small>毛利</small><strong class="${profit < 0 ? 'is-loss' : ''}">${money(profit)}</strong></span>
        <span class="moc-pay">${escapeHTML(order.payment)}</span>
        <span class="moc-arrow">${icon('chevron-right', 14)}</span>
      </span>
    </button>`;
  }).join('');

  return `<div class="mobile-order-list mobile-only">${mobileOrders}</div>
  <div class="table-wrap desktop-table-only">
    <table class="data-table" style="min-width:900px">
      <thead><tr><th>订单号</th><th>客户</th><th>商品</th><th>实收</th><th>毛利</th><th>收款</th><th>状态</th><th style="text-align:right">详情</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderRecordsView() {
  const orders = filteredOrders();
  const completed = orders.filter((o) => o.status === 'completed');
  const summary = summarizeOrders(completed);
  const refunded = orders.length - completed.length;
  const avg = completed.length ? summary.revenue / completed.length : 0;

  return `
    ${pageHeadHTML({
      eyebrow: 'SALES RECORDS · 流水与凭证',
      title: VIEW_META.records.title,
      description: '查看每一笔订单的商品明细、毛利和收款方式。整单退款会恢复库存，并从经营数据中剔除。',
      actions: `<button class="btn btn-ghost" data-action="export-orders-csv">${icon('download', 16)} 导出销售明细</button>
        <button class="btn btn-primary" data-action="nav" data-view="sales">${icon('plus', 16)} 新开一单</button>`
    })}

    <div class="record-summary">
      <div class="record-stat"><span>订单数</span><strong>${orderCountFmt(orders.length)}</strong><small>${refunded ? `其中 ${refunded} 笔已退款` : '全部已完成'}</small></div>
      <div class="record-stat"><span>销售件数</span><strong>${number(summary.units)}</strong><small>件 / 枝 / 盆</small></div>
      <div class="record-stat"><span>实收金额</span><strong>${money(summary.revenue)}</strong><small>退款订单未计入</small></div>
      <div class="record-stat"><span>毛利</span><strong>${money(summary.profit)}</strong><small>客单价 ${money(avg)}</small></div>
    </div>

    <div class="filter-bar">
      <div class="search-box">
        ${icon('search', 15)}
        <input id="recordSearch" type="search" value="${escapeHTML(ui.recordSearch)}" placeholder="搜索订单号、客户、商品..." autocomplete="off" aria-label="搜索销售记录">
        <button class="search-clear" data-action="clear-search" data-target="records" aria-label="清空搜索" ${ui.recordSearch ? '' : 'hidden'}>${icon('x', 12)}</button>
      </div>
      <select class="select" id="recordRange" aria-label="筛选时间范围">
        <option value="all" ${ui.recordRange === 'all' ? 'selected' : ''}>全部时间</option>
        <option value="today" ${ui.recordRange === 'today' ? 'selected' : ''}>今天</option>
        <option value="7" ${ui.recordRange === '7' ? 'selected' : ''}>近 7 天</option>
        <option value="30" ${ui.recordRange === '30' ? 'selected' : ''}>近 30 天</option>
        <option value="month" ${ui.recordRange === 'month' ? 'selected' : ''}>本月</option>
      </select>
      <select class="select" id="recordPayment" aria-label="筛选收款方式">
        <option value="all" ${ui.recordPayment === 'all' ? 'selected' : ''}>全部收款方式</option>
        ${PAYMENT_METHODS.map((m) => `<option value="${m}" ${ui.recordPayment === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </div>

    <section class="card table-card">
      <div class="table-card-head">
        <div>
          <h2>订单流水</h2>
          <p>点击行尾按钮查看完整小票与退款入口。</p>
        </div>
        <span class="count-chip">共 ${orderCountFmt(orders.length)} 笔</span>
      </div>
      <div id="recordsTableWrap">${recordsTableInner()}</div>
    </section>`;
}

function orderCountFmt(count) {
  return String(count);
}

/* ---------------- 盈利分析 ---------------- */
function financeInsightsHTML(products, customers, loss, revenue) {
  const insights = [];
  const top = products[0];
  if (top) {
    insights.push({
      iconName: 'trend-up',
      tone: 'green',
      title: `最会赚钱的花：${top.name}`,
      desc: `贡献 ${money(top.revenue)} 营收、${money(top.profit)} 毛利，售出 ${number(top.units)} ${escapeHTML(top.unit)}。`
    });
  }
  const thin = products.find((p) => p.revenue > 0 && p.profit / p.revenue < 0.25);
  if (thin) {
    insights.push({
      iconName: 'tag',
      tone: 'gold',
      title: '留意低毛利商品',
      desc: `${escapeHTML(thin.name)} 的毛利率仅 ${percent(thin.profit / thin.revenue, 1)}，可以尝试调整售价或更换进货渠道。`
    });
  }
  if (loss > 0) {
    const rate = lossRate(revenue, loss);
    insights.push({
      iconName: 'alert',
      tone: 'red',
      title: '损耗正在吃掉利润',
      desc: `当前损耗成本 ${money(loss)}，占营收 ${percent(rate, 1)}。优先处理库龄较长的花材。`
    });
  }
  if (customers[0]) {
    insights.push({
      iconName: 'users',
      tone: 'green',
      title: `最稳定客户：${customers[0].name}`,
      desc: `贡献 ${money(customers[0].revenue)}，共 ${customers[0].orders} 笔订单，最近一次 ${formatDate(customers[0].last)}。`
    });
  }
  if (!insights.length) {
    insights.push({
      iconName: 'sparkles',
      tone: 'green',
      title: '等第一笔订单',
      desc: '完成开单后，这里会自动给出商品、客户和损耗方面的经营提示。'
    });
  }
  return insights.map((item) => `<div class="insight-item">
    <span class="insight-icon ${item.tone === 'green' ? 'is-green' : item.tone === 'red' ? 'is-red' : ''}">${icon(item.iconName, 12)}</span>
    <span class="insight-copy"><strong>${escapeHTML(item.title)}</strong><span>${item.desc}</span></span>
  </div>`).join('');
}

function renderFinanceView() {
  const orders = ordersInRange(ui.financeRange);
  const summary = summarizeOrders(orders);
  const loss = lossCostInRange(ui.financeRange);
  const netProfit = round2(summary.profit - loss);
  const margin = summary.revenue > 0 ? summary.profit / summary.revenue : 0;
  const products = aggregateProducts(orders);
  const customers = aggregateCustomers(orders);
  const categories = collapseCategories(revenueByCategory(orders), 5);
  const categoryTotal = categories.reduce((sum, c) => sum + c.value, 0);
  const series = salesSeries(14);
  const rangeLabel = { today: '今天', '7': '近 7 天', '30': '近 30 天', month: '本月', all: '全部时间' }[ui.financeRange] || '近 30 天';

  const productRows = products.slice(0, 8).map((item) => {
    const pMargin = item.revenue > 0 ? item.profit / item.revenue : 0;
    return `<tr>
      <td><strong>${escapeHTML(item.name)}</strong><span class="flower-meta">${escapeHTML(item.variety || '')}</span></td>
      <td>${number(item.units)} ${escapeHTML(item.unit)}</td>
      <td><strong>${money(item.revenue)}</strong></td>
      <td><span class="order-profit">${money(item.profit)}</span></td>
      <td><span class="margin-text ${pMargin >= 0.4 ? 'good' : pMargin >= 0.25 ? 'warn' : 'bad'}">${percent(pMargin, 1)}</span></td>
    </tr>`;
  }).join('');

  const mobileProductCards = products.slice(0, 8).map((item, index) => {
    const pMargin = item.revenue > 0 ? item.profit / item.revenue : 0;
    return `<article class="mobile-product-card">
      <div class="mpc-head">
        <span class="mpc-rank">${String(index + 1).padStart(2, '0')}</span>
        <div class="mpc-title"><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.variety || '花卉')} · 售出 ${number(item.units)} ${escapeHTML(item.unit)}</span></div>
        <span class="margin-text ${pMargin >= 0.4 ? 'good' : pMargin >= 0.25 ? 'warn' : 'bad'}">${percent(pMargin, 1)}</span>
      </div>
      <div class="mpc-stats">
        <span><small>营收</small><strong>${money(item.revenue)}</strong></span>
        <span><small>毛利</small><strong>${money(item.profit)}</strong></span>
        <span><small>销量</small><strong>${number(item.units)} ${escapeHTML(item.unit)}</strong></span>
      </div>
    </article>`;
  }).join('');

  const productTable = products.length ? `<div class="mobile-product-list mobile-only">${mobileProductCards}</div>
    <div class="desktop-table-only"><div class="table-wrap">
    <table class="data-table" style="min-width:620px">
      <thead><tr><th>花卉</th><th>销量</th><th>营收</th><th>毛利</th><th>毛利率</th></tr></thead>
      <tbody>${productRows}</tbody>
    </table>
  </div></div>` : emptyStateHTML({ title: '还没有经营数据', description: '当前时间范围内没有已完成订单。', action: '<button class="btn btn-primary btn-sm" data-action="nav" data-view="sales">去开单</button>', iconName: 'chart' });

  const customerRows = customers.slice(0, 5).map((customer, i) => `<div class="customer-row">
    <span class="customer-rank">${i + 1}</span>
    <span class="customer-copy"><strong>${escapeHTML(customer.name)}</strong><small>${customer.orders} 单 · 最近 ${formatDate(customer.last, 'short')}</small></span>
    <span class="customer-value">${money(customer.revenue)}<small>贡献营收</small></span>
  </div>`).join('');

  const categoryBars = categories.map((cat, i) => {
    const share = categoryTotal ? cat.value / categoryTotal : 0;
    return `<div class="bar-item">
      <div class="bar-item-top"><span class="bar-item-name">${escapeHTML(cat.name)}</span><span class="bar-item-value">${money(cat.value)} · ${percent(share, 0)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(share * 100).toFixed(1)}%"></div></div>
    </div>`;
  }).join('');

  return `
    ${pageHeadHTML({
      eyebrow: 'PROFITABILITY · 收入与利润',
      title: VIEW_META.finance.title,
      description: '把营业额、采购成本、损耗和净利润放在一起看，找到真正赚钱的花与需要调整的定价。',
      actions: `<button class="btn btn-ghost" data-action="export-orders-csv">${icon('download', 16)} 导出明细</button>
        <button class="btn btn-soft" data-action="nav" data-view="pricing">${icon('tag', 16)} 价格行情</button>`
    })}

    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:13px">
      <span class="pill"><i></i>当前统计：${rangeLabel}</span>
      ${segmentedHTML([
        { label: '今天', value: 'today' },
        { label: '近 7 天', value: '7' },
        { label: '近 30 天', value: '30' },
        { label: '全部', value: 'all' }
      ], ui.financeRange, 'set-finance-range')}
    </div>

    <div class="finance-metrics">
      <div class="finance-metric is-main"><span>营业收入</span><strong>${money(summary.revenue)}</strong><small>${summary.count} 笔订单 · ${number(summary.units)} 件商品</small></div>
      <div class="finance-metric"><span>商品成本</span><strong>${money(summary.cost)}</strong><small>按销售时成本快照计算</small></div>
      <div class="finance-metric"><span>毛利</span><strong>${money(summary.profit)}</strong><small>毛利率 <b>${percent(margin, 1)}</b></small></div>
      <div class="finance-metric is-warn"><span>净利润</span><strong>${money(netProfit)}</strong><small>已扣除损耗 ${money(loss)} · 损耗率 ${percent(lossRate(summary.revenue, loss), 1)}</small></div>
    </div>

    <div class="finance-grid">
      <section class="card chart-card">
        <div class="section-head">
          <div>
            <h2>营收与毛利走势</h2>
            <p>最近 14 天 · 数据点可悬停查看</p>
          </div>
        </div>
        <div class="chart-summary">
          <span class="chart-total"><span class="currency">¥</span>${money(summary.revenue, false)}</span>
          <span class="chart-compare"><span class="trend">${percent(margin, 1)}</span> 区间毛利率</span>
        </div>
        <div class="chart-legend">
          <span class="legend-item"><i class="legend-swatch"></i>营业额</span>
          <span class="legend-item"><i class="legend-swatch is-soft"></i>毛利</span>
        </div>
        <div class="chart-shell">${buildLineChart(series, { height: 240 })}</div>
      </section>

      <section class="card breakdown-card">
        <div class="section-head">
          <div>
            <h2>品类收入结构</h2>
            <p>售出金额占比 · ${rangeLabel}</p>
          </div>
        </div>
        <div class="donut-wrap">
          <div class="donut" style="background:${donutGradient(categories, categoryTotal)}">
            <div class="donut-center"><span>营业收入</span><strong>${moneyCompact(categoryTotal)}</strong></div>
          </div>
          <div class="category-legend">
            ${categories.map((cat, i) => `<div class="category-item">
              <span class="category-dot" style="background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"></span>
              <span class="category-name">${escapeHTML(cat.name)}</span>
              <span class="category-share">${percent(categoryTotal ? cat.value / categoryTotal : 0, 0)}</span>
            </div>`).join('') || '<span class="muted" style="font-size:10px">暂无数据</span>'}
          </div>
        </div>
        <div class="category-total"><span>商品成本</span><strong>${money(summary.cost)}</strong></div>
      </section>
    </div>

    <div class="finance-bottom">
      <section class="card table-card">
        <div class="table-card-head">
          <div><h2>花卉盈利能力</h2><p>按营收排序，毛利率低于 25% 需要重点关注。</p></div>
          <span class="count-chip">${products.length} 种</span>
        </div>
        ${productTable}
      </section>

      <div class="finance-side-stack">
        <section class="card customer-card" style="padding:18px 20px 14px">
          <div class="section-head"><div><h2>客户贡献</h2><p>复购与客单价一目了然</p></div></div>
          <div class="customer-list">${customerRows || '<div class="mini-empty">当前时间范围暂无客户数据</div>'}</div>
        </section>
        <section class="card" style="padding:18px 20px 17px">
          <div class="section-head"><div><h2>经营诊断</h2><p>根据当前数据自动生成</p></div></div>
          <div class="insight-list">${financeInsightsHTML(products, customers, loss, summary.revenue)}</div>
        </section>
      </div>
    </div>`;
}

/* ---------------- 价格行情 ---------------- */
function priceHistoryForFlower(flowerId) {
  return state.priceHistory
    .filter((p) => p.flowerId === flowerId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function pricingHealth(flower) {
  const margin = grossMargin(flower.price, flower.cost);
  if (flower.price <= 0) return { level: 'bad', text: '当前未设置售价，建议先完成定价。' };
  if (margin < 0.2) return { level: 'bad', text: `毛利率 ${percent(margin, 1)}，空间较薄。建议将售价调整至 ${money(suggestedPrice(flower.cost, 0.35))} 左右。` };
  if (margin < 0.35) return { level: 'warn', text: `毛利率 ${percent(margin, 1)}，略低于健康区间。可结合花材品质尝试小幅提价。` };
  if (margin > 0.68) return { level: 'warn', text: `毛利率 ${percent(margin, 1)} 偏高，若动销放缓，可以考虑做组合花束提升性价比。` };
  return { level: 'good', text: `毛利率 ${percent(margin, 1)}，处于健康区间。保持关注同类花材的市场价格即可。` };
}

function renderPricingView() {
  const active = activeFlowers();
  if (!active.length) {
    return `${pageHeadHTML({ eyebrow: 'PRICING · 售价与成本', title: VIEW_META.pricing.title, description: '管理售价、成本与调价记录。', actions: '' })}
      <section class="card">${emptyStateHTML({ title: '还没有可定价的花卉', description: '先新增一种花，再记录售价与价格浮动。', action: '<button class="btn btn-primary btn-sm" data-action="open-add-flower">新增花卉</button>', iconName: 'tag' })}</section>`;
  }
  if (!active.some((f) => f.id === ui.priceFlowerId)) ui.priceFlowerId = active[0].id;
  const flower = getFlower(ui.priceFlowerId) || active[0];
  const history = priceHistoryForFlower(flower.id);
  const health = pricingHealth(flower);
  const margin = grossMargin(flower.price, flower.cost);
  const recentCount = state.priceHistory.filter((p) => p.flowerId === flower.id && isWithinRange(p.date, '30')).length;

  const avgPrice = active.reduce((sum, f) => sum + f.price, 0) / active.length;
  const avgCost = active.reduce((sum, f) => sum + f.cost, 0) / active.length;
  const avgMargin = active.reduce((sum, f) => sum + grossMargin(f.price, f.cost), 0) / active.length;
  const changes30 = state.priceHistory.filter((p) => isWithinRange(p.date, '30')).length;

  const allHistory = [...state.priceHistory]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 15);
  const historyRows = allHistory.map((entry) => {
    const f = getFlower(entry.flowerId);
    const pct = priceChangePercent(entry.oldPrice, entry.newPrice);
    const cls = pct > 0 ? 'change-up' : pct < 0 ? 'change-down' : 'change-flat';
    const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
    return `<tr>
      <td><span class="order-date">${formatDate(entry.date)}</span><span class="flower-meta">${formatTime(entry.date)}</span></td>
      <td>${f ? `<div class="flower-cell">${flowerAvatar(f, 'is-sm')}<span class="flower-cell-copy"><span class="flower-name" style="cursor:default">${escapeHTML(f.name)}</span><span class="flower-meta">${escapeHTML(f.category)}</span></span></div>` : '已删除花卉'}</td>
      <td>${money(entry.oldPrice)}</td>
      <td><strong>${money(entry.newPrice)}</strong></td>
      <td><span class="${cls}">${arrow} ${percent(Math.abs(pct), 1)}</span></td>
      <td><span class="flower-meta">${money(entry.oldCost)} → ${money(entry.newCost)}</span></td>
      <td><span class="order-lines-preview">${escapeHTML(entry.reason || '调整售价')}</span></td>
    </tr>`;
  }).join('');

  const historyCards = allHistory.map((entry) => {
    const f = getFlower(entry.flowerId);
    const pct = priceChangePercent(entry.oldPrice, entry.newPrice);
    const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
    return `<article class="mobile-price-card">
      <div class="mpc-price-head">
        <span>${formatDateTime(entry.date)}</span>
        <strong class="${dir === 'up' ? 'change-up' : dir === 'down' ? 'change-down' : 'change-flat'}">${arrow} ${percent(Math.abs(pct), 1)}</strong>
      </div>
      <div class="mpc-price-flower">${escapeHTML(f?.name || '已删除花卉')}${f ? `<small>${escapeHTML(f.category)}</small>` : ''}</div>
      <div class="mpc-price-values">
        <span>${money(entry.oldPrice)}</span><b>→</b><strong>${money(entry.newPrice)}</strong>
        <small>成本 ${money(entry.oldCost)} → ${money(entry.newCost)}</small>
      </div>
      <div class="mpc-price-reason">${escapeHTML(entry.reason || '调整售价')}</div>
    </article>`;
  }).join('');

  return `
    ${pageHeadHTML({
      eyebrow: 'PRICING · 售价与成本',
      title: VIEW_META.pricing.title,
      description: '记录每一次价格浮动，比较售价与成本，找到既好卖又有利润的定价区间。',
      actions: `<button class="btn btn-ghost" data-action="adjust-stock" data-id="${flower.id}">${icon('box', 16)} 补货更新成本</button>
        <button class="btn btn-primary" data-action="change-price" data-id="${flower.id}">${icon('tag', 16)} 调整价格</button>`
    })}

    <div class="price-metric-row">
      <div class="price-metric"><span>平均售价</span><strong>${money(avgPrice)}</strong><small>${active.length} 种在售花卉</small></div>
      <div class="price-metric"><span>平均成本</span><strong>${money(avgCost)}</strong><small>按当前单位成本</small></div>
      <div class="price-metric"><span>平均毛利率</span><strong>${percent(avgMargin, 1)}</strong><small>简单算术平均</small></div>
      <div class="price-metric"><span>近 30 天调价</span><strong>${changes30} 次</strong><small>所有花卉合计</small></div>
    </div>

    <div class="pricing-layout">
      <section class="card pricing-main">
        <div class="section-head">
          <div>
            <h2>售价与成本走势</h2>
            <p>${escapeHTML(flower.name)} · 共 ${history.length} 次调价记录</p>
          </div>
          <select class="select select-sm" id="priceFlowerSelect" aria-label="选择花卉">
            ${active.map((f) => `<option value="${f.id}" ${f.id === flower.id ? 'selected' : ''}>${escapeHTML(f.name)}</option>`).join('')}
          </select>
        </div>
        <div class="chart-summary">
          <span class="chart-total"><span class="currency">¥</span>${money(flower.price, false)}</span>
          <span class="chart-compare">当前售价 · 成本 ${money(flower.cost)}</span>
        </div>
        <div class="chart-shell">${buildPriceChart(flower)}</div>
        <div class="price-chart-legend">
          <span class="legend-item"><i class="legend-swatch"></i>售价</span>
          <span class="legend-item"><i class="legend-swatch is-dash"></i>成本</span>
          <span class="muted" style="margin-left:auto">时间范围为建档至今</span>
        </div>
      </section>

      <div class="pricing-side">
        <section class="card price-now">
          <div class="price-now-head">
            ${flowerAvatar(flower)}
            <div class="price-now-title">
              <strong>${escapeHTML(flower.name)}</strong>
              <span>${escapeHTML(flower.category)} · ${escapeHTML(flower.variety || flower.color || '常规')} · ${escapeHTML(flower.grade)} 级</span>
            </div>
          </div>
          <div class="price-big">
            <strong>${money(flower.price)}</strong>
            <span>/ ${escapeHTML(flower.unit)}</span>
            <span class="badge ${margin < 0.2 ? 'badge-red' : margin < 0.35 ? 'badge-gold' : 'badge-green'}">${percent(margin, 0)}</span>
          </div>
          <div class="price-rows">
            <div class="price-row"><span>单位成本</span><strong>${money(flower.cost)}</strong></div>
            <div class="price-row"><span>建议售价（35% 毛利）</span><strong>${money(suggestedPrice(flower.cost, 0.35))}</strong></div>
            <div class="price-row"><span>当前库存</span><strong>${number(flower.stock)} ${escapeHTML(flower.unit)}</strong></div>
            <div class="price-row"><span>近 30 天调价</span><strong>${recentCount} 次</strong></div>
          </div>
          <div class="price-health ${health.level === 'warn' ? 'is-warn' : health.level === 'bad' ? 'is-bad' : ''}">${health.text}</div>
          <div class="price-actions">
            <button class="btn btn-soft btn-sm" data-action="adjust-stock" data-id="${flower.id}">${icon('box', 14)} 补货</button>
            <button class="btn btn-primary btn-sm" data-action="change-price" data-id="${flower.id}">${icon('tag', 14)} 改价</button>
          </div>
        </section>

        <section class="card" style="padding:16px 18px">
          <div class="section-head"><div><h2 style="font-size:14px">毛利小贴士</h2><p>用成本倒推合理售价</p></div></div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
            ${[0.3, 0.4, 0.5].map((target) => `<div class="price-row" style="padding:7px 0;border-top:1px solid #f0ede4">
              <span>目标毛利 ${percent(target, 0)}</span><strong>${money(suggestedPrice(flower.cost, target))}</strong>
            </div>`).join('')}
          </div>
          <p class="field hint" style="margin-top:9px">售价 = 成本 ÷ (1 − 目标毛利率)</p>
        </section>
      </div>
    </div>

    <section class="card table-card">
      <div class="table-card-head">
        <div><h2>调价记录</h2><p>最近 15 条价格与成本变动，方便回溯定价决策。</p></div>
        <span class="count-chip">${state.priceHistory.length} 条记录</span>
      </div>
      ${allHistory.length ? `<div class="mobile-price-list mobile-only">${historyCards}</div>
      <div class="table-wrap desktop-table-only">
        <table class="data-table" style="min-width:900px">
          <thead><tr><th>时间</th><th>花卉</th><th>原售价</th><th>新售价</th><th>幅度</th><th>成本变化</th><th>原因</th></tr></thead>
          <tbody>${historyRows}</tbody>
        </table>
      </div>` : emptyStateHTML({ title: '还没有调价记录', description: '通过改价或补货更新成本后，这里会保留完整的价格浮动历史。', action: `<button class="btn btn-primary btn-sm" data-action="change-price" data-id="${flower.id}">调整价格</button>`, iconName: 'tag' })}
    </section>`;
}
