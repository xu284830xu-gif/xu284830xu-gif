const base = 'http://127.0.0.1:8787';
const s0 = await fetch(`${base}/api/state`).then((r) => r.json());
const store = await fetch(`${base}/api/storefront`).then((r) => r.json());
const p1 = store.products[0];
const p2 = store.products[1];
const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const requestId = `qa-shop-${Date.now()}`;
const payload = {
  requestId,
  items: [{ flowerId: p1.id, qty: 2 }, { flowerId: p2.id, qty: 1 }],
  customer: { name: '测试顾客', phone: '13800000000' },
  delivery: { method: 'delivery', address: '花间集测试路 88 号 1 栋 101', date, time: '15:00 - 18:00', note: '测试线上订单' },
  note: '测试线上订单',
  paymentMethod: 'wechat'
};
const expectedTotal = Math.round((p1.price * 2 + p2.price) * 100) / 100;
let created = null;
try {
  const r1 = await fetch(`${base}/api/storefront/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) });
  const d1 = await r1.json();
  console.log('CREATE', r1.status, d1.order?.no, d1.order?.total, 'expected', expectedTotal, 'source', d1.order?.source || 'customer-view');
  if (r1.status !== 201) throw new Error(`create failed ${JSON.stringify(d1)}`);
  created = d1.order;
  const state1 = await fetch(`${base}/api/state`).then((r) => r.json());
  const adminOrder = state1.orders.find((order) => order.no === created.no);
  const flower1 = state1.flowers.find((f) => f.id === p1.id);
  const flower2 = state1.flowers.find((f) => f.id === p2.id);
  console.log('ADMIN_ORDER', Boolean(adminOrder), adminOrder?.source, adminOrder?.channel, adminOrder?.paymentStatus, adminOrder?.customerPhone);
  console.log('STOCK', { p1: [p1.stock, flower1.stock], p2: [p2.stock, flower2.stock] });
  console.log('LINES', adminOrder?.lines.map((l) => [l.name, l.qty, l.unitPrice]));

  const r2 = await fetch(`${base}/api/storefront/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) });
  const d2 = await r2.json();
  const state2 = await fetch(`${base}/api/state`).then((r) => r.json());
  console.log('IDEMPOTENT', r2.status, d2.duplicate, 'orders', state2.orders.length, 'stock', state2.flowers.find((f) => f.id === p1.id).stock);

  const poll = await fetch(`${base}/api/collab/poll?since=${s0.meta.revision}&clientId=qa-shop-poll&name=后台测试`).then((r) => r.json());
  console.log('POLL', { changed: poll.changed, actor: poll.actor, action: poll.action, revision: poll.revision, hasState: Boolean(poll.state) });
} finally {
  const current = await fetch(`${base}/api/state`).then((r) => r.json());
  const restore = await fetch(`${base}/api/state/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ base: current, next: s0, client: { id: 'qa-shop-restore', name: '测试恢复' } })
  });
  const rd = await restore.json();
  const final = await fetch(`${base}/api/state`).then((r) => r.json());
  console.log('RESTORE', restore.status, rd.action, 'orders', final.orders.length, 'stock', final.flowers.find((f) => f.id === p1.id).stock);
}
