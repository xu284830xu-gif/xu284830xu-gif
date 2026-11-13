/* 花间集 · 全栈服务
 * 运行：node server/server.mjs
 * 默认地址：http://localhost:8787
 */

import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { inventoryOverview, salesSummary, restockRecommendations, TOOL_DEFINITIONS, TOOL_LABELS } from './business-tools.mjs';
import { chatWithAssistant, modelInfo } from './assistant.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SEED_FILE = path.join(__dirname, 'seed.json');
const INDEX_FILE = path.join(APP_ROOT, 'index.html');
const SHOP_FILE = path.join(APP_ROOT, 'shop.html');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const STARTED_AT = Date.now();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

let state = null;
let writeQueue = Promise.resolve();
let syncQueue = Promise.resolve();
let lastSavedAt = null;
const assistantBuckets = new Map();
let assistantGlobalBucket = { start: Date.now(), count: 0 };
const storefrontBuckets = new Map();
const sseClients = new Map();
const pollClients = new Map();
let sseSequence = 0;
let lastChange = null;

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function assistantRateLimit(req) {
  const now = Date.now();
  if (now - assistantGlobalBucket.start > 60 * 60 * 1000) {
    assistantGlobalBucket = { start: now, count: 0 };
  }
  assistantGlobalBucket.count += 1;
  if (assistantGlobalBucket.count > 300) {
    return { ok: false, retryAfter: 60 };
  }
  const ip = clientIp(req);
  const bucket = assistantBuckets.get(ip) || [];
  const recent = bucket.filter((time) => now - time < 5 * 60 * 1000);
  if (recent.length >= 12) {
    assistantBuckets.set(ip, recent);
    return { ok: false, retryAfter: Math.ceil((5 * 60 * 1000 - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  assistantBuckets.set(ip, recent);
  if (assistantBuckets.size > 5000) {
    for (const [key, times] of assistantBuckets) {
      if (!times.length || now - times[times.length - 1] > 10 * 60 * 1000) assistantBuckets.delete(key);
    }
  }
  return { ok: true };
}

function storefrontRateLimit(req) {
  const now = Date.now();
  const ip = clientIp(req);
  const bucket = (storefrontBuckets.get(ip) || []).filter((time) => now - time < 10 * 60 * 1000);
  if (bucket.length >= 20) {
    storefrontBuckets.set(ip, bucket);
    return { ok: false, retryAfter: Math.ceil((10 * 60 * 1000 - (now - bucket[0])) / 1000) };
  }
  bucket.push(now);
  storefrontBuckets.set(ip, bucket);
  return { ok: true };
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nextOrderNo(date = new Date()) {
  const prefix = `SO-${localDateKey(date).replace(/-/g, '')}-`;
  const count = state.orders.filter((order) => String(order.no).startsWith(prefix)).length + 1;
  return `${prefix}${String(count).padStart(3, '0')}`;
}

function customerOrderView(order) {
  return {
    id: order.id,
    no: order.no,
    createdAt: order.date,
    customer: { name: order.customer, phone: order.customerPhone || '' },
    payment: order.payment,
    paymentStatus: order.paymentStatus || 'paid',
    status: order.status,
    total: order.total,
    delivery: order.delivery || { method: 'pickup', methodLabel: '到店自提' },
    lines: order.lines.map((line) => ({
      flowerId: line.flowerId,
      name: line.name,
      variety: line.variety,
      unit: line.unit,
      qty: line.qty,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal
    }))
  };
}

async function ensureState() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    validateState(parsed);
    state = parsed;
    state.meta = state.meta && typeof state.meta === 'object' ? state.meta : {};
    if (!Number.isFinite(Number(state.meta.revision)) || Number(state.meta.revision) < 1) {
      state.meta.revision = 1;
      await persistState(state);
    }
    lastSavedAt = state.meta?.updatedAt || null;
    return;
  } catch (error) {
    if (error.code !== 'ENOENT' && error.name !== 'SyntaxError') {
      console.warn('[state] 读取失败，改用 seed:', error.message);
    }
  }
  const seed = JSON.parse(await readFile(SEED_FILE, 'utf8'));
  validateState(seed);
  seed.meta = seed.meta && typeof seed.meta === 'object' ? seed.meta : {};
  seed.meta.revision = 1;
  seed.meta.updatedAt = new Date().toISOString();
  state = seed;
  await persistState(seed);
}

function validateState(value) {
  if (!value || typeof value !== 'object') throw new Error('state 必须是对象');
  for (const key of ['flowers', 'orders']) {
    if (!Array.isArray(value[key])) throw new Error(`state.${key} 必须是数组`);
  }
  if (value.priceHistory && !Array.isArray(value.priceHistory)) throw new Error('state.priceHistory 必须是数组');
  if (value.movements && !Array.isArray(value.movements)) throw new Error('state.movements 必须是数组');
  return true;
}

function prepareState(next) {
  validateState(next);
  const clean = JSON.parse(JSON.stringify(next));
  clean.version = 1;
  clean.priceHistory = Array.isArray(clean.priceHistory) ? clean.priceHistory : [];
  clean.movements = Array.isArray(clean.movements) ? clean.movements : [];
  clean.settings = clean.settings && typeof clean.settings === 'object' ? clean.settings : {};
  clean.meta = clean.meta && typeof clean.meta === 'object' ? clean.meta : {};
  clean.meta.revision = Number(clean.meta.revision) || 1;
  clean.meta.updatedAt = new Date().toISOString();
  return clean;
}

async function persistState(next) {
  const tmp = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  const body = JSON.stringify(next, null, 2);
  writeQueue = writeQueue.then(async () => {
    await writeFile(tmp, body, 'utf8');
    await rename(tmp, STATE_FILE);
    lastSavedAt = next.meta?.updatedAt || new Date().toISOString();
  });
  return writeQueue;
}

function sendJson(res, status, data) {
  const text = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(text);
}

/* ---------- 状态差分合并 / 冲突检测 ---------- */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function deepEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function mapById(items) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (item && item.id !== undefined && item.id !== null) map.set(String(item.id), item);
  });
  return map;
}

function collectionChanges(baseItems, nextItems) {
  const baseMap = mapById(baseItems);
  const nextMap = mapById(nextItems);
  const changes = new Map();
  const keys = new Set([...baseMap.keys(), ...nextMap.keys()]);
  keys.forEach((id) => {
    const before = baseMap.get(id);
    const after = nextMap.get(id);
    if (!deepEqual(before, after)) changes.set(id, after === undefined ? null : after);
  });
  return { changes, baseMap, nextMap };
}

function applyCollection(currentItems, changes, type) {
  const map = mapById(currentItems);
  const additions = [];
  changes.forEach((value, id) => {
    if (value === null) {
      map.delete(id);
    } else {
      if (!map.has(id)) additions.push(value);
      map.set(id, value);
    }
  });
  let result = Array.from(map.values());
  if (type === 'flowers') {
    if (additions.length) {
      const addIds = new Set(additions.map((item) => String(item.id)));
      result = [...additions, ...result.filter((item) => !addIds.has(String(item.id)))];
    }
  } else {
    result.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  }
  return result;
}

function inferAction(changes, settingsChanged, base) {
  const orderChanges = changes.get('orders') || new Map();
  const flowerChanges = changes.get('flowers') || new Map();
  const priceChanges = changes.get('priceHistory') || new Map();
  const movementChanges = changes.get('movements') || new Map();
  const baseOrders = mapById(base?.orders || []);
  const baseFlowers = mapById(base?.flowers || []);
  let addedOrders = 0;
  let refundedOrders = 0;
  for (const [id, value] of orderChanges) {
    if (value && value.status === 'refunded' && baseOrders.get(id)?.status !== 'refunded') refundedOrders += 1;
    else if (value && !baseOrders.has(id)) addedOrders += 1;
  }
  if (refundedOrders > 0) return '办理了退款';
  if (addedOrders > 0) return '开了一单';
  let addedFlowers = 0;
  let removedFlowers = 0;
  let updatedFlowers = 0;
  for (const [id, value] of flowerChanges) {
    if (!value) removedFlowers += 1;
    else if (!baseFlowers.has(id)) addedFlowers += 1;
    else updatedFlowers += 1;
  }
  if (addedFlowers > 0) return '新增了花卉';
  if (removedFlowers > 0) return '删除了花卉';
  if (movementChanges.size > 0) return '调整了库存';
  if (priceChanges.size > 0) return '调整了价格';
  if (updatedFlowers > 0) return '更新了花卉';
  if (settingsChanged) return '更新了店铺设置';
  return '更新了经营数据';
}

function mergeState(base, next, current) {
  const collections = ['flowers', 'orders', 'movements', 'priceHistory'];
  const conflicts = [];
  const changes = new Map();
  const changedNames = [];

  for (const key of collections) {
    const baseItems = Array.isArray(base[key]) ? base[key] : [];
    const nextItems = Array.isArray(next[key]) ? next[key] : [];
    const currentItems = Array.isArray(current[key]) ? current[key] : [];
    const { changes: collectionChange, baseMap } = collectionChanges(baseItems, nextItems);
    if (!collectionChange.size) {
      changes.set(key, collectionChange);
      continue;
    }
    const currentMap = mapById(currentItems);
    collectionChange.forEach((after, id) => {
      if (!deepEqual(currentMap.get(id), baseMap.get(id))) {
        const name = after?.name || currentMap.get(id)?.name || baseMap.get(id)?.name || id;
        conflicts.push({ collection: key, id, name });
      }
    });
    changes.set(key, collectionChange);
    if (collectionChange.size) changedNames.push(key);
  }

  const baseSettings = base.settings && typeof base.settings === 'object' ? base.settings : {};
  const nextSettings = next.settings && typeof next.settings === 'object' ? next.settings : {};
  const currentSettings = current.settings && typeof current.settings === 'object' ? current.settings : {};
  const settingChanges = new Map();
  const settingKeys = new Set([...Object.keys(baseSettings), ...Object.keys(nextSettings)]);
  settingKeys.forEach((key) => {
    if (!deepEqual(baseSettings[key], nextSettings[key])) {
      if (!deepEqual(currentSettings[key], baseSettings[key])) {
        conflicts.push({ collection: 'settings', id: key, name: key });
      }
      settingChanges.set(key, nextSettings[key]);
    }
  });

  if (conflicts.length) {
    return { ok: false, conflicts, state: current };
  }

  const merged = JSON.parse(JSON.stringify(current));
  collections.forEach((key) => {
    const items = applyCollection(Array.isArray(merged[key]) ? merged[key] : [], changes.get(key) || new Map(), key);
    merged[key] = items;
  });
  const mergedSettings = { ...(merged.settings || {}) };
  settingChanges.forEach((value, key) => {
    if (value === undefined) delete mergedSettings[key];
    else mergedSettings[key] = value;
  });
  merged.settings = mergedSettings;
  merged.meta = {
    ...(merged.meta || {}),
    revision: (Number(current.meta?.revision) || 1) + 1,
    updatedAt: new Date().toISOString()
  };
  return {
    ok: true,
    state: merged,
    action: inferAction(changes, settingChanges.size > 0, base),
    changed: changedNames
  };
}

function withSyncLock(task) {
  const run = syncQueue.then(task, task);
  syncQueue = run.catch(() => {});
  return run;
}

/* ---------- SSE 实时协作 ---------- */
function clientColor(clientId) {
  const palette = ['#3C7462', '#C19A56', '#D99579', '#7C9BB0', '#A18EB5', '#A5AA83'];
  let hash = 0;
  for (const char of String(clientId)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function presencePayload() {
  const now = Date.now();
  const unique = new Map();
  sseClients.forEach((client) => {
    unique.set(client.clientId, client);
  });
  for (const [id, client] of pollClients) {
    if (now - client.lastSeen > 15000) {
      pollClients.delete(id);
      continue;
    }
    const current = unique.get(id);
    if (!current || (client.lastSeen || 0) >= (current.lastSeen || 0)) unique.set(id, client);
  }
  return {
    count: unique.size,
    clients: Array.from(unique.values()).map((client) => ({
      id: client.clientId,
      name: client.name,
      color: client.color,
      joinedAt: client.joinedAt
    }))
  };
}

function sseSend(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // connection closed
  }
}

function broadcastSse(event, data, exceptClientId = null) {
  sseClients.forEach((client) => {
    if (exceptClientId && client.clientId === exceptClientId) return;
    sseSend(client.res, event, data);
  });
}

function broadcastPresence() {
  broadcastSse('presence', presencePayload());
}

function handleSse(req, res, url) {
  const clientId = String(url.searchParams.get('clientId') || `guest_${sseSequence + 1}`).slice(0, 80);
  const name = String(url.searchParams.get('name') || '花友').trim().slice(0, 24) || '花友';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('retry: 3000\n\n');
  const key = ++sseSequence;
  const client = {
    key,
    clientId,
    name,
    color: clientColor(clientId),
    joinedAt: new Date().toISOString(),
    res
  };
  sseClients.set(key, client);
  sseSend(res, 'hello', {
    self: { id: clientId, name },
    revision: Number(state.meta?.revision) || 1,
    state,
    presence: presencePayload()
  });
  broadcastPresence();

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(ping);
    }
  }, 15000);

  const cleanup = () => {
    clearInterval(ping);
    if (sseClients.delete(key)) broadcastPresence();
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);
}


async function readJson(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('请求体过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('请求体不是合法 JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function stateStats() {
  return {
    flowers: state?.flowers?.length || 0,
    orders: state?.orders?.length || 0,
    movements: state?.movements?.length || 0,
    priceHistory: state?.priceHistory?.length || 0,
    revision: Number(state?.meta?.revision) || 1,
    online: presencePayload().count,
    updatedAt: lastSavedAt
  };
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    });
    res.end();
    return;
  }

  if (pathname === '/api/events' && req.method === 'GET') {
    handleSse(req, res, url);
    return;
  }

  if (pathname === '/api' || pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: '花间集 API',
      version: '1.2.0',
      collaboration: {
        mode: 'shared-shop',
        sse: true,
        pollingFallback: true,
        online: presencePayload().count
      },
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
      now: new Date().toISOString(),
      state: stateStats(),
      assistant: modelInfo()
    });
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    sendJson(res, 200, state);
    return;
  }

  if (pathname === '/api/collab/presence' && req.method === 'GET') {
    sendJson(res, 200, presencePayload());
    return;
  }

  if (pathname === '/api/collab/poll' && req.method === 'GET') {
    const clientId = String(url.searchParams.get('clientId') || 'guest_poll').slice(0, 80);
    const name = String(url.searchParams.get('name') || '花友').trim().slice(0, 24) || '花友';
    const since = Number(url.searchParams.get('since') || 0);
    const existing = pollClients.get(clientId);
    const isNew = !existing;
    pollClients.set(clientId, {
      clientId,
      name,
      color: existing?.color || clientColor(clientId),
      joinedAt: existing?.joinedAt || new Date().toISOString(),
      lastSeen: Date.now()
    });
    if (isNew) broadcastPresence();
    const revision = Number(state.meta?.revision) || 1;
    const changed = since < revision;
    const payload = {
      revision,
      changed,
      presence: presencePayload()
    };
    if (changed) {
      payload.state = state;
      payload.actor = lastChange?.actor || null;
      payload.action = lastChange?.action || '更新了经营数据';
      payload.at = lastChange?.at || state.meta?.updatedAt || new Date().toISOString();
    }
    sendJson(res, 200, payload);
    return;
  }

  if (pathname === '/api/state/sync' && req.method === 'POST') {
    const body = await readJson(req, 15 * 1024 * 1024);
    if (!body || typeof body !== 'object' || !body.base || !body.next) {
      sendJson(res, 400, { error: 'base 和 next 不能为空' });
      return;
    }
    try {
      validateState(body.base);
      validateState(body.next);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }
    const actor = {
      id: String(body.client?.id || 'guest').slice(0, 80),
      name: String(body.client?.name || '花友').trim().slice(0, 24) || '花友'
    };
    const result = await withSyncLock(async () => {
      const merged = mergeState(body.base, body.next, state);
      if (!merged.ok) return merged;
      state = merged.state;
      await persistState(state);
      const payload = {
        revision: Number(state.meta?.revision) || 1,
        actor,
        action: merged.action,
        at: new Date().toISOString(),
        state,
        presence: presencePayload()
      };
      lastChange = { revision: payload.revision, actor, action: merged.action, at: payload.at };
      broadcastSse('state', payload, actor.id);
      return merged;
    });
    if (!result.ok) {
      sendJson(res, 409, {
        error: '数据已被其他协作者更新',
        message: '同事刚刚修改了同一项数据，页面已刷新，请重新操作。',
        conflicts: result.conflicts,
        state: result.state,
        revision: Number(result.state?.meta?.revision) || 1
      });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      revision: Number(state.meta?.revision) || 1,
      action: result.action,
      changed: result.changed,
      state
    });
    return;
  }

  if (pathname === '/api/storefront' && req.method === 'GET') {
    const products = state.flowers
      .filter((flower) => flower.active !== false)
      .map((flower) => ({
        id: flower.id,
        name: flower.name,
        variety: flower.variety,
        category: flower.category,
        color: flower.color,
        grade: flower.grade,
        unit: flower.unit,
        price: flower.price,
        stock: Math.max(0, Math.round(Number(flower.stock) || 0)),
        note: flower.note,
        restockedAt: flower.restockedAt,
        createdAt: flower.createdAt
      }));
    sendJson(res, 200, {
      ok: true,
      revision: Number(state.meta?.revision) || 1,
      updatedAt: state.meta?.updatedAt || null,
      shop: {
        name: state.settings?.shopName || '花间集',
        owner: state.settings?.owner || '花掌柜',
        hours: process.env.SHOP_HOURS || '09:00 - 21:00',
        phone: process.env.SHOP_PHONE || '',
        deliveryNote: process.env.SHOP_DELIVERY_NOTE || '同城配送 · 当日鲜花 · 满 ¥99 免配送费',
        pickupNote: process.env.SHOP_PICKUP_NOTE || '到店自提 · 下单后请保持电话畅通'
      },
      categories: [...new Set(products.map((product) => product.category))],
      products
    });
    return;
  }

  if (pathname === '/api/storefront/orders' && req.method === 'POST') {
    const rate = storefrontRateLimit(req);
    if (!rate.ok) {
      res.setHeader('Retry-After', String(rate.retryAfter || 60));
      sendJson(res, 429, { error: '下单过于频繁，请稍后再试。' });
      return;
    }
    const body = await readJson(req, 512 * 1024);
    const customerName = String(body.customer?.name || '').trim();
    const customerPhone = String(body.customer?.phone || '').trim();
    const requestId = String(body.requestId || '').trim().slice(0, 80);
    const paymentMethod = String(body.paymentMethod || '').trim();
    const paymentLabel = paymentMethod === 'wechat' ? '微信' : paymentMethod === 'alipay' ? '支付宝' : '';
    const deliveryMethod = body.delivery?.method === 'delivery' ? 'delivery' : 'pickup';
    const deliveryAddress = String(body.delivery?.address || '').trim();
    const deliveryDate = String(body.delivery?.date || '').trim();
    const deliveryTime = String(body.delivery?.time || '').trim();
    const note = String(body.note || '').trim().slice(0, 200);
    if (customerName.length < 2 || customerName.length > 20) {
      sendJson(res, 400, { error: '请填写 2-20 个字的收货人称呼。' });
      return;
    }
    if (!/^[0-9+\-\s]{6,20}$/.test(customerPhone)) {
      sendJson(res, 400, { error: '请填写有效的联系电话。' });
      return;
    }
    if (!paymentLabel) {
      sendJson(res, 400, { error: '请选择支付方式。' });
      return;
    }
    if (deliveryMethod === 'delivery' && deliveryAddress.length < 5) {
      sendJson(res, 400, { error: '同城配送需要填写详细地址。' });
      return;
    }
    if (deliveryDate && /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) && deliveryDate < localDateKey(new Date())) {
      sendJson(res, 400, { error: '收花日期不能早于今天。' });
      return;
    }
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 20) {
      sendJson(res, 400, { error: '购物清单不能为空。' });
      return;
    }
    const requested = new Map();
    for (const item of body.items) {
      const id = String(item?.flowerId || '').trim();
      const qty = Math.floor(Number(item?.qty));
      if (!id || !Number.isFinite(qty) || qty <= 0 || qty > 99) {
        sendJson(res, 400, { error: '购物清单里有无效数量。' });
        return;
      }
      requested.set(id, (requested.get(id) || 0) + qty);
    }

    const result = await withSyncLock(async () => {
      if (requestId) {
        const existing = state.orders.find((order) => order.requestId === requestId);
        if (existing) return { ok: true, duplicate: true, order: existing };
      }
      const lines = [];
      for (const [flowerId, qty] of requested) {
        const flower = state.flowers.find((item) => item.id === flowerId);
        if (!flower || flower.active === false) {
          return { ok: false, status: 409, error: '有花卉已下架，请刷新后重新选择。' };
        }
        if ((Number(flower.stock) || 0) < qty) {
          return { ok: false, status: 409, error: `${flower.name} 库存不足，当前仅剩 ${flower.stock} ${flower.unit}。` };
        }
        lines.push({
          flower,
          flowerId: flower.id,
          name: flower.name,
          variety: flower.variety,
          unit: flower.unit,
          qty,
          unitPrice: roundMoney(flower.price),
          cost: roundMoney(flower.cost),
          subtotal: roundMoney(qty * flower.price)
        });
      }
      const total = roundMoney(lines.reduce((sum, line) => sum + line.subtotal, 0));
      const cost = roundMoney(lines.reduce((sum, line) => sum + line.cost * line.qty, 0));
      const now = new Date();
      const order = {
        id: `o_${randomUUID().slice(0, 8)}`,
        no: nextOrderNo(now),
        date: now.toISOString(),
        customer: customerName,
        customerPhone,
        payment: paymentLabel,
        paymentStatus: 'paid',
        channel: '线上花店',
        source: 'online',
        note,
        requestId,
        delivery: {
          method: deliveryMethod,
          methodLabel: deliveryMethod === 'delivery' ? '同城配送' : '到店自提',
          address: deliveryMethod === 'delivery' ? deliveryAddress : '',
          date: /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) ? deliveryDate : localDateKey(now),
          time: deliveryTime.slice(0, 40),
          note
        },
        lines: lines.map(({ flower, ...line }) => line),
        total,
        cost,
        profit: roundMoney(total - cost),
        status: 'completed',
        refundedAt: null
      };
      for (const line of lines) {
        const before = Math.round(Number(line.flower.stock) || 0);
        const after = before - line.qty;
        line.flower.stock = after;
        state.movements.unshift({
          id: `m_${randomUUID().slice(0, 8)}`,
          flowerId: line.flower.id,
          type: 'sale',
          change: -line.qty,
          before,
          after,
          unitCost: line.cost,
          note: `线上订单 · ${order.no}`,
          date: order.date,
          orderId: order.id
        });
      }
      state.orders.unshift(order);
      state.meta = state.meta || {};
      state.meta.revision = (Number(state.meta.revision) || 1) + 1;
      state.meta.updatedAt = order.date;
      await persistState(state);
      const change = {
        revision: state.meta.revision,
        actor: { id: `storefront_${customerPhone.slice(-4)}`, name: customerName },
        action: '线上收款',
        at: order.date
      };
      lastChange = change;
      broadcastSse('state', {
        ...change,
        state,
        presence: presencePayload()
      });
      return { ok: true, duplicate: false, order };
    });

    if (!result.ok) {
      sendJson(res, result.status || 409, { error: result.error || '下单失败，请稍后重试。' });
      return;
    }
    sendJson(res, result.duplicate ? 200 : 201, {
      ok: true,
      duplicate: Boolean(result.duplicate),
      order: customerOrderView(result.order),
      shop: { name: state.settings?.shopName || '花间集' }
    });
    return;
  }

  if (pathname === '/api/state' && req.method === 'PUT') {
    const body = await readJson(req);
    const next = prepareState(body);
    next.meta.revision = (Number(state.meta?.revision) || 1) + 1;
    state = next;
    await persistState(next);
    const at = new Date().toISOString();
    lastChange = {
      revision: Number(state.meta.revision) || 1,
      actor: { id: 'legacy', name: '后台' },
      action: '更新了经营数据',
      at
    };
    broadcastSse('state', {
      revision: state.meta.revision,
      actor: lastChange.actor,
      action: lastChange.action,
      at,
      state,
      presence: presencePayload()
    });
    sendJson(res, 200, { ok: true, updatedAt: lastSavedAt, state: stateStats() });
    return;
  }

  if (pathname === '/api/flowers' && req.method === 'GET') {
    const includeInactive = url.searchParams.get('all') === '1';
    sendJson(res, 200, {
      flowers: state.flowers.filter((flower) => includeInactive || flower.active !== false),
      total: state.flowers.length
    });
    return;
  }

  if (pathname === '/api/summary' && req.method === 'GET') {
    const days = Number(url.searchParams.get('days') || 7);
    sendJson(res, 200, salesSummary(state, days));
    return;
  }

  if (pathname === '/api/inventory' && req.method === 'GET') {
    sendJson(res, 200, inventoryOverview(state));
    return;
  }

  if (pathname === '/api/restock' && req.method === 'GET') {
    sendJson(res, 200, restockRecommendations(state, Number(url.searchParams.get('limit') || 5)));
    return;
  }

  if (pathname === '/api/assistant/tools' && req.method === 'GET') {
    sendJson(res, 200, {
      tools: TOOL_DEFINITIONS.map((tool) => ({
        name: tool.function.name,
        label: TOOL_LABELS[tool.function.name] || tool.function.name,
        description: tool.function.description
      })),
      model: modelInfo()
    });
    return;
  }

  if (pathname === '/api/assistant/chat' && req.method === 'POST') {
    const rate = assistantRateLimit(req);
    if (!rate.ok) {
      res.setHeader('Retry-After', String(rate.retryAfter || 60));
      sendJson(res, 429, { error: '提问有点频繁，请稍后再试。' });
      return;
    }
    const body = await readJson(req, 512 * 1024);
    if (!Array.isArray(body.messages) || !body.messages.length) {
      sendJson(res, 400, { error: 'messages 不能为空' });
      return;
    }
    const started = Date.now();
    try {
      const result = await chatWithAssistant({ state, messages: body.messages });
      console.log(`[assistant] ${Date.now() - started}ms fallback=${result.fallback} provider=${result.provider} tools=${result.toolTrace.length}`);
      sendJson(res, 200, result);
    } catch (error) {
      console.error('[assistant]', error);
      sendJson(res, 500, { error: 'AI 服务暂时不可用，请稍后重试。', detail: String(error.message || error).slice(0, 300) });
    }
    return;
  }

  sendJson(res, 404, { error: 'API 路径不存在', path: pathname });
}

function isSafeStaticPath(pathname) {
  if (pathname.startsWith('/server') || pathname.startsWith('/exports') || pathname.startsWith('/mobile-qa')) return false;
  if (pathname.startsWith('/.')) return false;
  return ['.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.txt', '.json'].includes(path.extname(pathname).toLowerCase());
}

async function serveIndex(res, autoOpenAi = false) {
  let html = await readFile(INDEX_FILE, 'utf8');
  html = html.replace('</head>', '  <link rel="stylesheet" href="assistant.css">\n  <link rel="stylesheet" href="collab.css">\n</head>');
  html = html.replace(
    '<script src="data.js"></script>',
    '  <script>window.APP_MODE = "server";</script>\n  <script src="data.js"></script>'
  );
  html = html.replace(
    '</body>',
    `  ${autoOpenAi ? '<script>window.__AUTO_OPEN_AI__ = true;</script>' : ''}\n  <script src="collab.js"></script>\n  <script src="assistant.js"></script>\n</body>`
  );
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  });
  res.end(html);
}

async function serveShop(res) {
  const html = await readFile(SHOP_FILE, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  });
  res.end(html);
}

async function serveStatic(res, pathname) {
  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (!isSafeStaticPath(pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const filePath = path.resolve(APP_ROOT, `.${pathname}`);
  if (!filePath.startsWith(APP_ROOT + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOENT' });
    const content = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ['.js', '.css'].includes(ext) ? 'no-cache' : ext === '.html' ? 'no-store' : 'public, max-age=60',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else if (url.pathname === '/' || url.pathname === '/index.html') {
      await serveIndex(res, false);
    } else if (url.pathname === '/ai') {
      await serveIndex(res, true);
    } else if (url.pathname === '/shop' || url.pathname === '/shop.html') {
      await serveShop(res);
    } else {
      await serveStatic(res, url.pathname);
    }
  } catch (error) {
    console.error('[request]', req.method, url.pathname, error);
    if (!res.headersSent) {
      sendJson(res, error.status || 500, { error: error.message || '服务器内部错误' });
    } else {
      res.end();
    }
  } finally {
    if (!url.pathname.startsWith('/api/assistant/chat')) {
      console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  }
});

server.requestTimeout = 120000;
server.headersTimeout = 125000;

await ensureState();
server.listen(PORT, HOST, () => {
  console.log(`花间集服务已启动: http://localhost:${PORT}`);
  console.log(`监听: ${HOST}:${PORT}`);
  console.log(`状态数据: ${STATE_FILE}`);
  console.log(`AI: ${JSON.stringify(modelInfo())}`);
});

function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
