import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://127.0.0.1:8787';

async function json(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const data = await response.json();
  return { response, data };
}

const health = await json('/api/health');
assert.equal(health.response.status, 200);
assert.equal(health.data.ok, true);
console.log('health ok:', health.data.state);

const state = await json('/api/state');
assert.equal(state.response.status, 200);
assert.ok(Array.isArray(state.data.flowers));
assert.ok(Array.isArray(state.data.orders));
console.log('state ok:', state.data.flowers.length, 'flowers,', state.data.orders.length, 'orders');

const summary = await json('/api/summary?days=7');
assert.equal(summary.response.status, 200);
assert.ok(typeof summary.data.revenue === 'number');
console.log('summary ok:', summary.data.revenue, summary.data.net_profit);

const inventory = await json('/api/inventory');
assert.equal(inventory.response.status, 200);
assert.ok(Array.isArray(inventory.data.low_stock_items));
console.log('inventory ok:', inventory.data.low_stock_count, 'low stock');

const restock = await json('/api/restock?limit=3');
assert.equal(restock.response.status, 200);
assert.ok(Array.isArray(restock.data.recommendations));
console.log('restock ok:', restock.data.recommendations.length, 'recommendations');

const tools = await json('/api/assistant/tools');
assert.equal(tools.response.status, 200);
assert.equal(tools.data.tools.length, 5);
console.log('tools ok:', tools.data.tools.map((tool) => tool.label).join(' / '));

console.log('API tests passed');
