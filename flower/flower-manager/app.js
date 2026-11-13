/* =========================================================
   花间集 · 交互与应用逻辑
   ========================================================= */
'use strict';

let state = loadState();

const ui = {
  view: 'dashboard',
  chartRange: 7,
  invSearch: '',
  invCategory: 'all',
  invStatus: 'all',
  invSort: 'default',
  saleSearch: '',
  saleCategory: 'all',
  cart: [],
  recordSearch: '',
  recordRange: '30',
  recordPayment: 'all',
  financeRange: '30',
  priceFlowerId: null
};

let pendingConfirm = null;
let lastFocused = null;
let checkoutObserver = null;

/* ---------------- 启动 ---------------- */
function init() {
  hydrateStaticIcons();
  updateShell();
  updateSaveIndicator({ ok: true, at: new Date() }, true);
  render();
  bindEvents();
  window.__FLOWER_APP_READY__ = true;
  window.dispatchEvent(new CustomEvent('flower:ready', {
    detail: { apiMode: Boolean(API_MODE), offline: Boolean(window.__API_OFFLINE) }
  }));
}

function hydrateStaticIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, 19);
  });
}

function updateShell() {
  const brand = document.getElementById('brandName');
  if (brand) brand.textContent = state.settings.shopName || '我的花店';
  const mobileSuffix = document.body.dataset.mobileVersion === 'true' ? ' · 手机版' : '';
  document.title = `${state.settings.shopName || '我的花店'} · 花卉经营管理${mobileSuffix}`;

  const topbarKicker = document.getElementById('topbarKicker');
  if (topbarKicker) topbarKicker.textContent = VIEW_META[ui.view]?.kicker || '经营总览';
  const topbarDate = document.getElementById('topbarDate');
  if (topbarDate) topbarDate.textContent = `${formatDate(new Date(), 'full')} · ${weekdayName()}`;

  const lowCount = activeFlowers().filter((f) => f.stock <= f.minStock).length;
  const navLow = document.getElementById('navLowCount');
  if (navLow) {
    navLow.textContent = String(lowCount);
    navLow.hidden = lowCount === 0;
  }

  document.querySelectorAll('.nav-item[data-view], .mobile-tab[data-view]').forEach((el) => {
    const mobileGroup = el.classList.contains('mobile-tab') && ui.view === 'pricing' && el.dataset.view === 'finance';
    el.classList.toggle('is-active', el.dataset.view === ui.view || mobileGroup);
  });
}

function render() {
  if (ui.view === 'sales') pruneCart();
  const root = document.getElementById('viewRoot');
  if (!root) return;
  root.innerHTML = renderView(ui.view);
  root.classList.remove('view-enter');
  void root.offsetWidth;
  root.classList.add('view-enter');
  window.__appRevision = Number(state.meta?.revision) || 1;
  updateShell();
  refreshMobileChrome();
}

function refreshMobileChrome() {
  if (checkoutObserver) {
    checkoutObserver.disconnect();
    checkoutObserver = null;
  }
  if (ui.view !== 'sales' || typeof IntersectionObserver === 'undefined') return;
  const checkout = document.getElementById('checkoutCard');
  const bar = document.querySelector('.mobile-cart-bar');
  if (!checkout || !bar) return;
  checkoutObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      bar.classList.toggle('is-checkout-visible', entry.isIntersecting);
    });
  }, { threshold: 0.08 });
  checkoutObserver.observe(checkout);
}

function navigate(view) {
  if (!VIEW_META[view]) return;
  if (!document.getElementById('modalLayer').hidden) closeModal();
  ui.view = view;
  closeSidebar();
  if (view === 'sales') pruneCart();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- 保存与提示 ---------------- */
function updateSaveIndicator(result, initial = false) {
  const el = document.getElementById('saveIndicator');
  if (!el) return;
  const ok = result?.ok !== false;
  const cloud = Boolean(API_MODE);
  el.classList.toggle('is-saving', !ok);
  if (!ok) {
    el.innerHTML = `<i></i><span>${cloud ? '云端同步失败' : '保存失败'}</span>`;
    return;
  }
  const time = result?.at ? formatTime(result.at) : formatTime(new Date());
  const label = initial
    ? (cloud ? '云端已连接' : '本地已保存')
    : (cloud ? `云端已保存 ${time}` : `已保存 ${time}`);
  el.innerHTML = `<i></i><span>${label}</span>`;
}

function commit() {
  const result = saveState(state);
  updateSaveIndicator(result);
  if (!result.ok) showToast('本地保存失败，请检查浏览器存储权限。', 'error');
  render();
}

function showToast(message, type = 'success') {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'is-error' : type === 'info' ? 'is-info' : ''}`;
  const iconName = type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check-circle';
  toast.innerHTML = `${icon(iconName, 15)}<span>${escapeHTML(message)}</span>`;
  stack.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 220);
  }, 3300);
}

/* ---------------- 侧边栏 ---------------- */
function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const scrim = document.querySelector('.sidebar-scrim');
  if (sidebar) sidebar.classList.add('is-open');
  if (scrim) scrim.classList.add('is-visible');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const scrim = document.querySelector('.sidebar-scrim');
  if (sidebar) sidebar.classList.remove('is-open');
  if (scrim) scrim.classList.remove('is-visible');
}

/* ---------------- 购物车 ---------------- */
function pruneCart() {
  ui.cart = ui.cart.map((item) => {
    const flower = getFlower(item.flowerId);
    if (!flower || flower.active === false || flower.stock <= 0) return null;
    return {
      flowerId: item.flowerId,
      qty: clamp(Math.round(item.qty || 1), 1, flower.stock),
      unitPrice: round2(Math.max(0, item.unitPrice ?? flower.price))
    };
  }).filter(Boolean);
}

function addToCart(id) {
  const flower = getFlower(id);
  if (!flower || flower.active === false) {
    showToast('这枝花已经下架了。', 'error');
    return;
  }
  if (flower.stock <= 0) {
    showToast(`${flower.name} 已售罄，暂时无法开单。`, 'error');
    return;
  }
  const existing = ui.cart.find((item) => item.flowerId === id);
  if (existing) {
    if (existing.qty >= flower.stock) {
      showToast(`库存只剩 ${flower.stock} ${flower.unit}，不能再加了。`, 'info');
      return;
    }
    existing.qty += 1;
  } else {
    ui.cart.push({ flowerId: id, qty: 1, unitPrice: flower.price });
  }
  if (ui.view !== 'sales') ui.view = 'sales';
  if (!document.getElementById('modalLayer').hidden) closeModal();
  render();
  showToast(`${flower.name} 已加入清单。`);
}

function changeCartQty(id, delta) {
  const flower = getFlower(id);
  const item = ui.cart.find((entry) => entry.flowerId === id);
  if (!flower || !item) return;
  if (delta > 0 && item.qty >= flower.stock) {
    showToast(`库存只剩 ${flower.stock} ${flower.unit}。`, 'info');
    return;
  }
  item.qty = clamp(item.qty + delta, 1, flower.stock);
  render();
}

function removeCartItem(id) {
  ui.cart = ui.cart.filter((item) => item.flowerId !== id);
  render();
}

function syncCartFromInputs() {
  document.querySelectorAll('[data-cart-qty]').forEach((input) => {
    const item = ui.cart.find((entry) => entry.flowerId === input.dataset.id);
    const flower = getFlower(input.dataset.id);
    if (!item || !flower) return;
    item.qty = clamp(Math.round(parseNumber(input.value, 1)), 1, flower.stock);
  });
  document.querySelectorAll('[data-cart-price]').forEach((input) => {
    const item = ui.cart.find((entry) => entry.flowerId === input.dataset.id);
    if (!item) return;
    item.unitPrice = round2(Math.max(0, parseNumber(input.value, item.unitPrice)));
  });
}

function checkoutSummaryMarkup(summary) {
  return `<div class="summary-line"><span>商品件数</span><strong>${number(summary.count)} 件</strong></div>
    <div class="summary-line"><span>预估成本</span><strong>${money(summary.cost)}</strong></div>
    <div class="summary-line"><span>预估毛利</span><strong>${money(summary.profit)}</strong></div>
    <div class="summary-line total"><span>应收合计</span><strong>${money(summary.subtotal)}</strong></div>`;
}

function refreshCheckoutTotals() {
  const summary = cartSummary();
  const countEl = document.querySelector('.checkout-count');
  if (countEl) countEl.textContent = String(summary.count);
  const summaryEl = document.querySelector('.checkout-summary');
  if (summaryEl) summaryEl.innerHTML = checkoutSummaryMarkup(summary);
  document.querySelectorAll('[data-line-total]').forEach((el) => {
    const item = summary.details.find((detail) => detail.flower.id === el.dataset.lineTotal);
    if (item) el.innerHTML = `${money(item.subtotal)}<small>小计</small>`;
  });
  const submit = document.getElementById('saleSubmitBtn');
  if (submit) {
    submit.disabled = !summary.details.length;
    submit.innerHTML = `${icon('check-circle', 17)} 完成收款 · ${money(summary.subtotal)}`;
  }
}

/* ---------------- 弹窗 ---------------- */
function openModal({ title, subtitle = '', body = '', footer = '', size = '' }) {
  const layer = document.getElementById('modalLayer');
  const modal = document.getElementById('modal');
  if (!layer || !modal) return;
  lastFocused = document.activeElement;
  modal.className = `modal ${size === 'wide' ? 'is-wide' : size === 'large' ? 'is-large' : ''}`;
  modal.innerHTML = `<div class="modal-head">
      <h2 id="modalTitle">${title}</h2>
      ${subtitle ? `<p>${subtitle}</p>` : ''}
      <button class="modal-close" data-action="close-modal" aria-label="关闭弹窗" title="关闭">${icon('x', 14)}</button>
    </div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}`;
  layer.hidden = false;
  document.body.classList.add('modal-open');
  window.setTimeout(() => {
    const focusTarget = modal.querySelector('[data-autofocus]') ||
      modal.querySelector('input:not([type="hidden"]):not([type="file"]), select, textarea');
    if (focusTarget) focusTarget.focus();
  }, 45);
}

function collabIsEditing() {
  if (document.body.classList.contains('modal-open')) return true;
  if (ui.view === 'sales' && ui.cart.length > 0) return true;
  const active = document.activeElement;
  if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return true;
  return false;
}

window.__collabCanApply = function collabCanApply() {
  return !collabIsEditing() && !(Number(window.__saveInFlight) > 0);
};

window.__collabApplyState = function collabApplyState(remoteState, meta = {}) {
  const normalized = normalizeState(remoteState);
  if (!normalized) return false;
  const incomingRevision = Number(normalized.meta?.revision) || 1;
  const localRevision = Number(state.meta?.revision) || 1;
  if (!meta.force && incomingRevision <= localRevision) return false;
  state = normalized;
  window.__lastSyncedState = JSON.parse(JSON.stringify(state));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) { /* ignore */ }
  render();
  if (meta.actor?.name) {
    showToast(`${meta.actor.name} ${meta.action || '更新了经营数据'}，已实时同步`, 'info');
  } else {
    showToast('协作数据已同步', 'info');
  }
  return true;
};

window.__collabOnConflict = function collabOnConflict(data = {}) {
  if (document.getElementById('modalLayer') && !document.getElementById('modalLayer').hidden) {
    closeModal();
  }
  if (data.state) {
    const normalized = normalizeState(data.state);
    if (normalized) {
      state = normalized;
      window.__lastSyncedState = JSON.parse(JSON.stringify(state));
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (_) { /* ignore */ }
    }
  }
  render();
  const names = Array.isArray(data.conflicts)
    ? data.conflicts.map((item) => item.name).filter(Boolean).slice(0, 2).join('、')
    : '';
  showToast(names ? `${names} 刚被同事修改，已刷新，请重新操作` : '数据已被同事更新，已刷新，请重新操作', 'error');
};

function closeModal() {
  const layer = document.getElementById('modalLayer');
  const modal = document.getElementById('modal');
  if (!layer || layer.hidden) return;
  layer.hidden = true;
  if (modal) modal.innerHTML = '';
  document.body.classList.remove('modal-open');
  pendingConfirm = null;
  if (lastFocused && document.contains(lastFocused)) {
    try { lastFocused.focus({ preventScroll: true }); } catch (_) { /* noop */ }
  }
  lastFocused = null;
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('flower:modal-closed'));
  }, 40);
}

function setFormError(form, message) {
  const el = form.querySelector('.form-error');
  if (!el) {
    showToast(message, 'error');
    return;
  }
  el.textContent = message;
  el.classList.add('is-visible');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function clearFormError(form) {
  const el = form.querySelector('.form-error');
  if (el) {
    el.textContent = '';
    el.classList.remove('is-visible');
  }
}

function openConfirmModal({ title, message, confirmText = '确认', onConfirm, danger = true }) {
  pendingConfirm = onConfirm;
  openModal({
    title,
    subtitle: '这个操作会立即生效',
    body: `<div class="confirm-message">${message}</div>`,
    footer: `<button class="btn btn-ghost" data-action="close-modal" type="button">取消</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm-pending" type="button">${escapeHTML(confirmText)}</button>`
  });
}

/* ---------------- 花卉表单 ---------------- */
function optionList(values, selected) {
  return values.map((value) => `<option value="${escapeHTML(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHTML(value)}</option>`).join('');
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function openFlowerModal(id = null) {
  const flower = id ? getFlower(id) : null;
  if (id && !flower) {
    showToast('没有找到这枝花。', 'error');
    return;
  }
  const editing = Boolean(flower);
  const categoryValues = uniqueValues([...CATEGORIES, flower?.category]);
  const colorValues = uniqueValues([...COLORS, flower?.color]);
  const unitValues = uniqueValues([...UNITS, flower?.unit]);
  const suppliers = uniqueValues(state.flowers.map((f) => f.supplier));
  const title = editing ? '编辑花卉资料' : '新增花卉';
  const subtitle = editing ? '修改基础资料、售价或成本；库存数量请通过“调整库存”变更。' : '录入花材信息、成本与售价，建立第一笔库存。';

  const body = `<form id="flowerForm" class="modal-form" novalidate>
    <input type="hidden" name="id" value="${editing ? escapeHTML(flower.id) : ''}">
    <div class="form-error"></div>
    <div class="form-grid">
      <div class="form-section-title">基本信息</div>
      <div class="field half">
        <label for="flowerName">花卉名称 <span class="req">*</span></label>
        <input id="flowerName" name="name" type="text" value="${editing ? escapeHTML(flower.name) : ''}" placeholder="例如：自由精神玫瑰" maxlength="40" required data-autofocus>
      </div>
      <div class="field half">
        <label for="flowerVariety">品种 / 别名</label>
        <input id="flowerVariety" name="variety" type="text" value="${editing ? escapeHTML(flower.variety) : ''}" placeholder="例如：自由精神" maxlength="30">
      </div>
      <div class="field half">
        <label for="flowerCategory">品类</label>
        <select id="flowerCategory" name="category">${optionList(categoryValues, editing ? flower.category : '玫瑰')}</select>
      </div>
      <div class="field half">
        <label for="flowerColor">颜色</label>
        <select id="flowerColor" name="color">${optionList(colorValues, editing ? flower.color : '粉色')}</select>
      </div>
      <div class="field half">
        <label for="flowerGrade">等级</label>
        <select id="flowerGrade" name="grade">${optionList(uniqueValues([...GRADES, flower?.grade]), editing ? flower.grade : 'A')}</select>
      </div>
      <div class="field half">
        <label for="flowerUnit">计量单位</label>
        <select id="flowerUnit" name="unit">${optionList(unitValues, editing ? flower.unit : '枝')}</select>
      </div>
      <div class="field half">
        <label for="flowerSupplier">供应商</label>
        <input id="flowerSupplier" name="supplier" type="text" list="supplierList" value="${editing ? escapeHTML(flower.supplier) : ''}" placeholder="例如：云岭花材" maxlength="40">
        <datalist id="supplierList">${suppliers.map((s) => `<option value="${escapeHTML(s)}"></option>`).join('')}</datalist>
      </div>
      <div class="field half">
        <label for="flowerLocation">存放位置</label>
        <input id="flowerLocation" name="location" type="text" value="${editing ? escapeHTML(flower.location) : ''}" placeholder="例如：冷藏柜 A1" maxlength="30">
      </div>

      <div class="form-section-title">价格与库存</div>
      <div class="field half">
        <label for="flowerCost">进货成本（元）</label>
        <div class="input-affix"><span>¥</span><input id="flowerCost" name="cost" type="number" min="0" step="0.01" value="${editing ? flower.cost : ''}" placeholder="0.00" inputmode="decimal"></div>
      </div>
      <div class="field half">
        <label for="flowerPrice">销售单价（元）<span class="req">*</span></label>
        <div class="input-affix"><span>¥</span><input id="flowerPrice" name="price" type="number" min="0.01" step="0.01" value="${editing ? flower.price : ''}" placeholder="0.00" inputmode="decimal" required></div>
      </div>
      ${editing ? '' : `<div class="field half">
        <label for="flowerStock">初始库存</label>
        <input id="flowerStock" name="stock" type="number" min="0" step="1" value="" placeholder="0" inputmode="numeric">
      </div>`}
      <div class="field half">
        <label for="flowerMinStock">安全库存</label>
        <input id="flowerMinStock" name="minStock" type="number" min="0" step="1" value="${editing ? flower.minStock : '10'}" inputmode="numeric">
        <span class="hint">低于该数量时提醒补货</span>
      </div>
      <div class="field full">
        <label for="flowerNote">备注</label>
        <textarea id="flowerNote" name="note" rows="3" maxlength="200" placeholder="花期、养护、搭配建议等">${editing ? escapeHTML(flower.note) : ''}</textarea>
      </div>
      <div class="margin-preview full" id="flowerMarginPreview">
        <span>预计毛利率</span><strong>—</strong>
      </div>
      ${editing ? '<div class="form-note full">库存数量请使用“调整库存”中的补货、报损或盘点修正，以保留库存流水。</div>' : '<div class="form-note full">初始库存会生成一条“期初入库”流水；之后可用补货、报损或盘点修正来维护。</div>'}
    </div>
  </form>`;

  openModal({
    title,
    subtitle,
    body,
    footer: `<span class="foot-note">${editing ? '修改价格与成本会写入调价记录' : '数据保存在当前浏览器本地'}</span>
      <button class="btn btn-ghost" data-action="close-modal" type="button">取消</button>
      <button class="btn btn-primary" type="submit" form="flowerForm">${editing ? '保存修改' : '保存花卉'}</button>`
  });
  updateFlowerMarginPreview();
}

function updateFlowerMarginPreview() {
  const costEl = document.getElementById('flowerCost');
  const priceEl = document.getElementById('flowerPrice');
  const preview = document.getElementById('flowerMarginPreview');
  if (!costEl || !priceEl || !preview) return;
  const cost = Math.max(0, parseNumber(costEl.value));
  const price = Math.max(0, parseNumber(priceEl.value));
  const margin = grossMargin(price, cost);
  preview.innerHTML = `<span>预计毛利率</span><strong style="color:${margin < 0.2 ? 'var(--red)' : margin < 0.35 ? '#9b722e' : 'var(--green)'}">${price > 0 ? percent(margin, 1) : '—'}</strong>`;
}

function handleFlowerSubmit(form) {
  clearFormError(form);
  const fd = new FormData(form);
  const id = String(fd.get('id') || '');
  const name = String(fd.get('name') || '').trim();
  const price = round2(parseNumber(fd.get('price')));
  const cost = round2(parseNumber(fd.get('cost')));
  const minStock = Math.max(0, Math.round(parseNumber(fd.get('minStock'))));
  const stock = Math.max(0, Math.round(parseNumber(fd.get('stock'))));
  const category = String(fd.get('category') || '其他');
  const color = String(fd.get('color') || '');
  const variety = String(fd.get('variety') || '').trim();
  const grade = String(fd.get('grade') || 'A');
  const unit = String(fd.get('unit') || '枝');
  const supplier = String(fd.get('supplier') || '').trim();
  const location = String(fd.get('location') || '').trim();
  const note = String(fd.get('note') || '').trim();

  if (!name) {
    setFormError(form, '请填写花卉名称。');
    return;
  }
  if (price <= 0) {
    setFormError(form, '销售单价必须大于 0。');
    return;
  }
  if (cost < 0) {
    setFormError(form, '进货成本不能为负数。');
    return;
  }

  if (id) {
    const flower = getFlower(id);
    if (!flower) {
      setFormError(form, '找不到这枝花，请刷新页面重试。');
      return;
    }
    const oldPrice = flower.price;
    const oldCost = flower.cost;
    Object.assign(flower, {
      name, variety, category, color, grade, unit, price, cost,
      minStock, supplier, location, note
    });
    if (Math.abs(oldPrice - price) > 0.001 || Math.abs(oldCost - cost) > 0.001) {
      state.priceHistory.push({
        id: uid('ph'),
        flowerId: flower.id,
        date: new Date().toISOString(),
        oldPrice,
        newPrice: price,
        oldCost,
        newCost: cost,
        reason: '编辑资料更新价格 / 成本'
      });
    }
    closeModal();
    commit();
    showToast(`${name} 的资料已更新。`);
    return;
  }

  const flower = {
    id: uid('f'),
    name,
    variety,
    category,
    color,
    grade,
    unit,
    cost,
    price,
    stock,
    minStock,
    supplier,
    location,
    note,
    createdAt: new Date().toISOString(),
    restockedAt: new Date().toISOString(),
    active: true
  };
  state.flowers.unshift(flower);
  if (stock > 0) {
    state.movements.unshift({
      id: uid('m'),
      flowerId: flower.id,
      type: 'initial',
      change: stock,
      before: 0,
      after: stock,
      unitCost: cost,
      note: '新增花卉，期初入库',
      date: new Date().toISOString(),
      orderId: null
    });
  }
  closeModal();
  commit();
  showToast(`${name} 已加入花卉库。`);
}

/* ---------------- 库存调整 ---------------- */
function openAdjustModal(id) {
  const flower = getFlower(id);
  if (!flower) {
    showToast('没有找到这枝花。', 'error');
    return;
  }
  const body = `<form id="adjustForm" class="modal-form" novalidate>
    <input type="hidden" name="flowerId" value="${escapeHTML(flower.id)}">
    <div class="form-error"></div>
    <div class="adjust-current">
      <span>当前库存 · ${escapeHTML(flower.name)}</span>
      <strong>${number(flower.stock)} <small style="font-family:var(--sans);font-size:11px;color:var(--muted)">${escapeHTML(flower.unit)}</small></strong>
    </div>
    <div class="radio-tiles" role="radiogroup" aria-label="库存调整类型">
      <label class="radio-tile"><input type="radio" name="adjustType" value="in" checked><span>${icon('plus', 14)} 补货入库</span></label>
      <label class="radio-tile"><input type="radio" name="adjustType" value="loss"><span>${icon('minus', 14)} 损耗出库</span></label>
      <label class="radio-tile"><input type="radio" name="adjustType" value="count"><span>${icon('refresh', 14)} 盘点修正</span></label>
    </div>

    <div class="adjust-mode-panel" data-mode="in">
      <div class="form-grid">
        <div class="field half">
          <label for="inQty">入库数量（${escapeHTML(flower.unit)}）</label>
          <input id="inQty" name="inQty" type="number" min="1" step="1" value="10" inputmode="numeric" data-autofocus>
        </div>
        <div class="field half">
          <label for="inUnitCost">本次进货单价</label>
          <div class="input-affix"><span>¥</span><input id="inUnitCost" name="inUnitCost" type="number" min="0" step="0.01" value="${flower.cost}" inputmode="decimal"></div>
        </div>
      </div>
      <div class="form-note">补货后单位成本会按加权平均自动更新，并记录一条成本变动。当前成本 ${money(flower.cost)} / ${escapeHTML(flower.unit)}。</div>
    </div>

    <div class="adjust-mode-panel" data-mode="loss" hidden>
      <div class="form-grid">
        <div class="field half">
          <label for="lossQty">损耗数量（${escapeHTML(flower.unit)}）</label>
          <input id="lossQty" name="lossQty" type="number" min="1" step="1" value="1" inputmode="numeric">
        </div>
        <div class="field half">
          <label for="lossReason">损耗原因</label>
          <select id="lossReason" name="lossReason">
            <option>花材枯萎</option>
            <option>运输折损</option>
            <option>滞销报损</option>
            <option>其他损耗</option>
          </select>
        </div>
      </div>
      <div class="form-note">损耗会按当前单位成本计入经营损耗，直接影响净利润。</div>
    </div>

    <div class="adjust-mode-panel" data-mode="count" hidden>
      <div class="form-grid">
        <div class="field half">
          <label for="actualStock">盘点后实际库存（${escapeHTML(flower.unit)}）</label>
          <input id="actualStock" name="actualStock" type="number" min="0" step="1" value="${flower.stock}" inputmode="numeric">
        </div>
      </div>
      <div class="form-note">系统会按盘点数直接修正库存。盘亏部分会计入损耗成本，盘盈则生成盘点调整记录。</div>
    </div>

    <div class="field">
      <label for="adjustNote">备注</label>
      <input id="adjustNote" name="note" type="text" maxlength="100" placeholder="例如：周一早市补货 / 补损登记">
    </div>
  </form>`;

  openModal({
    title: '调整库存',
    subtitle: '补货、报损或盘点修正都会留下可回溯的库存流水。',
    body,
    footer: `<span class="foot-note">当前库存 ${number(flower.stock)} ${escapeHTML(flower.unit)}</span>
      <button class="btn btn-ghost" data-action="close-modal" type="button">取消</button>
      <button class="btn btn-primary" type="submit" form="adjustForm" id="adjustSubmit">确认入库</button>`
  });
  syncAdjustForm(document.getElementById('adjustForm'));
}

function syncAdjustForm(form) {
  if (!form) return;
  const checked = form.querySelector('input[name="adjustType"]:checked');
  const mode = checked ? checked.value : 'in';
  form.querySelectorAll('.adjust-mode-panel').forEach((panel) => {
    panel.hidden = panel.dataset.mode !== mode;
  });
  const submit = document.getElementById('adjustSubmit');
  if (submit) {
    submit.textContent = mode === 'in' ? '确认入库' : mode === 'loss' ? '确认报损' : '确认盘点';
  }
  const qty = form.querySelector('[data-mode="in"] [data-autofocus]');
  if (mode === 'in' && qty && document.activeElement && !form.contains(document.activeElement)) {
    qty.focus();
  }
}

function handleAdjustSubmit(form) {
  clearFormError(form);
  const fd = new FormData(form);
  const id = String(fd.get('flowerId') || '');
  const flower = getFlower(id);
  const mode = String(fd.get('adjustType') || 'in');
  const note = String(fd.get('note') || '').trim();
  if (!flower) {
    setFormError(form, '找不到这枝花，请刷新后重试。');
    return;
  }

  if (mode === 'in') {
    const qty = Math.round(parseNumber(fd.get('inQty')));
    const unitCost = round2(parseNumber(fd.get('inUnitCost')));
    if (qty <= 0) {
      setFormError(form, '入库数量需要大于 0。');
      return;
    }
    if (unitCost < 0) {
      setFormError(form, '进货单价不能为负数。');
      return;
    }
    const before = flower.stock;
    const after = before + qty;
    const oldCost = flower.cost;
    const newCost = round2(((before * oldCost) + (qty * unitCost)) / Math.max(1, after));
    flower.stock = after;
    flower.cost = newCost;
    flower.restockedAt = new Date().toISOString();
    state.movements.unshift({
      id: uid('m'),
      flowerId: flower.id,
      type: 'in',
      change: qty,
      before,
      after,
      unitCost,
      note: note || '补货入库',
      date: new Date().toISOString(),
      orderId: null
    });
    if (Math.abs(oldCost - newCost) > 0.001) {
      state.priceHistory.push({
        id: uid('ph'),
        flowerId: flower.id,
        date: new Date().toISOString(),
        oldPrice: flower.price,
        newPrice: flower.price,
        oldCost,
        newCost,
        reason: note ? `补货更新成本 · ${note}` : '补货更新成本（加权平均）'
      });
    }
    closeModal();
    commit();
    showToast(`${flower.name} 已入库 ${number(qty)} ${flower.unit}，库存更新为 ${number(after)}。`);
    return;
  }

  if (mode === 'loss') {
    const qty = Math.round(parseNumber(fd.get('lossQty')));
    const reason = String(fd.get('lossReason') || '其他损耗');
    if (qty <= 0) {
      setFormError(form, '损耗数量需要大于 0。');
      return;
    }
    if (qty > flower.stock) {
      setFormError(form, `损耗数量不能超过当前库存（${flower.stock} ${flower.unit}）。`);
      return;
    }
    const before = flower.stock;
    const after = before - qty;
    flower.stock = after;
    state.movements.unshift({
      id: uid('m'),
      flowerId: flower.id,
      type: 'loss',
      change: -qty,
      before,
      after,
      unitCost: flower.cost,
      note: note ? `${reason} · ${note}` : reason,
      date: new Date().toISOString(),
      orderId: null
    });
    closeModal();
    commit();
    showToast(`${flower.name} 已报损 ${number(qty)} ${flower.unit}，损耗成本 ${money(qty * flower.cost)}。`, 'info');
    return;
  }

  const actual = Math.round(parseNumber(fd.get('actualStock'), flower.stock));
  if (actual < 0) {
    setFormError(form, '实际库存不能为负数。');
    return;
  }
  const before = flower.stock;
  const diff = actual - before;
  if (diff === 0) {
    setFormError(form, '盘点数量与当前库存一致，无需调整。');
    return;
  }
  flower.stock = actual;
  state.movements.unshift({
    id: uid('m'),
    flowerId: flower.id,
    type: diff < 0 ? 'loss' : 'count',
    change: diff,
    before,
    after: actual,
    unitCost: diff < 0 ? flower.cost : 0,
    note: diff < 0
      ? `盘点盘亏${note ? ` · ${note}` : ''}`
      : `盘点盘盈${note ? ` · ${note}` : ''}`,
    date: new Date().toISOString(),
    orderId: null
  });
  closeModal();
  commit();
  showToast(`盘点完成：${flower.name} 库存由 ${number(before)} 调整为 ${number(actual)} ${flower.unit}。`);
}

/* ---------------- 调价 ---------------- */
function openPriceModal(id) {
  const flower = getFlower(id);
  if (!flower) {
    showToast('没有找到这枝花。', 'error');
    return;
  }
  const body = `<form id="priceForm" class="modal-form" novalidate>
    <input type="hidden" name="flowerId" value="${escapeHTML(flower.id)}">
    <div class="form-error"></div>
    <div class="detail-hero" style="padding-bottom:14px">
      ${flowerAvatar(flower, 'is-lg')}
      <div class="detail-title">
        <h3 style="font-size:18px">${escapeHTML(flower.name)}</h3>
        <p>当前售价 ${money(flower.price)} / ${escapeHTML(flower.unit)} · 成本 ${money(flower.cost)}</p>
      </div>
    </div>
    <div class="form-grid">
      <div class="field half">
        <label for="priceNewPrice">新销售单价（元）</label>
        <div class="input-affix"><span>¥</span><input id="priceNewPrice" name="price" type="number" min="0.01" step="0.01" value="${flower.price}" inputmode="decimal" data-autofocus></div>
      </div>
      <div class="field half">
        <label for="priceNewCost">新单位成本（元）</label>
        <div class="input-affix"><span>¥</span><input id="priceNewCost" name="cost" type="number" min="0" step="0.01" value="${flower.cost}" inputmode="decimal"></div>
      </div>
      <div class="field full">
        <label for="priceReason">调价原因</label>
        <input id="priceReason" name="reason" type="text" list="priceReasonList" maxlength="60" placeholder="例如：节庆需求上涨 / 供应商调价">
        <datalist id="priceReasonList">
          <option value="节庆需求上涨"></option>
          <option value="成本变化"></option>
          <option value="品质升级"></option>
          <option value="促销调整"></option>
          <option value="同类市场价参考"></option>
        </datalist>
      </div>
      <div class="margin-preview full" id="priceMarginPreview">
        <span>调整后毛利率</span><strong>—</strong>
      </div>
    </div>
    <div class="form-note">调价会写入价格浮动历史。若仅成本变化、售价不变，也会保留一条成本变动记录。</div>
  </form>`;

  openModal({
    title: '调整价格',
    subtitle: '价格变化会保留时间与原因，方便回看定价决策。',
    body,
    footer: `<span class="foot-note">当前毛利率 ${percent(grossMargin(flower.price, flower.cost), 1)}</span>
      <button class="btn btn-ghost" data-action="close-modal" type="button">取消</button>
      <button class="btn btn-primary" type="submit" form="priceForm">保存调价</button>`
  });
  updatePriceMarginPreview();
}

function updatePriceMarginPreview() {
  const costEl = document.getElementById('priceNewCost');
  const priceEl = document.getElementById('priceNewPrice');
  const preview = document.getElementById('priceMarginPreview');
  if (!costEl || !priceEl || !preview) return;
  const cost = Math.max(0, parseNumber(costEl.value));
  const price = Math.max(0, parseNumber(priceEl.value));
  const margin = grossMargin(price, cost);
  preview.innerHTML = `<span>调整后毛利率</span><strong style="color:${margin < 0.2 ? 'var(--red)' : margin < 0.35 ? '#9b722e' : 'var(--green)'}">${price > 0 ? percent(margin, 1) : '—'}</strong>`;
}

function handlePriceSubmit(form) {
  clearFormError(form);
  const fd = new FormData(form);
  const flower = getFlower(String(fd.get('flowerId') || ''));
  if (!flower) {
    setFormError(form, '找不到这枝花，请刷新后重试。');
    return;
  }
  const newPrice = round2(parseNumber(fd.get('price')));
  const newCost = round2(parseNumber(fd.get('cost')));
  const reason = String(fd.get('reason') || '').trim() || '调整价格';
  if (newPrice <= 0) {
    setFormError(form, '销售单价必须大于 0。');
    return;
  }
  if (newCost < 0) {
    setFormError(form, '单位成本不能为负数。');
    return;
  }
  if (Math.abs(newPrice - flower.price) < 0.001 && Math.abs(newCost - flower.cost) < 0.001) {
    setFormError(form, '售价和成本都没有变化，无需保存。');
    return;
  }
  const oldPrice = flower.price;
  const oldCost = flower.cost;
  flower.price = newPrice;
  flower.cost = newCost;
  state.priceHistory.push({
    id: uid('ph'),
    flowerId: flower.id,
    date: new Date().toISOString(),
    oldPrice,
    newPrice,
    oldCost,
    newCost,
    reason
  });
  closeModal();
  commit();
  showToast(`${flower.name} 售价已由 ${money(oldPrice)} 调整为 ${money(newPrice)}。`);
}

/* ---------------- 花卉档案 ---------------- */
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

/* ---------------- 销售与订单 ---------------- */
function handleSaleSubmit(form) {
  clearFormError(form);
  syncCartFromInputs();
  const summary = cartSummary();
  const fd = new FormData(form);
  const customer = String(fd.get('customer') || '').trim() || '散客';
  const payment = String(fd.get('payment') || '微信');
  const dateRaw = String(fd.get('date') || dateInputValue());
  const note = String(fd.get('note') || '').trim();

  if (!summary.details.length) {
    setFormError(form, '清单为空，请先选择花卉。');
    return;
  }
  if (!dateRaw) {
    setFormError(form, '请选择开单日期。');
    return;
  }
  for (const item of summary.details) {
    const flower = getFlower(item.flower.id);
    if (!flower || flower.active === false) {
      setFormError(form, `${item.flower.name} 已下架，请从清单中移除。`);
      return;
    }
    if (item.qty > flower.stock) {
      setFormError(form, `${flower.name} 库存不足，当前仅剩 ${flower.stock} ${flower.unit}。`);
      return;
    }
    if (item.unitPrice <= 0) {
      setFormError(form, `${flower.name} 的单价需要大于 0。`);
      return;
    }
  }

  const selected = new Date(`${dateRaw}T12:00:00`);
  if (Number.isNaN(selected.getTime())) {
    setFormError(form, '开单日期格式不正确。');
    return;
  }
  const orderDate = localDateKey(selected) === localDateKey(new Date()) ? new Date() : selected;
  const lines = summary.details.map((item) => ({
    flowerId: item.flower.id,
    name: item.flower.name,
    variety: item.flower.variety,
    unit: item.flower.unit,
    qty: item.qty,
    unitPrice: item.unitPrice,
    cost: item.flower.cost,
    subtotal: round2(item.qty * item.unitPrice)
  }));
  const total = round2(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const cost = round2(lines.reduce((sum, line) => sum + line.cost * line.qty, 0));
  const order = {
    id: uid('o'),
    no: nextOrderNo(orderDate),
    date: orderDate.toISOString(),
    customer,
    payment,
    note,
    lines,
    total,
    cost,
    profit: round2(total - cost),
    status: 'completed',
    refundedAt: null
  };

  summary.details.forEach((item) => {
    const flower = getFlower(item.flower.id);
    const before = flower.stock;
    flower.stock = before - item.qty;
    state.movements.unshift({
      id: uid('m'),
      flowerId: flower.id,
      type: 'sale',
      change: -item.qty,
      before,
      after: flower.stock,
      unitCost: flower.cost,
      note: `销售出库 · ${order.no}`,
      date: order.date,
      orderId: order.id
    });
  });

  state.orders.unshift(order);
  ui.cart = [];
  saveState(state);
  updateSaveIndicator({ ok: true, at: new Date() });
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  openOrderDetail(order.id, { success: true });
  showToast(`订单 ${order.no} 已完成收款。`);
}

function openOrderDetail(id, { success = false } = {}) {
  const order = state.orders.find((o) => o.id === id);
  if (!order) return;
  const refunded = order.status === 'refunded';
  const lines = order.lines.map((line) => `<div class="receipt-line">
      <strong>${escapeHTML(line.name)}${line.variety ? `<span class="flower-meta" style="font-weight:400">${escapeHTML(line.variety)}</span>` : ''}</strong>
      <span>${number(line.qty)} ${escapeHTML(line.unit)}</span>
      <span>${money(line.unitPrice)}</span>
      <span>${money(line.qty * line.unitPrice)}</span>
    </div>`).join('');

  const online = order.source === 'online';
  const body = `${success ? `<div class="success-banner">${icon('check-circle', 17)} 收款完成，库存已自动扣减。可以继续开下一单，或查看本次销售凭证。</div>` : ''}
    ${online ? `<div class="online-order-banner">${icon('shopping-bag', 16)}
      <div><strong>线上花店订单 · ${escapeHTML(order.delivery?.methodLabel || '到店自提')}</strong>
      <span>${escapeHTML(order.customerPhone || '')}${order.delivery?.date ? ` · ${escapeHTML(order.delivery.date)} ${escapeHTML(order.delivery.time || '')}` : ''}</span></div>
      <span class="online-paid">已支付</span></div>` : ''}
    <div class="order-detail-top">
      <div>
        <div class="order-detail-no">${escapeHTML(order.no)}</div>
        <div class="order-detail-date">${formatDateTime(order.date)} · ${escapeHTML(order.customer)} · ${escapeHTML(order.payment)}</div>
      </div>
      <span class="receipt-badge ${refunded ? 'is-refunded' : ''}">${icon(refunded ? 'rotate-ccw' : 'check', 13)} ${refunded ? '已退款' : '已完成'}</span>
    </div>

    <div class="receipt-lines">
      <div class="receipt-line"><span>商品</span><span>数量</span><span>单价</span><span>小计</span></div>
      ${lines}
    </div>

    <div class="receipt-totals">
      <div class="receipt-total-row"><span>商品件数</span><strong>${number(orderUnitCount(order))} 件</strong></div>
      <div class="receipt-total-row"><span>商品成本</span><strong>${money(orderCost(order))}</strong></div>
      <div class="receipt-total-row"><span>毛利</span><strong>${money(orderGrossProfit(order))}</strong></div>
      <div class="receipt-total-row grand"><span>实收合计</span><strong>${money(orderRevenue(order))}</strong></div>
    </div>

    <div class="receipt-meta">
      <div class="detail-box"><span>客户</span><strong style="font-family:var(--sans);font-size:11px">${escapeHTML(order.customer || '散客')}</strong></div>
      <div class="detail-box"><span>收款方式</span><strong style="font-family:var(--sans);font-size:11px">${escapeHTML(order.payment)}</strong></div>
      ${online ? `<div class="detail-box"><span>联系电话</span><strong style="font-family:var(--sans);font-size:11px">${escapeHTML(order.customerPhone || '—')}</strong></div>
      <div class="detail-box"><span>履约方式</span><strong style="font-family:var(--sans);font-size:11px">${escapeHTML(order.delivery?.methodLabel || '—')}</strong></div>
      ${order.delivery?.method === 'delivery' ? `<div class="detail-box is-wide" style="grid-column:1/-1"><span>配送地址</span><strong style="font-family:var(--sans);font-size:11px">${escapeHTML(order.delivery.address || '—')}</strong></div>` : ''}
      <div class="detail-box is-wide" style="grid-column:1/-1"><span>预约时间</span><strong style="font-family:var(--sans);font-size:11px">${escapeHTML(order.delivery?.date || '—')} ${escapeHTML(order.delivery?.time || '')}</strong></div>` : ''}
      <div class="detail-box is-wide" style="grid-column:1/-1"><span>备注</span><strong style="font-family:var(--sans);font-size:11px">${escapeHTML(order.note || '无')}</strong></div>
      ${refunded ? `<div class="detail-box is-wide" style="grid-column:1/-1"><span>退款时间</span><strong style="font-family:var(--sans);font-size:11px">${order.refundedAt ? formatDateTime(order.refundedAt) : '—'}</strong></div>` : ''}
    </div>`;

  const footer = success
    ? `<button class="btn btn-ghost" data-action="nav" data-view="sales" type="button">继续开单</button>
       <button class="btn btn-primary" data-action="nav" data-view="records" type="button">查看销售记录</button>`
    : `<button class="btn btn-ghost" data-action="close-modal" type="button">关闭</button>
       ${refunded ? '' : `<button class="btn btn-danger" data-action="refund-order" data-id="${order.id}" type="button">整单退款</button>`}`;

  openModal({
    title: success ? '收款成功' : '订单详情',
    subtitle: success ? '本次销售已完成，库存和经营数据已同步更新。' : '销售凭证与退款入口',
    body,
    footer,
    size: 'wide'
  });
}

function confirmRefundOrder(id) {
  const order = state.orders.find((o) => o.id === id);
  if (!order || order.status === 'refunded') return;
  openConfirmModal({
    title: '确认整单退款？',
    message: `<p class="confirm-message">确定要为订单 <strong>${escapeHTML(order.no)}</strong>（${money(orderRevenue(order))}）办理退款吗？</p>
      <p class="confirm-note">退款后商品库存会自动恢复，该订单将从营收、毛利和销售分析中剔除。此操作不可撤销。</p>`,
    confirmText: '确认退款',
    danger: true,
    onConfirm: () => {
      const refundDate = new Date().toISOString();
      order.lines.forEach((line) => {
        const flower = getFlower(line.flowerId);
        if (flower) {
          const before = flower.stock;
          flower.stock += line.qty;
          state.movements.unshift({
            id: uid('m'),
            flowerId: flower.id,
            type: 'refund',
            change: line.qty,
            before,
            after: flower.stock,
            unitCost: line.cost,
            note: `退款入库 · ${order.no}`,
            date: refundDate,
            orderId: order.id
          });
        }
      });
      order.status = 'refunded';
      order.refundedAt = refundDate;
      commit();
      showToast(`订单 ${order.no} 已退款，库存已恢复。`, 'info');
    }
  });
}

/* ---------------- 设置与数据 ---------------- */
function openSettingsModal() {
  const body = `<form id="settingsForm" class="modal-form" novalidate>
    <div class="form-error"></div>
    <div class="settings-intro">${icon('database', 16)}<span>所有数据都保存在当前浏览器的本地存储中，不会上传到服务器。更换浏览器或清理浏览器数据前，建议先导出一份备份。</span></div>
    <div class="form-grid">
      <div class="field half">
        <label for="shopName">店铺名称</label>
        <input id="shopName" name="shopName" type="text" value="${escapeHTML(state.settings.shopName)}" maxlength="30" data-autofocus>
      </div>
      <div class="field half">
        <label for="shopOwner">掌柜称呼</label>
        <input id="shopOwner" name="owner" type="text" value="${escapeHTML(state.settings.owner)}" maxlength="20">
      </div>
    </div>

    <div class="modal-section-title">数据管理</div>
    <div class="data-actions">
      <button class="data-action" type="button" data-action="export-json">${icon('download', 15)} 导出完整备份 (.json)</button>
      <button class="data-action" type="button" data-action="export-orders-csv">${icon('file-text', 15)} 导出销售明细 (.csv)</button>
      <button class="data-action" type="button" data-action="import-json">${icon('upload', 15)} 导入备份文件</button>
      <button class="data-action" type="button" data-action="export-inventory-csv">${icon('box', 15)} 导出当前库存 (.csv)</button>
    </div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>

    <div class="modal-section-title">危险操作</div>
    <div class="data-actions">
      <button class="data-action" type="button" data-action="reset-demo">${icon('sparkles', 15)} 恢复演示数据</button>
      <button class="data-action is-danger" type="button" data-action="clear-data">${icon('trash', 15)} 清空全部数据</button>
    </div>
    <div class="form-note">恢复演示数据会用示例花卉和订单覆盖当前内容；清空数据会删除全部花卉、订单与流水，请先导出备份。</div>
  </form>`;

  openModal({
    title: '店铺与数据',
    subtitle: '调整店铺显示信息，或备份、迁移你的经营数据。',
    body,
    footer: `<span class="foot-note">数据版本 v${APP_VERSION}</span>
      <button class="btn btn-ghost" data-action="close-modal" type="button">取消</button>
      <button class="btn btn-primary" type="submit" form="settingsForm">保存设置</button>`
  });
}

function handleSettingsSubmit(form) {
  clearFormError(form);
  const fd = new FormData(form);
  const shopName = String(fd.get('shopName') || '').trim();
  const owner = String(fd.get('owner') || '').trim();
  if (!shopName) {
    setFormError(form, '店铺名称不能为空。');
    return;
  }
  state.settings.shopName = shopName;
  state.settings.owner = owner || '花掌柜';
  closeModal();
  commit();
  showToast('店铺设置已更新。');
}

/* ---------------- 导入 / 导出 ---------------- */
function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  let text = String(value ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportJSON() {
  const payload = Object.assign({}, state, {
    exportedAt: new Date().toISOString(),
    app: '花间集 · 花卉经营工作台'
  });
  downloadFile(`花间集备份_${localDateKey(new Date()).replace(/-/g, '')}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  showToast('完整数据备份已导出。');
}

function exportOrdersCSV() {
  const orders = filteredOrders();
  const header = ['订单号', '日期', '客户', '商品明细', '数量', '实收金额', '商品成本', '毛利', '收款方式', '状态', '备注'];
  const rows = orders.map((order) => [
    order.no,
    formatDateTime(order.date),
    order.customer,
    order.lines.map((line) => `${line.name}×${line.qty}${line.unit}`).join('；'),
    orderUnitCount(order),
    orderRevenue(order).toFixed(2),
    orderCost(order).toFixed(2),
    orderGrossProfit(order).toFixed(2),
    order.payment,
    order.status === 'refunded' ? '已退款' : '已完成',
    order.note
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  downloadFile(`销售明细_${localDateKey(new Date()).replace(/-/g, '')}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
  showToast(`已导出 ${orders.length} 笔销售记录。`);
}

function exportInventoryCSV() {
  const list = filteredFlowers();
  const header = ['花卉', '品类', '品种', '颜色', '等级', '单位', '剩余数量', '安全库存', '单位成本', '销售单价', '毛利率', '库存成本', '供应商', '存放位置', '库龄(天)'];
  const rows = list.map((f) => [
    f.name,
    f.category,
    f.variety,
    f.color,
    f.grade,
    f.unit,
    f.stock,
    f.minStock,
    f.cost.toFixed(2),
    f.price.toFixed(2),
    percent(grossMargin(f.price, f.cost), 1),
    (f.stock * f.cost).toFixed(2),
    f.supplier,
    f.location,
    shelfDays(f)
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  downloadFile(`花卉库存_${localDateKey(new Date()).replace(/-/g, '')}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
  showToast(`已导出 ${list.length} 种花卉库存。`);
}

async function importJSONFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const normalized = normalizeState(parsed);
    if (!normalized) throw new Error('备份文件缺少花卉或订单数据');
    state = normalized;
    ui.cart = [];
    ui.priceFlowerId = null;
    saveState(state);
    updateSaveIndicator({ ok: true, at: new Date() });
    closeModal();
    render();
    showToast('备份已导入，数据恢复完成。');
  } catch (error) {
    console.warn(error);
    showToast(`导入失败：${error.message || '文件格式不正确'}`, 'error');
  }
}

function resetDemoData() {
  openConfirmModal({
    title: '恢复演示数据？',
    message: '<p class="confirm-message">当前所有花卉、订单、价格记录和库存流水都会被<strong>示例数据覆盖</strong>。</p><p class="confirm-note">这个操作不可撤销，建议先导出备份。</p>',
    confirmText: '恢复演示数据',
    danger: true,
    onConfirm: () => {
      state = createSeedState();
      ui.cart = [];
      ui.priceFlowerId = null;
      saveState(state);
      updateSaveIndicator({ ok: true, at: new Date() });
      render();
      showToast('演示数据已恢复。');
    }
  });
}

function clearAllData() {
  openConfirmModal({
    title: '清空全部数据？',
    message: '<p class="confirm-message">花卉、销售订单、调价记录和库存流水都会被<strong>永久删除</strong>。</p><p class="confirm-note">店铺名称会保留。这个操作不可撤销，建议先导出完整备份。</p>',
    confirmText: '确认清空',
    danger: true,
    onConfirm: () => {
      const keep = { shopName: state.settings.shopName, owner: state.settings.owner };
      state = createEmptyState(keep);
      ui.cart = [];
      ui.priceFlowerId = null;
      saveState(state);
      updateSaveIndicator({ ok: true, at: new Date() });
      render();
      showToast('全部数据已清空，可以重新开始记录。', 'info');
    }
  });
}

/* ---------------- 局部刷新 ---------------- */
function refreshInventoryTable() {
  const wrap = document.getElementById('inventoryTableWrap');
  if (!wrap) return;
  wrap.innerHTML = inventoryTableInner();
  const active = activeFlowers().length;
  const count = document.getElementById('inventoryCount');
  if (count) count.textContent = `${filteredFlowers().length} / ${active} 种`;
  toggleClearButton('inventory', Boolean(ui.invSearch));
}

function refreshSaleProducts() {
  const wrap = document.getElementById('saleProducts');
  if (!wrap) return;
  wrap.innerHTML = saleProductsInner();
  toggleClearButton('sale', Boolean(ui.saleSearch));
}

function refreshRecordsTable() {
  const wrap = document.getElementById('recordsTableWrap');
  if (!wrap) return;
  wrap.innerHTML = recordsTableInner();
  toggleClearButton('records', Boolean(ui.recordSearch));
}

function toggleClearButton(target, visible) {
  const button = document.querySelector(`[data-action="clear-search"][data-target="${target}"]`);
  if (button) button.hidden = !visible;
}

/* ---------------- 事件 ---------------- */
function bindEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('input', handleInput);
  document.addEventListener('change', handleChange);
  document.addEventListener('keydown', handleKeydown);
}

function handleClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (!action) return;
  if (target.tagName === 'A') event.preventDefault();

  switch (action) {
    case 'toggle-sidebar':
      document.getElementById('sidebar')?.classList.contains('is-open') ? closeSidebar() : openSidebar();
      break;
    case 'close-sidebar':
      closeSidebar();
      break;
    case 'nav':
      navigate(target.dataset.view);
      break;
    case 'goto-inventory':
      ui.invStatus = target.dataset.filter || 'all';
      ui.invSearch = '';
      ui.invCategory = 'all';
      navigate('inventory');
      break;
    case 'open-add-flower':
      openFlowerModal();
      break;
    case 'edit-flower':
      openFlowerModal(target.dataset.id);
      break;
    case 'view-flower':
      openFlowerDetail(target.dataset.id);
      break;
    case 'adjust-stock':
      openAdjustModal(target.dataset.id);
      break;
    case 'change-price':
      openPriceModal(target.dataset.id);
      break;
    case 'quick-sale':
      addToCart(target.dataset.id);
      break;
    case 'add-to-cart':
      addToCart(target.dataset.id);
      break;
    case 'remove-cart':
      removeCartItem(target.dataset.id);
      break;
    case 'cart-inc':
      changeCartQty(target.dataset.id, 1);
      break;
    case 'cart-dec':
      changeCartQty(target.dataset.id, -1);
      break;
    case 'scroll-checkout':
      document.getElementById('checkoutCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    case 'view-order':
      openOrderDetail(target.dataset.id);
      break;
    case 'refund-order':
      confirmRefundOrder(target.dataset.id);
      break;
    case 'delete-flower': {
      const flower = getFlower(target.dataset.id);
      if (!flower) break;
      openConfirmModal({
        title: '删除这枝花？',
        message: `<p class="confirm-message">确定要删除 <strong>${escapeHTML(flower.name)}</strong> 吗？</p><p class="confirm-note">当前库存、库存流水和调价记录会一起移除；历史销售订单仍会保留，但无法再从花名查看档案。</p>`,
        confirmText: '删除花卉',
        danger: true,
        onConfirm: () => {
          state.flowers = state.flowers.filter((f) => f.id !== flower.id);
          state.movements = state.movements.filter((m) => m.flowerId !== flower.id);
          state.priceHistory = state.priceHistory.filter((p) => p.flowerId !== flower.id);
          ui.cart = ui.cart.filter((item) => item.flowerId !== flower.id);
          if (ui.priceFlowerId === flower.id) ui.priceFlowerId = null;
          commit();
          showToast(`${flower.name} 已删除。`, 'info');
        }
      });
      break;
    }
    case 'close-modal':
      closeModal();
      break;
    case 'confirm-pending': {
      const fn = pendingConfirm;
      pendingConfirm = null;
      closeModal();
      if (typeof fn === 'function') fn();
      break;
    }
    case 'open-settings':
      openSettingsModal();
      break;
    case 'export-json':
      exportJSON();
      break;
    case 'export-orders-csv':
      exportOrdersCSV();
      break;
    case 'export-inventory-csv':
      exportInventoryCSV();
      break;
    case 'import-json':
      document.getElementById('importFile')?.click();
      break;
    case 'reset-demo':
      resetDemoData();
      break;
    case 'clear-data':
      clearAllData();
      break;
    case 'clear-search':
      clearSearch(target.dataset.target);
      break;
    case 'reset-inventory-filters':
      ui.invSearch = '';
      ui.invCategory = 'all';
      ui.invStatus = 'all';
      ui.invSort = 'default';
      render();
      break;
    case 'set-chart-range':
      ui.chartRange = Number(target.dataset.value) === 30 ? 30 : 7;
      render();
      break;
    case 'set-finance-range':
      ui.financeRange = target.dataset.value || '30';
      render();
      break;
    default:
      console.warn('未处理的操作', action);
  }
}

function clearSearch(target) {
  if (target === 'inventory') {
    ui.invSearch = '';
    render();
  } else if (target === 'sale') {
    ui.saleSearch = '';
    render();
  } else if (target === 'records') {
    ui.recordSearch = '';
    render();
  }
}

function handleSubmit(event) {
  const form = event.target;
  if (!form) return;
  const formId = form.getAttribute('id') || '';
  const handled = ['flowerForm', 'adjustForm', 'priceForm', 'saleForm', 'settingsForm'];
  if (!handled.includes(formId)) return;
  event.preventDefault();
  if (formId === 'flowerForm') handleFlowerSubmit(form);
  else if (formId === 'adjustForm') handleAdjustSubmit(form);
  else if (formId === 'priceForm') handlePriceSubmit(form);
  else if (formId === 'saleForm') handleSaleSubmit(form);
  else if (formId === 'settingsForm') handleSettingsSubmit(form);
}

function handleInput(event) {
  const target = event.target;
  if (target.id === 'invSearch') {
    ui.invSearch = target.value;
    refreshInventoryTable();
    return;
  }
  if (target.id === 'saleSearch') {
    ui.saleSearch = target.value;
    refreshSaleProducts();
    return;
  }
  if (target.id === 'recordSearch') {
    ui.recordSearch = target.value;
    refreshRecordsTable();
    return;
  }
  if (target.id === 'flowerCost' || target.id === 'flowerPrice') {
    updateFlowerMarginPreview();
    return;
  }
  if (target.id === 'priceNewCost' || target.id === 'priceNewPrice') {
    updatePriceMarginPreview();
    return;
  }
  if (target.matches('[data-cart-qty]')) {
    const flower = getFlower(target.dataset.id);
    const item = ui.cart.find((entry) => entry.flowerId === target.dataset.id);
    if (!flower || !item) return;
    item.qty = clamp(Math.round(parseNumber(target.value, 1)), 1, flower.stock);
    refreshCheckoutTotals();
    return;
  }
  if (target.matches('[data-cart-price]')) {
    const item = ui.cart.find((entry) => entry.flowerId === target.dataset.id);
    if (!item) return;
    item.unitPrice = round2(Math.max(0, parseNumber(target.value, item.unitPrice)));
    refreshCheckoutTotals();
  }
}

function handleChange(event) {
  const target = event.target;
  if (target.id === 'invCategory') {
    ui.invCategory = target.value;
    render();
    return;
  }
  if (target.id === 'invStatus') {
    ui.invStatus = target.value;
    render();
    return;
  }
  if (target.id === 'invSort') {
    ui.invSort = target.value;
    render();
    return;
  }
  if (target.id === 'saleCategory') {
    ui.saleCategory = target.value;
    render();
    return;
  }
  if (target.id === 'recordRange') {
    ui.recordRange = target.value;
    render();
    return;
  }
  if (target.id === 'recordPayment') {
    ui.recordPayment = target.value;
    render();
    return;
  }
  if (target.id === 'priceFlowerSelect') {
    ui.priceFlowerId = target.value;
    render();
    return;
  }
  if (target.name === 'adjustType') {
    syncAdjustForm(target.closest('form'));
    return;
  }
  if (target.matches('[data-cart-qty]')) {
    const flower = getFlower(target.dataset.id);
    const item = ui.cart.find((entry) => entry.flowerId === target.dataset.id);
    if (!flower || !item) return;
    item.qty = clamp(Math.round(parseNumber(target.value, 1)), 1, flower.stock);
    target.value = item.qty;
    refreshCheckoutTotals();
    return;
  }
  if (target.matches('[data-cart-price]')) {
    const item = ui.cart.find((entry) => entry.flowerId === target.dataset.id);
    if (!item) return;
    item.unitPrice = round2(Math.max(0, parseNumber(target.value, item.unitPrice)));
    target.value = item.unitPrice.toFixed(2);
    refreshCheckoutTotals();
    return;
  }
  if (target.id === 'importFile') {
    const file = target.files && target.files[0];
    target.value = '';
    importJSONFile(file);
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    const layer = document.getElementById('modalLayer');
    if (layer && !layer.hidden) {
      closeModal();
      return;
    }
    closeSidebar();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (ui.view !== 'inventory') navigate('inventory');
    window.setTimeout(() => document.getElementById('invSearch')?.focus(), 80);
  }
}

/* ---------------- 启动 ---------------- */
async function bootstrapApp() {
  if (API_MODE) {
    try {
      const remote = await fetchServerState();
      state = remote;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
      } catch (_) { /* localStorage 仅作为离线缓存 */ }
      window.__API_OFFLINE = false;
    } catch (error) {
      window.__API_OFFLINE = true;
      console.warn('云端数据暂不可用，已使用本地缓存。', error);
    }
  }
  window.__lastSyncedState = JSON.parse(JSON.stringify(state));
  window.__syncGeneration = Number(window.__syncGeneration) || 0;
  window.__saveInFlight = 0;
  const requestedView = new URLSearchParams(window.location.search).get('view');
  if (requestedView && VIEW_META[requestedView]) ui.view = requestedView;
  init();
  if (API_MODE && window.__API_OFFLINE) {
    window.setTimeout(() => showToast('云端暂时不可用，当前使用本地缓存。', 'info'), 700);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
