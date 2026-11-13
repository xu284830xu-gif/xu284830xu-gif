/* 花间集 · 服务端经营数据工具
 * 所有工具只读，不直接修改店铺数据。AI 给出的写操作建议由用户在页面确认后执行。
 */

const DAY = 86400000;

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function startOfDay(value = new Date()) {
  const date = toDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysBetween(from, to = new Date()) {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.max(0, Math.floor((b - a) / DAY));
}

function activeFlowers(state) {
  return (state.flowers || []).filter((flower) => flower.active !== false);
}

function completedOrders(state) {
  return (state.orders || []).filter((order) => order.status === 'completed');
}

function inLastDays(value, days) {
  const date = toDate(value);
  return date >= startOfDay(new Date(Date.now() - (days - 1) * DAY)) && date <= new Date();
}

function orderRevenue(order) {
  return round2((order.lines || []).reduce((sum, line) => sum + line.qty * line.unitPrice, 0));
}

function orderCost(order) {
  return round2((order.lines || []).reduce((sum, line) => sum + line.qty * line.cost, 0));
}

function orderUnits(order) {
  return (order.lines || []).reduce((sum, line) => sum + line.qty, 0);
}

function marginOf(price, cost) {
  return price > 0 ? round2(((price - cost) / price) * 1000) / 1000 : 0;
}

function freshness(flower) {
  const days = daysBetween(flower.restockedAt || flower.createdAt || new Date());
  if (flower.stock <= 0) return { label: '无在库', days };
  if (days >= 7) return { label: '滞销风险', days };
  if (days >= 5) return { label: '需要关注', days };
  if (days >= 3) return { label: '正常周转', days };
  return { label: '新鲜到店', days };
}

export function inventoryOverview(state) {
  const flowers = activeFlowers(state);
  const low = flowers.filter((flower) => flower.stock <= flower.minStock);
  const empty = flowers.filter((flower) => flower.stock <= 0);
  const slow = flowers.filter((flower) => flower.stock > 0 && daysBetween(flower.restockedAt || flower.createdAt) >= 7);
  const topValue = [...flowers]
    .sort((a, b) => b.stock * b.cost - a.stock * a.cost)
    .slice(0, 5)
    .map((flower) => ({
      name: flower.name,
      stock: flower.stock,
      unit: flower.unit,
      stock_cost: round2(flower.stock * flower.cost),
      min_stock: flower.minStock
    }));

  return {
    sku_count: flowers.length,
    total_units: flowers.reduce((sum, flower) => sum + flower.stock, 0),
    stock_cost: round2(flowers.reduce((sum, flower) => sum + flower.stock * flower.cost, 0)),
    retail_value: round2(flowers.reduce((sum, flower) => sum + flower.stock * flower.price, 0)),
    low_stock_count: low.length,
    empty_count: empty.length,
    slow_moving_count: slow.length,
    low_stock_items: low.map((flower) => ({
      name: flower.name,
      stock: flower.stock,
      min_stock: flower.minStock,
      unit: flower.unit,
      shortfall: Math.max(0, flower.minStock - flower.stock)
    })),
    slow_moving_items: slow.map((flower) => ({
      name: flower.name,
      stock: flower.stock,
      unit: flower.unit,
      days_on_shelf: freshness(flower).days,
      stock_cost: round2(flower.stock * flower.cost)
    })),
    top_value_items: topValue,
    generated_at: new Date().toISOString()
  };
}

export function salesSummary(state, days = 7) {
  const span = Math.max(1, Math.min(90, Math.round(Number(days) || 7)));
  const orders = completedOrders(state).filter((order) => inLastDays(order.date, span));
  const revenue = round2(orders.reduce((sum, order) => sum + orderRevenue(order), 0));
  const cost = round2(orders.reduce((sum, order) => sum + orderCost(order), 0));
  const profit = round2(revenue - cost);
  const units = orders.reduce((sum, order) => sum + orderUnits(order), 0);
  const loss = round2((state.movements || [])
    .filter((movement) => movement.type === 'loss' && inLastDays(movement.date, span))
    .reduce((sum, movement) => sum + Math.abs(movement.change) * (Number(movement.unitCost) || 0), 0));

  const productMap = new Map();
  orders.forEach((order) => {
    (order.lines || []).forEach((line) => {
      const key = line.flowerId || line.name;
      const item = productMap.get(key) || { name: line.name, units: 0, revenue: 0, profit: 0 };
      item.units += line.qty;
      item.revenue = round2(item.revenue + line.qty * line.unitPrice);
      item.profit = round2(item.profit + line.qty * (line.unitPrice - line.cost));
      productMap.set(key, item);
    });
  });
  const topProducts = [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((item) => ({
      ...item,
      margin: item.revenue > 0 ? round2(item.profit / item.revenue) : 0
    }));

  const customerMap = new Map();
  orders.forEach((order) => {
    const key = order.customer || '散客';
    const item = customerMap.get(key) || { name: key, orders: 0, revenue: 0 };
    item.orders += 1;
    item.revenue = round2(item.revenue + orderRevenue(order));
    customerMap.set(key, item);
  });
  const topCustomers = [...customerMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return {
    range_days: span,
    order_count: orders.length,
    units,
    revenue,
    cost,
    gross_profit: profit,
    gross_margin: revenue > 0 ? round2(profit / revenue) : 0,
    loss_cost: loss,
    net_profit: round2(profit - loss),
    top_products: topProducts,
    top_customers: topCustomers,
    generated_at: new Date().toISOString()
  };
}

export function restockRecommendations(state, limit = 5) {
  const flowers = activeFlowers(state);
  const result = flowers.map((flower) => {
    let sold7 = 0;
    completedOrders(state).forEach((order) => {
      if (!inLastDays(order.date, 7)) return;
      (order.lines || []).forEach((line) => {
        if (line.flowerId === flower.id) sold7 += line.qty;
      });
    });
    const daily = sold7 / 7;
    const target = Math.ceil(daily * 5 + flower.minStock);
    const suggested = Math.max(0, target - flower.stock);
    const coverDays = daily > 0 ? round2(flower.stock / daily) : null;
    return {
      name: flower.name,
      stock: flower.stock,
      min_stock: flower.minStock,
      unit: flower.unit,
      sold_last_7_days: sold7,
      daily_sales: round2(daily),
      cover_days: coverDays,
      suggested_restock: suggested,
      reason: suggested > 0
        ? `近7日售出${sold7}${flower.unit}，按5日覆盖与安全库存估算，建议补${suggested}${flower.unit}`
        : '当前库存已覆盖近期销量与安全库存',
      priority: flower.stock <= flower.minStock ? '高' : suggested > 0 ? '中' : '低'
    };
  });

  return {
    recommendations: result
      .filter((item) => item.suggested_restock > 0)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority === '高' ? -1 : 1;
        return b.suggested_restock - a.suggested_restock;
      })
      .slice(0, Math.max(1, Math.min(20, Number(limit) || 5))),
    checked_sku: flowers.length,
    generated_at: new Date().toISOString()
  };
}

function findFlowerMatches(state, name) {
  const query = String(name || '').trim().toLowerCase();
  const flowers = activeFlowers(state);
  if (!query) return [];
  const exact = flowers.filter((flower) => flower.name.toLowerCase() === query);
  if (exact.length) return exact;
  return flowers.filter((flower) => [flower.name, flower.variety, flower.category, flower.color]
    .join(' ')
    .toLowerCase()
    .includes(query));
}

export function findFlower(state, name) {
  const matches = findFlowerMatches(state, name);
  if (!matches.length) {
    return {
      found: false,
      message: `没有找到与“${name}”匹配的花卉。`,
      available_flowers: activeFlowers(state).map((flower) => flower.name)
    };
  }
  const flower = matches[0];
  let sold7 = 0;
  let revenue30 = 0;
  let sold30 = 0;
  completedOrders(state).forEach((order) => {
    (order.lines || []).forEach((line) => {
      if (line.flowerId !== flower.id) return;
      if (inLastDays(order.date, 7)) sold7 += line.qty;
      if (inLastDays(order.date, 30)) {
        sold30 += line.qty;
        revenue30 += line.qty * line.unitPrice;
      }
    });
  });
  const fresh = freshness(flower);
  return {
    found: true,
    name: flower.name,
    variety: flower.variety,
    category: flower.category,
    color: flower.color,
    grade: flower.grade,
    unit: flower.unit,
    price: flower.price,
    cost: flower.cost,
    margin: marginOf(flower.price, flower.cost),
    stock: flower.stock,
    min_stock: flower.minStock,
    stock_status: flower.stock <= 0 ? '缺货' : flower.stock <= flower.minStock ? '低库存' : '充足',
    shelf_days: fresh.days,
    shelf_status: fresh.label,
    supplier: flower.supplier,
    sold_last_7_days: sold7,
    sold_last_30_days: sold30,
    revenue_last_30_days: round2(revenue30),
    other_matches: matches.slice(1, 5).map((item) => item.name),
    generated_at: new Date().toISOString()
  };
}

export function suggestPrice(state, flowerName, targetMargin = 0.45) {
  const matches = findFlowerMatches(state, flowerName);
  if (!matches.length) {
    return {
      found: false,
      message: `没有找到与“${flowerName}”匹配的花卉。`,
      available_flowers: activeFlowers(state).map((flower) => flower.name)
    };
  }
  const flower = matches[0];
  const margin = Math.max(0.1, Math.min(0.8, Number(targetMargin) || 0.45));
  const suggested = round2(flower.cost / (1 - margin));
  const currentMargin = marginOf(flower.price, flower.cost);
  return {
    found: true,
    name: flower.name,
    unit: flower.unit,
    cost: flower.cost,
    current_price: flower.price,
    current_margin: currentMargin,
    target_margin: margin,
    suggested_price: suggested,
    price_difference: round2(suggested - flower.price),
    explanation: `按成本${flower.cost}元、目标毛利率${Math.round(margin * 100)}%倒推，建议售价${suggested}元。当前售价${flower.price}元，毛利率${Math.round(currentMargin * 1000) / 10}%。`,
    note: '建议价仅作为定价参考，实际价格还需结合花材品质、季节、周边市场与顾客接受度。',
    generated_at: new Date().toISOString()
  };
}

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_inventory_overview',
      description: '获取当前库存总览：花卉种类、总数量、库存成本、低库存清单、滞销清单和高价值库存。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sales_summary',
      description: '获取指定天数内的销售与利润汇总，包括营收、成本、毛利、净利、损耗、热销商品和客户贡献。',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'integer', description: '统计天数，取值范围1-90，默认7天' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_restock_recommendations',
      description: '根据近7日销量和安全库存计算补货建议，返回需要补货的花卉、建议数量和优先级。',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: '最多返回几条建议，默认5' }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_flower_details',
      description: '查询某一种花的当前售价、成本、毛利率、库存、库龄、近7日与近30日销量。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '花卉名称或名称中的关键词，例如“玫瑰”“向日葵”' }
        },
        required: ['name'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'suggest_price',
      description: '根据单位成本和目标毛利率，为某一种花倒推建议售价。',
      parameters: {
        type: 'object',
        properties: {
          flowerName: { type: 'string', description: '花卉名称或关键词' },
          targetMargin: { type: 'number', description: '目标毛利率，0.1-0.8之间，例如0.45表示45%' }
        },
        required: ['flowerName'],
        additionalProperties: false
      }
    }
  }
];

export const TOOL_LABELS = {
  get_inventory_overview: '库存总览',
  get_sales_summary: '销售利润',
  get_restock_recommendations: '补货建议',
  get_flower_details: '花卉详情',
  suggest_price: '定价试算'
};

export function executeTool(name, args, state) {
  const input = args && typeof args === 'object' ? args : {};
  switch (name) {
    case 'get_inventory_overview':
      return inventoryOverview(state);
    case 'get_sales_summary':
      return salesSummary(state, input.days);
    case 'get_restock_recommendations':
      return restockRecommendations(state, input.limit);
    case 'get_flower_details':
      return findFlower(state, input.name);
    case 'suggest_price':
      return suggestPrice(state, input.flowerName, input.targetMargin);
    default:
      return { error: `未知工具：${name}` };
  }
}
