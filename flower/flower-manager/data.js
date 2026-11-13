/* =========================================================
   花间集 · 数据层
   纯前端本地存储。所有金额单位为人民币元。
   ========================================================= */
'use strict';

const API_MODE = window.APP_MODE === 'server';
const STORAGE_KEY = 'huajian-flower-manager-v1';
const APP_VERSION = 1;
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

const CATEGORY_COLORS = ['#3c7462', '#c19a56', '#d99579', '#7c9bb0', '#a18eb5', '#a5aa83', '#c8b9a1', '#7f9a8d'];

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

/* ---------------- 演示数据 ---------------- */
function makeFlower(spec, index) {
  return {
    id: `f_seed_${index + 1}`,
    name: spec.name,
    variety: spec.variety || '',
    category: spec.category,
    color: spec.color,
    grade: spec.grade || 'A',
    unit: spec.unit || '枝',
    cost: spec.cost,
    price: spec.price,
    stock: spec.stock,
    minStock: spec.minStock,
    supplier: spec.supplier || '',
    location: spec.location || '',
    note: spec.note || '',
    createdAt: daysAgo(spec.createdDays ?? 30),
    restockedAt: daysAgo(spec.restockedDays ?? 2),
    active: true
  };
}

function createSeedState() {
  const flowerSpecs = [
    { name: '自由精神玫瑰', variety: '自由精神', category: '玫瑰', color: '粉色', grade: 'A', unit: '枝', cost: 8.5, price: 18, stock: 120, minStock: 40, supplier: '云岭花材', location: '冷藏柜 A1', createdDays: 34, restockedDays: 1, note: '花瓣层叠，适合作为花束主花' },
    { name: '白荔枝玫瑰', variety: '白荔枝', category: '玫瑰', color: '白色', grade: 'A', unit: '枝', cost: 7.2, price: 15, stock: 28, minStock: 30, supplier: '云岭花材', location: '冷藏柜 A2', createdDays: 28, restockedDays: 4, note: '香气清甜，婚礼花艺常用' },
    { name: '香槟洋桔梗', variety: '香槟初恋', category: '洋桔梗', color: '香槟', grade: 'A', unit: '枝', cost: 3.2, price: 8, stock: 180, minStock: 50, supplier: '四季鲜花', location: '冷藏柜 B1', createdDays: 26, restockedDays: 2, note: '花期长，适合日常花束搭配' },
    { name: '粉色印记郁金香', variety: '粉色印记', category: '郁金香', color: '粉色', grade: 'A', unit: '枝', cost: 5.5, price: 12, stock: 64, minStock: 30, supplier: '荷兰花坊', location: '冷藏柜 B2', createdDays: 22, restockedDays: 3, note: '春季畅销款，注意保持直立吸水' },
    { name: '奶油向日葵', variety: '奶油', category: '配花', color: '黄色', grade: 'B', unit: '枝', cost: 4, price: 10, stock: 12, minStock: 20, supplier: '田野花材', location: '常温花架 C1', createdDays: 19, restockedDays: 7, note: '阳光感强，适合单支包装' },
    { name: '无尽夏绣球', variety: '无尽夏', category: '绣球', color: '蓝色', grade: 'A', unit: '枝', cost: 18, price: 38, stock: 23, minStock: 10, supplier: '江南花圃', location: '冷藏柜 A3', createdDays: 25, restockedDays: 1, note: '易脱水，到店后深水养护' },
    { name: '圆叶尤加利', variety: '圆叶', category: '叶材', color: '绿色', grade: 'A', unit: '扎', cost: 12, price: 28, stock: 42, minStock: 15, supplier: '山野叶材', location: '常温花架 C2', createdDays: 31, restockedDays: 5, note: '花束配叶，可自然风干' },
    { name: '白花蝴蝶兰', variety: '白花', category: '兰花', color: '白色', grade: 'A', unit: '盆', cost: 45, price: 98, stock: 9, minStock: 5, supplier: '兰亭园艺', location: '展示台 D1', createdDays: 40, restockedDays: 6, note: '盆栽礼赠款，避免冷风直吹' }
  ];

  const flowers = flowerSpecs.map(makeFlower);

  const priceSeeds = [
    [0, 22, 15, 7.8, 16, 8.0, '供应商小幅调价'],
    [0, 9, 16, 8.0, 18, 8.5, '节庆需求上涨，调整售价'],
    [1, 12, 13.5, 6.8, 15, 7.2, '品质升级，更新售价'],
    [2, 18, 6.5, 2.8, 7, 3.0, '进货成本变化'],
    [2, 7, 7, 3.0, 8, 3.2, '花期与品质提升'],
    [3, 15, 10, 5.0, 11, 5.2, '到货品质较好'],
    [3, 6, 11, 5.2, 12, 5.5, '节前需求增加'],
    [4, 10, 9, 3.8, 10, 4.0, '成本上调'],
    [5, 13, 32, 16.0, 36, 17.0, '花头饱满，调整定价'],
    [5, 3, 36, 17.0, 38, 18.0, '周末花礼需求增加'],
    [6, 16, 24, 10.5, 28, 12.0, '更换供应商，成本上涨'],
    [7, 25, 88, 42.0, 98, 45.0, '年节礼品需求上涨']
  ];

  const priceHistory = priceSeeds.map((row, i) => {
    const f = flowers[row[0]];
    return {
      id: `ph_seed_${i + 1}`,
      flowerId: f.id,
      date: daysAgo(row[1], 15, 30),
      oldPrice: row[2],
      newPrice: row[4],
      oldCost: row[3],
      newCost: row[5],
      reason: row[6]
    };
  });

  const orderSpecs = [
    { days: 0, customer: '林晚', payment: '微信', note: '生日花束，卡片写“晚风与花”', lines: [[0, 6, 18], [2, 10, 8]] },
    { days: 0, customer: '周先生', payment: '支付宝', note: '自提', lines: [[5, 1, 38], [6, 2, 28]] },
    { days: 1, customer: '陈小姐', payment: '微信', note: '', lines: [[3, 12, 12]] },
    { days: 2, customer: '苏禾', payment: '现金', note: '日常瓶插花', lines: [[1, 8, 15], [2, 6, 8]] },
    { days: 3, customer: '沈女士', payment: '银行卡', note: '乔迁礼物', lines: [[7, 1, 98]] },
    { days: 4, customer: '顾言', payment: '微信', note: '纪念日花束', lines: [[0, 10, 18], [4, 3, 10]] },
    { days: 5, customer: '鹿鸣花艺', payment: '支付宝', note: '同行批发，自取', lines: [[2, 20, 8]] },
    { days: 6, customer: '唐可可', payment: '微信', note: '', lines: [[5, 2, 38], [6, 1, 28]] },
    { days: 8, customer: '许女士', payment: '现金', note: '公司前台周花', lines: [[3, 20, 12]] },
    { days: 10, customer: '江屿', payment: '微信', note: '求婚花束', lines: [[0, 12, 18], [1, 6, 15]] },
    { days: 11, customer: '程小姐', payment: '支付宝', note: '客户临时取消，已原路退款', lines: [[0, 2, 18]], status: 'refunded' },
    { days: 13, customer: '白露', payment: '微信', note: '', lines: [[4, 8, 10], [2, 12, 8]] },
    { days: 17, customer: '何先生', payment: '银行卡', note: '办公室绿植与花礼', lines: [[7, 2, 98], [6, 3, 28]] },
    { days: 21, customer: '林晚', payment: '微信', note: '老客复购', lines: [[0, 15, 18], [5, 2, 38]] },
    { days: 26, customer: '南栀', payment: '支付宝', note: '', lines: [[2, 25, 8], [3, 10, 12]] },
    { days: 33, customer: '八月花房', payment: '微信', note: '月度批发订单', lines: [[0, 20, 18], [6, 4, 28]] },
    { days: 38, customer: '秦小姐', payment: '现金', note: '', lines: [[5, 3, 38], [4, 10, 10]] },
    { days: 44, customer: '顾言', payment: '微信', note: '节日送礼', lines: [[7, 3, 98]] }
  ];

  const orders = orderSpecs.map((spec, index) => {
    const orderDate = daysAgo(spec.days, 9 + (index % 9), (index * 7) % 60);
    const lines = spec.lines.map((line) => {
      const f = flowers[line[0]];
      const qty = line[1];
      const unitPrice = line[2];
      return {
        flowerId: f.id,
        name: f.name,
        variety: f.variety,
        unit: f.unit,
        qty,
        unitPrice,
        cost: f.cost,
        subtotal: round2(qty * unitPrice)
      };
    });
    const total = round2(lines.reduce((sum, line) => sum + line.subtotal, 0));
    const cost = round2(lines.reduce((sum, line) => sum + line.cost * line.qty, 0));
    const status = spec.status || 'completed';
    return {
      id: `o_seed_${index + 1}`,
      no: `SO-${localDateKey(orderDate).replace(/-/g, '')}-${String(index + 1).padStart(3, '0')}`,
      date: orderDate,
      customer: spec.customer,
      payment: spec.payment,
      note: spec.note || '',
      lines,
      total,
      cost,
      profit: round2(total - cost),
      status,
      refundedAt: status === 'refunded' ? daysAgo(Math.max(0, spec.days - 1), 16, 0) : null
    };
  });

  const movements = [];
  flowers.forEach((f, i) => {
    const initialQty = f.stock + 30 + i * 3;
    movements.push({
      id: `m_seed_in_${i}`,
      flowerId: f.id,
      type: 'initial',
      change: initialQty,
      before: 0,
      after: initialQty,
      unitCost: f.cost,
      note: '期初建档入库',
      date: f.createdAt,
      orderId: null
    });
    const restockQty = Math.max(8, Math.round(f.stock * 0.35));
    movements.push({
      id: `m_seed_restock_${i}`,
      flowerId: f.id,
      type: 'in',
      change: restockQty,
      before: Math.max(0, f.stock - restockQty),
      after: f.stock,
      unitCost: f.cost,
      note: '常规补货',
      date: f.restockedAt,
      orderId: null
    });
  });
  movements.push({
    id: 'm_seed_loss_1',
    flowerId: flowers[4].id,
    type: 'loss',
    change: -3,
    before: 15,
    after: 12,
    unitCost: 4,
    note: '花瓣折损报损',
    date: daysAgo(2, 17, 10),
    orderId: null
  });
  movements.sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    version: APP_VERSION,
    settings: {
      shopName: '花间集',
      owner: '花掌柜',
      createdAt: new Date().toISOString()
    },
    flowers,
    orders,
    priceHistory,
    movements,
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

function createEmptyState(settings = {}) {
  return {
    version: APP_VERSION,
    settings: {
      shopName: settings.shopName || '我的花店',
      owner: settings.owner || '花掌柜',
      createdAt: settings.createdAt || new Date().toISOString()
    },
    flowers: [],
    orders: [],
    priceHistory: [],
    movements: [],
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

/* ---------------- 本地存储 ---------------- */
function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.flowers) || !Array.isArray(raw.orders)) return null;

  const settings = Object.assign({ shopName: '我的花店', owner: '花掌柜' }, raw.settings || {});
  const normalizeFlower = (f, index) => ({
    id: safeId(f.id, `f_import_${index}`),
    name: String(f.name || '未命名花卉'),
    variety: String(f.variety || ''),
    category: CATEGORIES.includes(f.category) ? f.category : (f.category ? String(f.category) : '其他'),
    color: String(f.color || ''),
    grade: String(f.grade || 'A'),
    unit: String(f.unit || '枝'),
    cost: Math.max(0, round2(parseNumber(f.cost))),
    price: Math.max(0, round2(parseNumber(f.price))),
    stock: Math.max(0, Math.round(parseNumber(f.stock))),
    minStock: Math.max(0, Math.round(parseNumber(f.minStock))),
    supplier: String(f.supplier || ''),
    location: String(f.location || ''),
    note: String(f.note || ''),
    createdAt: f.createdAt || new Date().toISOString(),
    restockedAt: f.restockedAt || f.createdAt || new Date().toISOString(),
    active: f.active !== false
  });

  const flowers = raw.flowers.map(normalizeFlower);
  const flowerIds = new Set(flowers.map((f) => f.id));

  const orders = raw.orders.map((o, index) => {
    const lines = Array.isArray(o.lines) ? o.lines.map((line) => {
      const qty = Math.max(0, Math.round(parseNumber(line.qty)));
      const unitPrice = Math.max(0, round2(parseNumber(line.unitPrice)));
      return {
        flowerId: String(line.flowerId || ''),
        name: String(line.name || '花卉'),
        variety: String(line.variety || ''),
        unit: String(line.unit || '枝'),
        qty,
        unitPrice,
        cost: Math.max(0, round2(parseNumber(line.cost))),
        subtotal: round2(qty * unitPrice)
      };
    }) : [];
    const total = round2(lines.reduce((sum, line) => sum + line.subtotal, 0));
    const cost = round2(lines.reduce((sum, line) => sum + line.cost * line.qty, 0));
    return {
      id: safeId(o.id, `o_import_${index}`),
      no: String(o.no || `SO-${localDateKey(o.date || new Date()).replace(/-/g, '')}-${String(index + 1).padStart(3, '0')}`),
      date: o.date || new Date().toISOString(),
      customer: String(o.customer || '散客'),
      customerPhone: String(o.customerPhone || ''),
      source: o.source === 'online' ? 'online' : 'offline',
      channel: String(o.channel || ''),
      paymentStatus: String(o.paymentStatus || 'paid'),
      requestId: String(o.requestId || ''),
      delivery: o.delivery && typeof o.delivery === 'object' ? {
        method: o.delivery.method === 'delivery' ? 'delivery' : 'pickup',
        methodLabel: String(o.delivery.methodLabel || (o.delivery.method === 'delivery' ? '同城配送' : '到店自提')),
        address: String(o.delivery.address || ''),
        date: String(o.delivery.date || ''),
        time: String(o.delivery.time || ''),
        note: String(o.delivery.note || '')
      } : null,
      payment: PAYMENT_METHODS.includes(o.payment) ? o.payment : '其他',
      note: String(o.note || ''),
      lines,
      total,
      cost,
      profit: round2(total - cost),
      status: o.status === 'refunded' ? 'refunded' : 'completed',
      refundedAt: o.refundedAt || null
    };
  });

  const priceHistory = Array.isArray(raw.priceHistory) ? raw.priceHistory.filter((p) => p && p.flowerId).map((p, index) => ({
    id: String(p.id || `ph_import_${index}`),
    flowerId: String(p.flowerId),
    date: p.date || new Date().toISOString(),
    oldPrice: Math.max(0, round2(parseNumber(p.oldPrice))),
    newPrice: Math.max(0, round2(parseNumber(p.newPrice))),
    oldCost: Math.max(0, round2(parseNumber(p.oldCost))),
    newCost: Math.max(0, round2(parseNumber(p.newCost))),
    reason: String(p.reason || '调整价格')
  })).filter((p) => flowerIds.has(p.flowerId)) : [];

  const movements = Array.isArray(raw.movements) ? raw.movements.filter((m) => m && m.flowerId).map((m, index) => ({
    id: String(m.id || `m_import_${index}`),
    flowerId: String(m.flowerId),
    type: ['initial', 'in', 'loss', 'count', 'sale', 'refund'].includes(m.type) ? m.type : 'count',
    change: Math.round(parseNumber(m.change)),
    before: Math.max(0, Math.round(parseNumber(m.before))),
    after: Math.max(0, Math.round(parseNumber(m.after))),
    unitCost: Math.max(0, round2(parseNumber(m.unitCost))),
    note: String(m.note || ''),
    date: m.date || new Date().toISOString(),
    orderId: m.orderId || null
  })).filter((m) => flowerIds.has(m.flowerId)) : [];

  return {
    version: APP_VERSION,
    settings: {
      shopName: String(settings.shopName || '我的花店'),
      owner: String(settings.owner || '花掌柜'),
      createdAt: settings.createdAt || new Date().toISOString()
    },
    flowers,
    orders,
    priceHistory,
    movements,
    meta: {
      createdAt: raw.meta?.createdAt || new Date().toISOString(),
      updatedAt: raw.meta?.updatedAt || new Date().toISOString(),
      revision: Math.max(1, Number(raw.meta?.revision) || 1)
    }
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = createSeedState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    const normalized = normalizeState(parsed);
    if (!normalized) throw new Error('数据格式不正确');
    return normalized;
  } catch (error) {
    console.warn('本地数据读取失败，已载入演示数据。', error);
    return createSeedState();
  }
}

function getCollabIdentity() {
  let id = '';
  try {
    id = window.sessionStorage.getItem('hj_tab_client_id') || '';
  } catch (_) { /* ignore */ }
  if (!id) {
    id = uid('tab');
    try { window.sessionStorage.setItem('hj_tab_client_id', id); } catch (_) { /* ignore */ }
  }
  let name = '';
  try {
    name = window.localStorage.getItem('hj_collab_name') || '';
  } catch (_) { /* ignore */ }
  if (!name) {
    name = `花友${id.slice(-2).toUpperCase()}`;
  }
  return { id, name };
}

function saveState(nextState) {
  nextState.meta = nextState.meta || {};
  nextState.meta.updatedAt = new Date().toISOString();
  let localResult = { ok: true, at: new Date() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch (error) {
    console.warn('本地数据保存失败。', error);
    localResult = { ok: false, at: new Date(), error };
  }

  if (API_MODE) {
    const snapshot = JSON.parse(JSON.stringify(nextState));
    const base = window.__lastSyncedState
      ? JSON.parse(JSON.stringify(window.__lastSyncedState))
      : JSON.parse(JSON.stringify(snapshot));
    const generation = Number(window.__syncGeneration) || 0;
    const identity = getCollabIdentity();
    const task = (window.__saveChain || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if ((Number(window.__syncGeneration) || 0) !== generation) return null;
        window.__saveInFlight = (Number(window.__saveInFlight) || 0) + 1;
        try {
          const response = await fetch('/api/state/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ base, next: snapshot, client: identity })
          });
          if (response.status === 409) {
            const conflict = await response.json().catch(() => ({}));
            window.__syncGeneration = generation + 1;
            if (typeof window.__collabOnConflict === 'function') {
              window.__collabOnConflict(conflict);
            }
            return null;
          }
          if (!response.ok) {
            const detail = await response.text();
            throw new Error(`云端保存失败 (${response.status}) ${detail.slice(0, 120)}`);
          }
          const data = await response.json();
          snapshot.meta = snapshot.meta || {};
          snapshot.meta.revision = data.revision;
          window.__lastSyncedState = JSON.parse(JSON.stringify(snapshot));
          if (state.meta) state.meta.revision = data.revision;
          window.__appRevision = Number(data.revision) || 1;
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          } catch (_) { /* ignore */ }
          window.__API_OFFLINE = false;
          if (typeof updateSaveIndicator === 'function') {
            updateSaveIndicator({ ok: true, at: new Date() });
          }
          return data;
        } finally {
          window.__saveInFlight = Math.max(0, (Number(window.__saveInFlight) || 1) - 1);
        }
      })
      .catch((error) => {
        window.__API_OFFLINE = true;
        console.warn('云端保存失败，本地缓存仍可用。', error);
        if (typeof updateSaveIndicator === 'function') {
          updateSaveIndicator({ ok: false, at: new Date(), error });
        }
        return null;
      });
    window.__saveChain = task;
    window.__pendingSave = task;
  }

  return localResult;
}

async function fetchServerState() {
  const response = await fetch('/api/state', {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`读取云端数据失败 (${response.status})`);
  const data = await response.json();
  const normalized = normalizeState(data);
  if (!normalized) throw new Error('云端数据格式不正确');
  return normalized;
}

/* ---------------- 业务计算 ---------------- */
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

function completedOrders(list = state.orders) {
  return list.filter((o) => o.status === 'completed');
}

function isWithinRange(value, range) {
  if (!value) return false;
  const d = toDate(value);
  const now = new Date();
  if (range === 'all') return true;
  if (range === 'today') return localDateKey(d) === localDateKey(now);
  if (range === '7') return d >= startOfDay(addDays(now, -6)) && d <= endOfDay(now);
  if (range === '30') return d >= startOfDay(addDays(now, -29)) && d <= endOfDay(now);
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= start && d <= endOfDay(now);
  }
  return true;
}

function ordersInRange(range, list = state.orders) {
  return completedOrders(list).filter((o) => isWithinRange(o.date, range));
}

function summarizeOrders(list) {
  return list.reduce((acc, order) => {
    const revenue = orderRevenue(order);
    const cost = orderCost(order);
    acc.count += 1;
    acc.units += orderUnitCount(order);
    acc.revenue = round2(acc.revenue + revenue);
    acc.cost = round2(acc.cost + cost);
    acc.profit = round2(acc.profit + revenue - cost);
    return acc;
  }, { count: 0, units: 0, revenue: 0, cost: 0, profit: 0 });
}

function lossCostInRange(range, list = state.movements) {
  return round2(list
    .filter((m) => m.type === 'loss' && isWithinRange(m.date, range))
    .reduce((sum, m) => sum + Math.abs(m.change) * (Number(m.unitCost) || 0), 0));
}

function lossUnitsInRange(range, list = state.movements) {
  return list
    .filter((m) => m.type === 'loss' && isWithinRange(m.date, range))
    .reduce((sum, m) => sum + Math.abs(m.change), 0);
}

function todayOrders(list = state.orders) {
  const today = localDateKey(new Date());
  return completedOrders(list).filter((o) => localDateKey(o.date) === today);
}

function monthOrders(offset = 0, list = state.orders) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return completedOrders(list).filter((o) => {
    const d = toDate(o.date);
    return d >= start && d < end;
  });
}

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

function aggregateProducts(orders) {
  const map = new Map();
  orders.forEach((order) => {
    order.lines.forEach((line) => {
      const key = line.flowerId || line.name;
      if (!map.has(key)) {
        map.set(key, {
          flowerId: line.flowerId,
          name: line.name,
          variety: line.variety,
          unit: line.unit,
          units: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          orders: 0
        });
      }
      const item = map.get(key);
      item.units += line.qty;
      item.revenue = round2(item.revenue + line.qty * line.unitPrice);
      item.cost = round2(item.cost + line.qty * line.cost);
      item.profit = round2(item.profit + line.qty * (line.unitPrice - line.cost));
      item.orders += 1;
    });
  });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

function aggregateCustomers(orders) {
  const map = new Map();
  orders.forEach((order) => {
    const key = order.customer || '散客';
    if (!map.has(key)) map.set(key, { name: key, revenue: 0, orders: 0, last: order.date, items: 0 });
    const item = map.get(key);
    item.revenue = round2(item.revenue + orderRevenue(order));
    item.orders += 1;
    item.items += orderUnitCount(order);
    if (toDate(order.date) > toDate(item.last)) item.last = order.date;
  });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

function revenueByCategory(orders) {
  const map = new Map();
  orders.forEach((order) => {
    order.lines.forEach((line) => {
      const flower = getFlower(line.flowerId);
      const category = flower ? flower.category : '其他';
      map.set(category, round2((map.get(category) || 0) + line.qty * line.unitPrice));
    });
  });
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function inventoryByCategory() {
  const map = new Map();
  activeFlowers().forEach((flower) => {
    const value = round2(flower.stock * flower.cost);
    map.set(flower.category, round2((map.get(flower.category) || 0) + value));
  });
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function salesSeries(days) {
  const rows = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = addDays(new Date(), -i);
    const key = localDateKey(day);
    const dayOrders = completedOrders().filter((order) => localDateKey(order.date) === key);
    const summary = summarizeOrders(dayOrders);
    rows.push({
      date: day,
      key,
      label: formatDate(day, 'short'),
      revenue: summary.revenue,
      profit: summary.profit,
      orders: summary.count
    });
  }
  return rows;
}

function lossRate(revenue, loss) {
  if (!revenue) return 0;
  return loss / revenue;
}

function nextOrderNo(dateValue = new Date()) {
  const key = localDateKey(dateValue);
  const prefix = `SO-${key.replace(/-/g, '')}-`;
  const count = state.orders.filter((o) => String(o.no).startsWith(prefix)).length + 1;
  return `${prefix}${String(count).padStart(3, '0')}`;
}

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

function stockMovementTone(type) {
  if (type === 'loss') return 'red';
  if (type === 'sale') return 'blue';
  if (type === 'refund') return 'green';
  if (type === 'in' || type === 'initial') return 'green';
  return 'gold';
}

function paymentIcon() {
  return 'credit-card';
}
