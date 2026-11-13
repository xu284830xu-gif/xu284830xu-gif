/* =========================================================
   花间集 · 库存列表 → 花卉档案（源码整理）
   文件 5 / 5：事件入口与交互
   整理自：app.js
     · 第 1423-1431 行   refreshInventoryTable（搜索时只换表格，保住输入焦点）
     · 第 1447-1450 行   toggleClearButton
     · 第 1453-1459 行   bindEvents
     · 第 1461-1595 行   handleClick（原项目是全站大 switch，这里只保留本主题相关分支）
     · 第 1597-1607 行   clearSearch
     · 第 1624-1663 行   handleInput（保留库存搜索分支）
     · 第 1665-1682 行   handleChange（保留库存筛选 / 排序分支）
     · 第 1730-1738 行   handleKeydown（Esc 关闭弹窗）
   说明：分支内容按原样保留，未改动逻辑；未列出的分支属于开单、销售记录、
        盈利分析等其他模块，与本主题无关。
   ========================================================= */

/* ---------- app.js:1423-1431  列表局部刷新 ---------- */
function refreshInventoryTable() {
  const wrap = document.getElementById('inventoryTableWrap');
  if (!wrap) return;
  wrap.innerHTML = inventoryTableInner();
  const active = activeFlowers().length;
  const count = document.getElementById('inventoryCount');
  if (count) count.textContent = `${filteredFlowers().length} / ${active} 种`;
  toggleClearButton('inventory', Boolean(ui.invSearch));
}

/* ---------- app.js:1447-1450  清空按钮的显隐 ---------- */
function toggleClearButton(target, visible) {
  const button = document.querySelector(`[data-action="clear-search"][data-target="${target}"]`);
  if (button) button.hidden = !visible;
}

/* ---------- app.js:1453-1459  事件全部委托到 document ---------- */
function bindEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('input', handleInput);
  document.addEventListener('change', handleChange);
  document.addEventListener('keydown', handleKeydown);
}

/* ---------- app.js:1461-1595  行为分发：data-action → 具体函数 ---------- */
function handleClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (!action) return;
  if (target.tagName === 'A') event.preventDefault();

  switch (action) {
    case 'nav':
      navigate(target.dataset.view);
      break;
    case 'open-add-flower':
      openFlowerModal();
      break;
    case 'edit-flower':
      openFlowerModal(target.dataset.id);
      break;
    /* 列表页 · 打开详情：花名、更多按钮、移动卡片都发这一个 action */
    case 'view-flower':
      openFlowerDetail(target.dataset.id);
      break;
    /* 详情页里的四个动作，和列表行内按钮共用同一套实现 */
    case 'adjust-stock':
      openAdjustModal(target.dataset.id);
      break;
    case 'change-price':
      openPriceModal(target.dataset.id);
      break;
    case 'quick-sale':
      addToCart(target.dataset.id);
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
    default:
      console.warn('未处理的操作', action);
  }
}

/* ---------- app.js:1597-1607 ---------- */
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

/* ---------- app.js:1624-1663  搜索输入 ---------- */
function handleInput(event) {
  const target = event.target;
  if (target.id === 'invSearch') {
    ui.invSearch = target.value;
    refreshInventoryTable();
    return;
  }
}

/* ---------- app.js:1665-1682  筛选与排序 ---------- */
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
}

/* ---------- app.js:1730-1738  Esc 关弹窗 ---------- */
function handleKeydown(event) {
  if (event.key === 'Escape') {
    const layer = document.getElementById('modalLayer');
    if (layer && !layer.hidden) {
      closeModal();
      return;
    }
  }
}
