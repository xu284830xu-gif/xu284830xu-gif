/* =========================================================
   花间集 · 库存列表 → 花卉档案 · 可运行演示
   这个文件只做三件事：
     1. 造一份最小的 state（花卉 / 订单 / 库存流水 / 调价记录）；
     2. 补上列表页与详情页需要、但属于其他模块的占位函数；
     3. 启动时渲染列表，并支持 ?open=花卉ID 直接打开某枝花的档案。
   列表页、详情页、弹窗、事件分发全部来自 ../src 下从主项目摘录的真实代码。
   ========================================================= */

/* ---------- 1. 最小 state ---------- */
const state = {
  settings: { shopName: '花间集', owner: '阿岚' },
  flowers: [
    {
      id: 'f_demo_1', name: '自由精神玫瑰', variety: '自由精神', category: '玫瑰', color: '粉色',
      grade: 'A', unit: '枝', cost: 8.5, price: 18, stock: 120, minStock: 40,
      supplier: '云岭花材', location: '冷藏柜 A1', note: '花瓣层叠，适合作为花束主花',
      createdAt: daysAgo(34), restockedAt: daysAgo(1), active: true
    },
    {
      id: 'f_demo_2', name: '白荔枝玫瑰', variety: '白荔枝', category: '玫瑰', color: '白色',
      grade: 'A', unit: '枝', cost: 7.2, price: 15, stock: 22, minStock: 30,
      supplier: '云岭花材', location: '冷藏柜 A2', note: '香气清甜，婚礼花艺常用',
      createdAt: daysAgo(28), restockedAt: daysAgo(4), active: true
    },
    {
      id: 'f_demo_3', name: '香槟洋桔梗', variety: '香槟初恋', category: '洋桔梗', color: '香槟',
      grade: 'A', unit: '枝', cost: 3.2, price: 8, stock: 180, minStock: 50,
      supplier: '四季鲜花', location: '冷藏柜 B1', note: '花期长，适合日常花束搭配',
      createdAt: daysAgo(26), restockedAt: daysAgo(2), active: true
    },
    {
      id: 'f_demo_4', name: '粉色印记郁金香', variety: '粉色印记', category: '郁金香', color: '粉色',
      grade: 'A', unit: '枝', cost: 5.5, price: 12, stock: 64, minStock: 30,
      supplier: '荷兰花坊', location: '冷藏柜 B2', note: '春季畅销款，注意保持直立吸水',
      createdAt: daysAgo(22), restockedAt: daysAgo(3), active: true
    },
    {
      id: 'f_demo_5', name: '蓝绣球', variety: '无尽夏', category: '绣球', color: '蓝色',
      grade: 'B', unit: '束', cost: 18, price: 45, stock: 9, minStock: 12,
      supplier: '四季鲜花', location: '冷藏柜 C1', note: '花头较大，运输时需要单独固定',
      createdAt: daysAgo(19), restockedAt: daysAgo(9), active: true
    },
    {
      id: 'f_demo_6', name: '尤加利叶', variety: '圆叶', category: '叶材', color: '绿色',
      grade: 'A', unit: '把', cost: 6, price: 15, stock: 0, minStock: 10,
      supplier: '云岭花材', location: '常温货架 D1', note: '常用配叶，可与玫瑰、洋桔梗搭配',
      createdAt: daysAgo(30), restockedAt: daysAgo(8), active: true
    }
  ],
  orders: [
    {
      id: 'o_demo_1', no: 'SO-20260109-001', date: daysAgo(1, 15, 10), customer: '林小姐', payment: '微信',
      note: '前台自提', status: 'completed', refundedAt: null, source: 'offline',
      lines: [
        { flowerId: 'f_demo_1', name: '自由精神玫瑰', variety: '自由精神', unit: '枝', qty: 12, unitPrice: 18, cost: 8.5, subtotal: 216 },
        { flowerId: 'f_demo_3', name: '香槟洋桔梗', variety: '香槟初恋', unit: '枝', qty: 20, unitPrice: 8, cost: 3.2, subtotal: 160 }
      ],
      total: 376, cost: 166, profit: 210
    },
    {
      id: 'o_demo_2', no: 'SO-20260107-002', date: daysAgo(3, 11, 40), customer: '周先生', payment: '支付宝',
      note: '同城配送 · 送到公司', status: 'completed', refundedAt: null, source: 'online',
      lines: [
        { flowerId: 'f_demo_1', name: '自由精神玫瑰', variety: '自由精神', unit: '枝', qty: 8, unitPrice: 18, cost: 8.5, subtotal: 144 },
        { flowerId: 'f_demo_2', name: '白荔枝玫瑰', variety: '白荔枝', unit: '枝', qty: 6, unitPrice: 15, cost: 7.2, subtotal: 90 }
      ],
      total: 234, cost: 111.2, profit: 122.8
    },
    {
      id: 'o_demo_3', no: 'SO-20260104-003', date: daysAgo(6, 16, 5), customer: '散客', payment: '现金',
      note: '', status: 'completed', refundedAt: null, source: 'offline',
      lines: [
        { flowerId: 'f_demo_3', name: '香槟洋桔梗', variety: '香槟初恋', unit: '枝', qty: 30, unitPrice: 8, cost: 3.2, subtotal: 240 },
        { flowerId: 'f_demo_4', name: '粉色印记郁金香', variety: '粉色印记', unit: '枝', qty: 10, unitPrice: 12, cost: 5.5, subtotal: 120 }
      ],
      total: 360, cost: 151, profit: 209
    }
  ],
  movements: [
    {
      id: 'm_demo_1', flowerId: 'f_demo_1', type: 'sale', change: -12, before: 132, after: 120,
      unitCost: 8.5, note: 'SO-20260109-001', date: daysAgo(1, 15, 10), orderId: 'o_demo_1'
    },
    {
      id: 'm_demo_2', flowerId: 'f_demo_1', type: 'in', change: 40, before: 92, after: 132,
      unitCost: 8.3, note: '云岭花材', date: daysAgo(1, 9, 20)
    },
    {
      id: 'm_demo_3', flowerId: 'f_demo_5', type: 'loss', change: -2, before: 11, after: 9,
      unitCost: 18, note: '损耗出库 · 花头折断', date: daysAgo(2, 18, 30)
    },
    {
      id: 'm_demo_4', flowerId: 'f_demo_2', type: 'count', change: -3, before: 25, after: 22,
      unitCost: 7.2, note: '盘点盘亏', date: daysAgo(4, 10, 0)
    },
    {
      id: 'm_demo_5', flowerId: 'f_demo_6', type: 'sale', change: -8, before: 8, after: 0,
      unitCost: 6, note: 'SO-20260103-000', date: daysAgo(6, 17, 45)
    }
  ],
  priceHistory: [
    { id: 'p_demo_1', flowerId: 'f_demo_1', oldPrice: 16, newPrice: 18, date: daysAgo(12), reason: '节日前提价' },
    { id: 'p_demo_2', flowerId: 'f_demo_1', oldPrice: 15, newPrice: 16, date: daysAgo(40), reason: '成本上涨' },
    { id: 'p_demo_3', flowerId: 'f_demo_5', oldPrice: 48, newPrice: 45, date: daysAgo(9), reason: '花期偏短，降价处理' }
  ],
  meta: { revision: 1 }
};

/* ---------- 2. 页面状态 ---------- */
const ui = {
  view: 'inventory',
  invSearch: '',
  invCategory: 'all',
  invStatus: 'all',
  invSort: 'default',
  cart: [],
  priceFlowerId: null
};

/* ---------- 3. 渲染与保存 ---------- */
function render() {
  const root = document.getElementById('viewRoot');
  if (!root) return;
  root.innerHTML = renderInventoryView();
  root.classList.remove('view-enter');
  void root.offsetWidth;
  root.classList.add('view-enter');
}

function commit() {
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

/* ---------- 4. 其他模块的占位：演示里只给提示，不实现写操作 ---------- */
function navigate(view) {
  if (view === 'inventory') {
    ui.view = 'inventory';
    if (!document.getElementById('modalLayer').hidden) closeModal();
    render();
    return;
  }
  showToast(`演示版只做了库存列表，${VIEW_META[view]?.title || view} 页面未包含。`, 'info');
}

function openFlowerModal(id) {
  showToast(id ? '演示版：编辑花卉资料的表单没有包含，可在主项目 app.js 查看 openFlowerModal。' : '演示版：新增花卉的表单没有包含。', 'info');
}

function openAdjustModal(id) {
  const flower = getFlower(id);
  showToast(`演示版：这里会给「${flower?.name || '这枝花'}」打开补货 / 损耗 / 盘点弹窗。`, 'info');
}

function openPriceModal(id) {
  const flower = getFlower(id);
  showToast(`演示版：这里会给「${flower?.name || '这枝花'}」打开调价弹窗。`, 'info');
}

function addToCart(id) {
  const flower = getFlower(id);
  showToast(`演示版：${flower?.name || '这枝花'} 会加入开单清单，并跳到快速开单页。`, 'info');
}

function openConfirmModal({ title, message, confirmText = '确认', onConfirm }) {
  const text = String(message).replace(/<[^>]+>/g, '');
  const ok = window.confirm(`${title}\n\n${text}\n\n确认执行「${confirmText}」？`);
  if (!ok) return;
  closeModal();
  if (typeof onConfirm === 'function') onConfirm();
}

/* ---------- 5. 启动 ---------- */
function startDemo() {
  bindEvents();
  render();
  const openId = new URLSearchParams(window.location.search).get('open');
  if (openId) {
    const target = openId === '1' ? state.flowers[0] : getFlower(openId);
    if (target) window.setTimeout(() => openFlowerDetail(target.id), 60);
  }
  window.setTimeout(() => showToast('演示数据已就绪：点花名或「详情」查看花卉档案', 'info'), 700);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startDemo);
} else {
  startDemo();
}
