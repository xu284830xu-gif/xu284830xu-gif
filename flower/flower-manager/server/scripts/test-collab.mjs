import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:8787';
const clone = (value) => JSON.parse(JSON.stringify(value));
const original = await fetch(`${base}/api/state`).then((r) => r.json());
const revision0 = original.meta.revision;

async function sync(payload) {
  const response = await fetch(`${base}/api/state/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });
  return { status: response.status, data: await response.json() };
}

try {
  const baseA = clone(original);
  const nextA = clone(original);
  nextA.flowers[0].stock += 1;
  nextA.meta.updatedAt = new Date().toISOString();
  const a = await sync({ base: baseA, next: nextA, client: { id: 'qa-a', name: '测试A' } });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  console.log('A sync ok, revision', a.data.revision);

  const baseB = clone(original);
  const nextB = clone(original);
  nextB.flowers[1].stock += 2;
  nextB.meta.updatedAt = new Date().toISOString();
  const b = await sync({ base: baseB, next: nextB, client: { id: 'qa-b', name: '测试B' } });
  assert.equal(b.status, 200, JSON.stringify(b.data));
  console.log('B sync ok, revision', b.data.revision);

  const merged = await fetch(`${base}/api/state`).then((r) => r.json());
  assert.equal(merged.flowers[0].stock, original.flowers[0].stock + 1);
  assert.equal(merged.flowers[1].stock, original.flowers[1].stock + 2);
  console.log('non-overlapping merge preserved both changes');

  const nextConflict = clone(original);
  nextConflict.flowers[0].stock += 9;
  nextConflict.meta.updatedAt = new Date().toISOString();
  const conflict = await sync({ base: original, next: nextConflict, client: { id: 'qa-b', name: '测试B' } });
  assert.equal(conflict.status, 409);
  assert.ok(conflict.data.conflicts.some((item) => item.collection === 'flowers'));
  console.log('same-entity concurrent edit rejected with 409:', conflict.data.conflicts[0]);

  // SSE: open a stream, make a non-overlapping change and ensure an event arrives.
  const controller = new AbortController();
  const stream = await fetch(`${base}/api/events?clientId=qa-sse&name=SSE测试`, { signal: controller.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawHello = false;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.includes('event: hello')) sawHello = true;
    if (sawHello) break;
  }
  assert.ok(sawHello, 'SSE hello not received');
  const current = await fetch(`${base}/api/state`).then((r) => r.json());
  const pushNext = clone(current);
  pushNext.flowers[1].stock += 1;
  const push = await sync({ base: current, next: pushNext, client: { id: 'qa-sse-pusher', name: '推送测试' } });
  assert.equal(push.status, 200);
  let sawState = false;
  const stateDeadline = Date.now() + 5000;
  while (Date.now() < stateDeadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (buffer.includes('event: state')) { sawState = true; break; }
  }
  controller.abort();
  assert.ok(sawState, 'SSE state event not received');
  console.log('SSE realtime event received');
} finally {
  const current = await fetch(`${base}/api/state`).then((r) => r.json());
  const restored = await sync({ base: current, next: original, client: { id: 'qa-restore', name: '测试恢复' } });
  console.log('restore status', restored.status, 'revision', restored.data?.revision);
  const finalState = await fetch(`${base}/api/state`).then((r) => r.json());
  assert.equal(finalState.flowers[0].stock, original.flowers[0].stock);
  assert.equal(finalState.flowers[1].stock, original.flowers[1].stock);
  console.log('test data restored');
}
