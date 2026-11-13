/* =========================================================
   花间集 · 库存列表 → 花卉档案（源码整理）
   文件 1 / 5：数据与计算
   摘录自：data.js（原样摘录，未改动逻辑）
     · 第 10-27 行     常量：品类 / 单位 / 颜色
     · 第 31-182 行    基础工具：转义、日期、数字 / 金额 / 百分比格式化
     · 第 184-267 行   图标库、花卉头像
     · 第 714-737 行   数据读取：activeFlowers / getFlower / 订单金额
     · 第 802-898 行   库存业务计算：库存状态、库龄、毛利率、补货建议、汇总
     · 第 1000-1010 行 库存流水类型文案
   依赖：state（由 data.js 的 loadState() 或 demo/demo.js 提供）
   ========================================================= */

/* ---------- data.js:10-27  常量：品类 / 单位 / 颜色 ---------- */
const CATEGORIES = ['玫瑰', '洋桔梗', '郁金香', '绣球', '兰花', '配花', '叶材', '其他'];
const UNITS = ['枝', '束', '盆', '扎', '把'];
const PAYMENT_METHODS = ['微信', '支付宝', '现金', '银行卡', '其他'];
const GRADES = ['A', 'B', 'C'];
const COLORS = ['粉色', '白色', '香槟', '黄色', '红色', '蓝色', '紫色', '绿色', '橙色', '混色'];

const COLOR_HEX = {
  '粉色': '#d98e9c',
  '白色': '#e8ddc9',
  '香槟': '#d4b07c',
  '黄色': '#dfb454',
  '红色': '#bf5e58',
  '蓝色': '#7fa7c1',
  '紫色': '#9d85b2',
  '绿色': '#86a67b',
  '橙色': '#dd9b64',
  '混色': '#b7a0b8'
};

/* ---------- data.js:31-182  基础工具：转义、日期、数字 / 金额 / 百分比 ---------- */
/* ---------------- 基础工具 ---------------- */
function round2(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function parseNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const num = parseFloat(String(value ?? '').replace(/[,，¥￥\s]/g, ''));
  return Number.isFinite(num) ? num : fallback;
}

function uid(prefix = 'id') {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}_${window.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function safeId(value, prefix = 'id') {
  const text = String(value ?? '').trim();
  if (/^[A-Za-z0-9_-]{1,80}$/.test(text)) return text;
  return `${prefix}_${uid('x')}`;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDate(value) {
  if (value instanceof Date) return new Date(value);
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function startOfDay(value) {
  const d = toDate(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(value) {
  const d = toDate(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(value, amount) {
  const d = toDate(value);
  d.setDate(d.getDate() + amount);
  return d;
}

function daysAgo(days, hour = 10, minute = 20) {
  const d = addDays(new Date(), -days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function localDateKey(value) {
  const d = toDate(value);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dateInputValue(value = new Date()) {
  return localDateKey(value);
}

function formatDate(value, style = 'normal') {
  const d = toDate(value);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (style === 'dot') return `${y}.${pad2(m)}.${pad2(day)}`;
  if (style === 'short') return `${pad2(m)}-${pad2(day)}`;
  if (style === 'month') return `${y}年${m}月`;
  if (style === 'full') return `${y}年${m}月${day}日`;
  return `${m}月${day}日`;
}

function formatTime(value) {
  const d = toDate(value);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDateTime(value) {
  return `${formatDate(value)} ${formatTime(value)}`;
}

function weekdayName(value = new Date()) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][toDate(value).getDay()];
}

function daysBetween(from, to = new Date()) {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.max(0, Math.floor((b - a) / 86400000));
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

const numberFmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const moneyFmt = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function number(value) {
  return numberFmt.format(Number(value) || 0);
}

function money(value, withSymbol = true) {
  const n = Number(value) || 0;
  return `${withSymbol ? '¥' : ''}${moneyFmt.format(n)}`;
}

function moneyCompact(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 100000000) return `¥${(n / 100000000).toFixed(1)}亿`;
  if (abs >= 10000) return `¥${(n / 10000).toFixed(abs >= 100000 ? 0 : 1)}万`;
  return `¥${numberFmt.format(Math.round(n))}`;
}

function percent(value, digits = 0) {
  const n = Number(value) || 0;
  return `${(n * 100).toFixed(digits)}%`;
}

function priceChangePercent(oldPrice, newPrice) {
  if (!oldPrice) return 0;
  return (newPrice - oldPrice) / oldPrice;
}

function pluralUnit(unit) {
  return unit || '枝';
}

/* ---------- data.js:184-267  图标库与花卉头像 ---------- */
/* ---------------- 图标 ---------------- */
const ICON_PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  cart: '<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-3-2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  box: '<path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  tag: '<path d="M20.6 13.6 11 23l-9-9V3h11l7.6 7.6a2 2 0 0 1 0 3Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.13.37.43.76.8 1 .3.2.7.4 1.1.4H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.6Z"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  'arrow-up-right': '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  'arrow-down-right': '<path d="m7 7 10 10"/><path d="M17 7v10H7"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  alert: '<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  leaf: '<path d="M20 4c-9 0-16 4-16 11 0 3 2 5 5 5 7 0 11-7 11-16Z"/><path d="M4 21c2-7 6-11 12-14"/>',
  flower: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5c0-3 2-5.5 4-5s2 3.5-1.5 5.5M12 14.5c0 3-2 5.5-4 5s-2-3.5 1.5-5.5M9.5 12c-3 0-5.5-2-5-4s3.5-2 5.5 1.5M14.5 12c3 0 5.5 2 5 4s-3.5 2-5.5-1.5"/>',
  wallet: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19v16H6.5A2.5 2.5 0 0 1 4 17.5v-11Z"/><path d="M4 7h15"/><path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 21h14"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-4M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.9 4M20 20v-5h-5"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  sparkles: '<path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"/><path d="m5 14 .7 1.8L7.5 16.5l-1.8.7L5 19l-.7-1.8L2.5 16.5l1.8-.7L5 14Z"/>',
  printer: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M15 6.5a6 6 0 1 1 0 11"/><path d="M9 6v6M7 8h4M7 10h4"/>',
  'trend-up': '<path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
  'trend-down': '<path d="m3 7 6 6 4-4 8 9"/><path d="M15 18h6v-6"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  'credit-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  'shopping-bag': '<path d="M6 7V6a6 6 0 0 1 12 0v1"/><path d="M4 7h16l1 14H3L4 7Z"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  'corner-down-left': '<path d="M9 10 4 15l5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>'
};

function icon(name, size = 18) {
  const paths = ICON_PATHS[name] || ICON_PATHS.info;
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function flowerSVG() {
  return `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <g fill="currentColor" opacity=".95">
      <ellipse cx="24" cy="13.4" rx="5.5" ry="10"/>
      <ellipse cx="24" cy="34.6" rx="5.5" ry="10" transform="rotate(180 24 24)"/>
      <ellipse cx="13.4" cy="24" rx="10" ry="5.5" transform="rotate(90 24 24)"/>
      <ellipse cx="34.6" cy="24" rx="10" ry="5.5" transform="rotate(90 24 24)"/>
      <ellipse cx="16.5" cy="16.5" rx="5.2" ry="9.5" transform="rotate(-45 24 24)"/>
      <ellipse cx="31.5" cy="31.5" rx="5.2" ry="9.5" transform="rotate(-45 24 24)"/>
      <ellipse cx="31.5" cy="16.5" rx="5.2" ry="9.5" transform="rotate(45 24 24)"/>
      <ellipse cx="16.5" cy="31.5" rx="5.2" ry="9.5" transform="rotate(45 24 24)"/>
    </g>
    <circle cx="24" cy="24" r="5.1" fill="#f1d28a"/>
    <circle cx="24" cy="24" r="2.1" fill="#d2a853" opacity=".65"/>
  </svg>`;
}

function colorHex(colorName) {
  if (!colorName) return '#b7a9bc';
  const direct = COLOR_HEX[colorName];
  if (direct) return direct;
  const found = Object.keys(COLOR_HEX).find((key) => String(colorName).includes(key));
  return found ? COLOR_HEX[found] : '#b7a9bc';
}

function flowerAvatar(flower, size = '') {
  const color = colorHex(flower && flower.color);
  return `<span class="flower-avatar ${size}" style="--petal:${color}" aria-hidden="true">${flowerSVG()}</span>`;
}

/* ---------- data.js:714-737  数据读取 ---------- */
function activeFlowers(list = null) {
  const source = list || state.flowers;
  return source.filter((f) => f.active !== false);
}

function getFlower(id) {
  return state.flowers.find((f) => f.id === id) || null;
}

function orderRevenue(order) {
  return round2(order.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0));
}

function orderCost(order) {
  return round2(order.lines.reduce((sum, line) => sum + line.qty * line.cost, 0));
}

function orderGrossProfit(order) {
  return round2(orderRevenue(order) - orderCost(order));
}

function orderUnitCount(order) {
  return order.lines.reduce((sum, line) => sum + line.qty, 0);
}

/* ---------- data.js:802-898  库存业务计算 ---------- */
function percentDelta(current, previous) {
  if (!previous) return null;
  return (current - previous) / previous;
}

function stockStatus(flower) {
  if (flower.stock <= 0) return { key: 'empty', label: '已售罄', badge: 'badge-red', bar: 'is-empty' };
  if (flower.stock <= flower.minStock) return { key: 'low', label: '低库存', badge: 'badge-gold', bar: 'is-low' };
  if (flower.stock <= flower.minStock * 1.35) return { key: 'watch', label: '库存偏低', badge: 'badge-gold', bar: 'is-low' };
  return { key: 'healthy', label: '库存充足', badge: 'badge-green', bar: '' };
}

function shelfDays(flower) {
  return daysBetween(flower.restockedAt || flower.createdAt || new Date());
}

function freshness(flower) {
  const days = shelfDays(flower);
  if (flower.stock <= 0) return { label: '无在库', tone: 'muted', days };
  if (days >= 7) return { label: '滞销风险', tone: 'bad', days };
  if (days >= 5) return { label: '需要关注', tone: 'warn', days };
  if (days >= 3) return { label: '正常周转', tone: 'ok', days };
  return { label: '新鲜到店', tone: 'fresh', days };
}

function stockPercent(flower) {
  const target = Math.max(flower.minStock * 3, 1);
  return clamp(Math.round((flower.stock / target) * 100), 0, 100);
}

function grossMargin(price, cost) {
  const p = Number(price) || 0;
  if (p <= 0) return 0;
  const c = Number(cost) || 0;
  return (p - c) / p;
}

function marginState(price, cost) {
  const margin = grossMargin(price, cost);
  if (margin >= 0.55) return { margin, label: '高毛利', tone: 'good' };
  if (margin >= 0.35) return { margin, label: '健康', tone: 'good' };
  if (margin >= 0.2) return { margin, label: '偏低', tone: 'warn' };
  return { margin, label: '过薄', tone: 'bad' };
}

function suggestedPrice(cost, targetMargin = 0.45) {
  const c = Number(cost) || 0;
  return round2(c / Math.max(0.05, 1 - targetMargin));
}

function restockSuggestion(flower) {
  const since = startOfDay(addDays(new Date(), -6));
  let sold = 0;
  state.orders.filter((o) => o.status === 'completed').forEach((order) => {
    if (toDate(order.date) < since) return;
    order.lines.forEach((line) => {
      if (line.flowerId === flower.id) sold += line.qty;
    });
  });
  const daily = sold / 7;
  const target = Math.ceil(daily * 5 + flower.minStock);
  const suggested = Math.max(0, target - flower.stock);
  return {
    sold,
    daily: round2(daily),
    target,
    suggested,
    coverDays: daily > 0 ? round2(flower.stock / daily) : null
  };
}

function replenishmentList(limit = 3) {
  return activeFlowers()
    .map((flower) => ({ flower, plan: restockSuggestion(flower) }))
    .filter((item) => item.plan.suggested > 0)
    .sort((a, b) => {
      const aRisk = a.flower.stock <= a.flower.minStock ? 1 : 0;
      const bRisk = b.flower.stock <= b.flower.minStock ? 1 : 0;
      if (aRisk !== bRisk) return bRisk - aRisk;
      return b.plan.suggested - a.plan.suggested;
    })
    .slice(0, limit);
}

function inventorySummary() {
  const list = activeFlowers();
  return {
    sku: list.length,
    units: list.reduce((sum, f) => sum + f.stock, 0),
    costValue: round2(list.reduce((sum, f) => sum + f.stock * f.cost, 0)),
    retailValue: round2(list.reduce((sum, f) => sum + f.stock * f.price, 0)),
    lowCount: list.filter((f) => f.stock <= f.minStock).length,
    emptyCount: list.filter((f) => f.stock <= 0).length,
    slowCount: list.filter((f) => f.stock > 0 && shelfDays(f) >= 7).length,
    categories: new Set(list.map((f) => f.category)).size
  };
}

/* ---------- data.js:1000-1010  库存流水类型文案 ---------- */
function stockMovementLabel(type) {
  return {
    initial: '期初入库',
    in: '补货入库',
    loss: '损耗出库',
    count: '盘点调整',
    sale: '销售出库',
    refund: '退货入库'
  }[type] || '库存变动';
}
