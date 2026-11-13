/* =========================================================
   花间集 · 库存列表 → 花卉档案（源码整理）
   文件 3 / 5：详情页（花卉档案弹窗）
   摘录自：app.js 第 925-1032 行（原样摘录，未改动逻辑）
   依赖：1-数据与计算.js、2-列表页.js 的 priceHistoryForFlower、4-弹窗底座.js 的 openModal
   ========================================================= */

/* ---------- app.js:925-1032  花卉档案详情 ---------- */
function openFlowerDetail(id) {
  const flower = getFlower(id);
  if (!flower) return;
  const status = stockStatus(flower);
  const fresh = freshness(flower);
  const margin = marginState(flower.price, flower.cost);
  const plan = restockSuggestion(flower);
  const movements = state.movements
    .filter((m) => m.flowerId === id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4);
  const prices = priceHistoryForFlower(id).slice(0, 3);
  const relatedOrders = state.orders
    .filter((o) => o.lines.some((line) => line.flowerId === id))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3);
  const completed = state.orders.filter((o) => o.status === 'completed');
  let totalUnits = 0;
  let totalRevenue = 0;
  completed.forEach((order) => {
    order.lines.forEach((line) => {
      if (line.flowerId === id) {
        totalUnits += line.qty;
        totalRevenue += line.qty * line.unitPrice;
      }
    });
  });

  const movementRows = movements.map((movement) => `<div class="mini-row">
    <span class="mini-main">
      <strong>${stockMovementLabel(movement.type)}${movement.note ? ` · ${escapeHTML(movement.note)}` : ''}</strong>
      <small>${formatDateTime(movement.date)}</small>
    </span>
    <span class="mini-side" style="color:${movement.change > 0 ? '#4c7c61' : movement.change < 0 ? 'var(--red)' : 'var(--muted)'}">${movement.change > 0 ? '+' : ''}${number(movement.change)}<small> → ${number(movement.after)}</small></span>
  </div>`).join('') || '<div class="mini-empty">暂无库存流水</div>';

  const priceRows = prices.map((entry) => `<div class="mini-row">
    <span class="mini-main">
      <strong>${money(entry.oldPrice)} → ${money(entry.newPrice)}</strong>
      <small>${formatDate(entry.date)} · ${escapeHTML(entry.reason || '调价')}</small>
    </span>
    <span class="mini-side ${priceChangePercent(entry.oldPrice, entry.newPrice) >= 0 ? 'change-up' : 'change-down'}">${priceChangePercent(entry.oldPrice, entry.newPrice) >= 0 ? '+' : ''}${percent(priceChangePercent(entry.oldPrice, entry.newPrice), 1)}</span>
  </div>`).join('') || '<div class="mini-empty">暂无调价记录</div>';

  const orderRows = relatedOrders.map((order) => `<div class="mini-row">
    <span class="mini-main">
      <strong>${escapeHTML(order.customer || '散客')} · ${escapeHTML(order.no)}</strong>
      <small>${formatDateTime(order.date)} · ${order.status === 'refunded' ? '已退款' : '已完成'}</small>
    </span>
    <span class="mini-side">${money(orderRevenue(order))}<small> 实收</small></span>
  </div>`).join('') || '<div class="mini-empty">暂无销售记录</div>';

  const body = `<div class="detail-hero">
      ${flowerAvatar(flower, 'is-lg')}
      <div class="detail-title">
        <h3>${escapeHTML(flower.name)}</h3>
        <p>${escapeHTML(flower.category)} · ${escapeHTML(flower.variety || flower.color || '常规')} · ${escapeHTML(flower.grade)} 级 / ${escapeHTML(flower.unit)}</p>
        <div class="detail-tags">
          <span class="badge ${status.badge}">${status.label}</span>
          <span class="badge ${fresh.tone === 'bad' ? 'badge-red' : fresh.tone === 'warn' ? 'badge-gold' : 'badge-green'}">${fresh.label} · ${fresh.days} 天</span>
          <span class="badge badge-blue badge-plain">${escapeHTML(flower.color || '未设颜色')}</span>
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-box"><span>当前售价</span><strong>${money(flower.price)} <small>/ ${escapeHTML(flower.unit)}</small></strong></div>
      <div class="detail-box"><span>单位成本</span><strong>${money(flower.cost)}</strong></div>
      <div class="detail-box"><span>毛利率</span><strong style="color:${margin.tone === 'bad' ? 'var(--red)' : margin.tone === 'warn' ? '#9b722e' : '#46775e'}">${percent(margin.margin, 1)}</strong></div>
      <div class="detail-box"><span>当前库存</span><strong>${number(flower.stock)} <small>${escapeHTML(flower.unit)}</small></strong></div>
      <div class="detail-box"><span>安全库存</span><strong>${number(flower.minStock)} <small>${escapeHTML(flower.unit)}</small></strong></div>
      <div class="detail-box"><span>累计售出</span><strong>${number(totalUnits)} <small>${escapeHTML(flower.unit)}</small></strong></div>
      <div class="detail-box"><span>累计营收</span><strong>${money(totalRevenue)}</strong></div>
      <div class="detail-box"><span>近 7 日售出</span><strong>${number(plan.sold)} <small>${escapeHTML(flower.unit)}</small></strong></div>
      <div class="detail-box is-wide"><span>供应商</span><strong style="font-family:var(--sans);font-size:11px">${escapeHTML(flower.supplier || '未填写')}</strong></div>
      <div class="detail-box is-wide"><span>存放位置</span><strong style="font-family:var(--sans);font-size:11px">${escapeHTML(flower.location || '未填写')}</strong></div>
    </div>
    ${flower.note ? `<p class="form-note" style="margin-top:12px">${escapeHTML(flower.note)}</p>` : ''}
    ${plan.suggested > 0 ? `<div class="price-health is-warn" style="margin-top:12px">按近 7 日销量与安全库存估算，建议补货 <strong>${number(plan.suggested)} ${escapeHTML(flower.unit)}</strong>${plan.coverDays !== null ? `，当前库存约可售 ${plan.coverDays} 天` : ''}。</div>` : ''}

    <div class="detail-section">
      <div class="detail-section-head"><h4>最近库存流水</h4><button data-action="adjust-stock" data-id="${flower.id}">调整库存 →</button></div>
      <div class="mini-list">${movementRows}</div>
    </div>
    <div class="detail-section">
      <div class="detail-section-head"><h4>价格浮动</h4><button data-action="change-price" data-id="${flower.id}">调整价格 →</button></div>
      <div class="mini-list">${priceRows}</div>
    </div>
    <div class="detail-section">
      <div class="detail-section-head"><h4>最近销售</h4><button data-action="nav" data-view="records">全部记录 →</button></div>
      <div class="mini-list">${orderRows}</div>
    </div>
    <div class="detail-actions">
      <button class="btn btn-primary btn-sm" data-action="quick-sale" data-id="${flower.id}">${icon('cart', 14)} 加入开单</button>
      <button class="btn btn-soft btn-sm" data-action="adjust-stock" data-id="${flower.id}">${icon('box', 14)} 调整库存</button>
      <button class="btn btn-soft btn-sm" data-action="change-price" data-id="${flower.id}">${icon('tag', 14)} 调整价格</button>
      <button class="btn btn-ghost btn-sm" data-action="edit-flower" data-id="${flower.id}">${icon('edit', 14)} 编辑资料</button>
      <button class="btn btn-ghost btn-sm btn-danger-ghost" data-action="delete-flower" data-id="${flower.id}">${icon('trash', 14)} 删除</button>
    </div>`;

  openModal({
    title: '花卉档案',
    subtitle: '从入库到售出，每一枝花都有完整记录。',
    body,
    size: 'large',
    footer: `<button class="btn btn-ghost" data-action="close-modal" type="button">关闭</button>`
  });
}
