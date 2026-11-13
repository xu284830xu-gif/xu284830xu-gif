/* =========================================================
   花间集 · 库存列表 → 花卉档案（源码整理）
   文件 2 / 5：列表页（库存管理）
   摘录自：views.js（原样摘录，未改动逻辑）
     · 第 6-25 行     VIEW_META 与 renderView 路由
     · 第 28-46 行    通用组件：页头、空状态
     · 第 69-72 行    库存徽标
     · 第 532-742 行  筛选排序、表格 / 移动卡片、整页渲染
   依赖：1-数据与计算.js、state、ui
   ========================================================= */

/* ---------- views.js:6-25  页面路由 ---------- */
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

/* ---------- views.js:28-46  通用组件：页头与空状态 ---------- */
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

/* ---------- views.js:69-72  库存徽标 ---------- */
function badgeForStock(flower) {
  const s = stockStatus(flower);
  return `<span class="badge ${s.badge}">${s.label}</span>`;
}

/* ---------- views.js:532-742  库存列表：筛选、表格、移动卡片与整页渲染 ---------- */
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

/* ---------- views.js:1282-1287  价格变动查询（详情页「价格浮动」一节使用） ---------- */
/* ---------------- 价格行情 ---------------- */
function priceHistoryForFlower(flowerId) {
  return state.priceHistory
    .filter((p) => p.flowerId === flowerId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}
