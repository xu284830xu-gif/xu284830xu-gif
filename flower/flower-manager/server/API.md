# 花间集 · HTTP 接口文档

> 版本 `1.2.0`　｜　最后核对：2026-11-13　｜　实现：[server.mjs](server.mjs)　｜　业务计算：[business-tools.mjs](business-tools.mjs)
>
> 本文档与代码逐条核对过，行号会随版本变化，字段名不会。

---

## 1. 通用约定

| 项目 | 说明 |
| --- | --- |
| Base URL | 本地 `http://localhost:8787`；线上为部署域名（如 `https://xxx.onrender.com`） |
| 传输 | HTTP/1.1，请求与响应均为 UTF-8 JSON（SSE 除外） |
| 认证 | **无**。当前是共享单店协作版，所有访问者拥有同一店铺权限（见第 6 节） |
| CORS | 支持预检：`OPTIONS` 返回 `204` + `Access-Control-Allow-Methods: GET,POST,PUT,OPTIONS` |
| 幂等 | 仅下单接口支持，靠请求体里的 `requestId` |
| 超时 | 服务端 `requestTimeout = 120s`、`headersTimeout = 125s` |

### 请求体上限

| 接口 | 上限 |
| --- | --- |
| `POST /api/state/sync` | 15 MB |
| `POST /api/storefront/orders` | 512 KB |
| `POST /api/assistant/chat` | 512 KB |
| 其他 | 5 MB |

超限返回 `413`；不是合法 JSON 返回 `400 {"error":"请求体不是合法 JSON"}`。

### 统一错误体

```json
{ "error": "人能看懂的原因" }
```

冲突类错误额外带 `message` / `conflicts` / `state` / `revision`。

### 状态码

| 码 | 含义 | 出现场景 |
| --- | --- | --- |
| 200 | 成功 | 查询、同步、重复下单 |
| 201 | 已创建 | 首次下单成功 |
| 400 | 参数不合法 | 缺字段、类型不对、JSON 解析失败 |
| 404 | 路径不存在 | 未匹配的 `/api/*` |
| 409 | 冲突 / 业务拒绝 | 协作冲突、库存不足、商品下架 |
| 413 | 请求体过大 | 超过上限 |
| 429 | 触发限流 | 下单 20 次/10 分钟、AI 12 次/5 分钟 |
| 500 | 服务端内部错误 | 未预期异常（见第 5 节已知问题） |

---

## 2. 接口总表

| # | 方法 | 路径 | 用途 | 成功 | 主要错误 |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/api/health` | 健康检查、运行状态 | 200 | — |
| 2 | GET | `/api/state` | 读取完整经营状态 | 200 | — |
| 3 | GET | `/api/flowers?all=1` | 花卉列表 | 200 | — |
| 4 | GET | `/api/summary?days=7` | 营收 / 毛利 / 热销 | 200 | — |
| 5 | GET | `/api/inventory` | 库存总览与预警 | 200 | — |
| 6 | GET | `/api/restock?limit=5` | 智能补货建议 | 200 | — |
| 7 | GET | `/api/storefront` | 顾客端公开商品 | 200 | — |
| 8 | POST | `/api/storefront/orders` | 顾客下单（扣库存、生成订单） | 201 | 400 / 409 / 429 |
| 9 | POST | `/api/state/sync` | 协作保存（base/next 差分合并） | 200 | 400 / 409 |
| 10 | PUT | `/api/state` | 整份覆盖（兼容旧版） | 200 | 400 / 500 |
| 11 | GET | `/api/collab/presence` | 在线成员快照 | 200 | — |
| 12 | GET | `/api/collab/poll?since=` | 轮询同步（SSE 降级） | 200 | — |
| 13 | GET | `/api/events` | SSE 实时事件流 | 200 | — |
| 14 | GET | `/api/assistant/tools` | AI 可用工具与模型信息 | 200 | — |
| 15 | POST | `/api/assistant/chat` | AI 对话 + 工具调用 | 200 | 400 / 429 / 500 |

---

## 3. 接口详情

### 3.1 `GET /api/health`（也可 `GET /api`）

无参数。

```json
{
  "ok": true,
  "service": "花间集 API",
  "version": "1.2.0",
  "collaboration": { "mode": "shared-shop", "sse": true, "pollingFallback": true, "online": 0 },
  "uptimeSeconds": 5,
  "now": "2026-11-13T13:00:00.000Z",
  "state": {
    "flowers": 8, "orders": 23, "movements": 38, "priceHistory": 12,
    "revision": 45, "online": 0, "updatedAt": "2026-11-12T03:12:46.055Z"
  },
  "assistant": {
    "provider": "pollinations",
    "model": "openai-fast",
    "endpoint": "https://text.pollinations.ai/openai",
    "tools": true,
    "mode": "model+tools",
    "configured": true
  }
}
```

### 3.2 `GET /api/state`

返回完整 `state` 对象（`flowers` / `orders` / `movements` / `priceHistory` / `settings` / `meta`），字段见第 4 节。

```bash
curl http://localhost:8787/api/state
```

### 3.3 `GET /api/flowers`

| 参数 | 位置 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `all` | query | `0` / `1` | `0` | `1` 时连下架（`active:false`）的花一起返回 |

```json
{ "flowers": [ { "id": "f_seed_1", "name": "自由精神玫瑰", "stock": 105, "price": 18 } ], "total": 8 }
```

`total` 是**含下架**的总数，`flowers` 长度是过滤后的数量。

### 3.4 `GET /api/summary?days=7`

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `days` | number | 7 | 统计区间，自动夹在 1–90 |

```json
{
  "range_days": 7,
  "order_count": 6,
  "units": 42,
  "revenue": 1280.5,
  "cost": 610.2,
  "gross_profit": 670.3,
  "gross_margin": 0.523,
  "loss_cost": 36,
  "net_profit": 634.3,
  "top_products": [ { "name": "自由精神玫瑰", "units": 24, "revenue": 432, "profit": 228, "margin": 0.527 } ],
  "top_customers": [ { "name": "林小姐", "orders": 2, "revenue": 376 } ],
  "generated_at": "2026-11-13T13:00:00.000Z"
}
```

### 3.5 `GET /api/inventory`

```json
{
  "sku_count": 8,
  "total_units": 395,
  "stock_cost": 2268.4,
  "retail_value": 5103,
  "low_stock_count": 3,
  "empty_count": 1,
  "slow_moving_count": 1,
  "low_stock_items": [ { "name": "白荔枝玫瑰", "stock": 22, "min_stock": 30, "unit": "枝", "shortfall": 8 } ],
  "slow_moving_items": [ { "name": "蓝绣球", "stock": 9, "unit": "束", "days_on_shelf": 9, "stock_cost": 162 } ],
  "top_value_items": [ { "name": "香槟洋桔梗", "stock": 180, "unit": "枝", "stock_cost": 576, "min_stock": 50 } ],
  "generated_at": "2026-11-13T13:00:00.000Z"
}
```

### 3.6 `GET /api/restock?limit=5`

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `limit` | number | 5 | 返回条数，夹在 1–20 |

```json
{
  "recommendations": [
    {
      "name": "白荔枝玫瑰", "stock": 22, "min_stock": 30, "unit": "枝",
      "sold_last_7_days": 6, "daily_sales": 0.86, "cover_days": 25.6,
      "suggested_restock": 13,
      "reason": "近7日售出6枝，按5日覆盖与安全库存估算，建议补13枝",
      "priority": "高"
    }
  ],
  "checked_sku": 8,
  "generated_at": "2026-11-13T13:00:00.000Z"
}
```

### 3.7 `GET /api/storefront`

顾客端专用，**不含成本、供应商、货位、后台备注**。

```json
{
  "ok": true,
  "revision": 45,
  "updatedAt": "2026-11-12T03:12:46.055Z",
  "shop": {
    "name": "花间集", "owner": "花掌柜",
    "hours": "09:00 - 21:00", "phone": "",
    "deliveryNote": "同城配送 · 当日鲜花 · 满 ¥99 免配送费",
    "pickupNote": "到店自提 · 下单后请保持电话畅通"
  },
  "categories": ["玫瑰", "洋桔梗", "郁金香"],
  "products": [
    { "id": "f_seed_1", "name": "自由精神玫瑰", "variety": "自由精神", "category": "玫瑰",
      "color": "粉色", "grade": "A", "unit": "枝", "price": 18, "stock": 105,
      "note": "花瓣层叠，适合作为花束主花", "restockedAt": "2026-11-12T03:14:09.443Z",
      "createdAt": "2026-10-10T02:20:00.000Z" }
  ]
}
```

`shop` 的 `hours` / `phone` / 两个备注可用环境变量 `SHOP_HOURS`、`SHOP_PHONE`、`SHOP_DELIVERY_NOTE`、`SHOP_PICKUP_NOTE` 覆盖。

### 3.8 `POST /api/storefront/orders`

```json
{
  "requestId": "c0a80101-...",
  "items": [ { "flowerId": "f_seed_1", "qty": 2 } ],
  "customer": { "name": "王女士", "phone": "13800000000" },
  "delivery": { "method": "delivery", "address": "花间集路 88 号", "date": "2026-11-15", "time": "15:00 - 18:00", "note": "生日花束" },
  "note": "请写一张卡片",
  "paymentMethod": "wechat"
}
```

| 字段 | 必填 | 校验 |
| --- | --- | --- |
| `customer.name` | 是 | 2–20 字 |
| `customer.phone` | 是 | `^[0-9+\-\s]{6,20}$` |
| `paymentMethod` | 是 | `wechat` / `alipay` |
| `items` | 是 | 非空、≤20 项；每项 `flowerId` 存在、`qty` 为 1–99 整数；同一花合并计数 |
| `delivery.method` | 否 | `delivery` 走配送，其余按到店自提 |
| `delivery.address` | 配送必填 | ≥5 字 |
| `delivery.date` | 否 | `YYYY-MM-DD`，不得早于今天 |
| `note` | 否 | 最长 200 字 |
| `requestId` | 否 | 幂等键，重复提交返回原订单 |

**处理顺序**：限流 → 校验 → `withSyncLock` 内查幂等 → 按服务端当前价格重算 → 校验库存/上下架 → 扣库存 → 写订单与流水 → `revision + 1` → SSE 广播。

成功 `201`（重复提交 `200`，`duplicate: true`）：

```json
{
  "ok": true,
  "duplicate": false,
  "order": {
    "id": "o_eab67f07", "no": "SO-20261113-001", "createdAt": "2026-11-13T13:18:40.209Z",
    "customer": { "name": "王女士", "phone": "13800000000" },
    "payment": "微信", "paymentStatus": "paid", "status": "completed", "total": 36,
    "delivery": { "method": "delivery", "methodLabel": "同城配送", "address": "花间集路 88 号", "date": "2026-11-15", "time": "15:00 - 18:00", "note": "生日花束" },
    "lines": [ { "flowerId": "f_seed_1", "name": "自由精神玫瑰", "variety": "自由精神", "unit": "枝", "qty": 2, "unitPrice": 18, "subtotal": 36 } ]
  },
  "shop": { "name": "花间集" }
}
```

错误：

| 码 | 场景 | `error` 示例 |
| --- | --- | --- |
| 400 | 收货人 / 电话 / 支付方式 / 地址 / 日期 / 清单不合法 | `请填写 2-20 个字的收货人称呼。` |
| 409 | 商品下架或库存不足 | `自由精神玫瑰 库存不足，当前仅剩 3 枝。` |
| 429 | 单 IP 10 分钟内超 20 单 | `下单过于频繁，请稍后再试。` |

### 3.9 `POST /api/state/sync`

```json
{
  "base": { "flowers": [], "orders": [] },
  "next": { "flowers": [], "orders": [] },
  "client": { "id": "tab_xxx", "name": "小林" }
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `base` | 是 | 客户端本次修改前的快照，用于算差分 |
| `next` | 是 | 客户端修改后的完整状态 |
| `client.id` | 否 | 协作身份，默认 `guest` |
| `client.name` | 否 | 显示名，默认「花友」，最长 24 字 |

成功 `200`：

```json
{ "ok": true, "revision": 46, "action": "更新了库存", "changed": ["f_seed_1"], "state": { } }
```

冲突 `409`（同一对象在 `base` 之后被别人改过，整单拒绝，不部分写入）：

```json
{
  "error": "数据已被其他协作者更新",
  "message": "同事刚刚修改了同一项数据，页面已刷新，请重新操作。",
  "conflicts": [ { "type": "flowers", "id": "f_seed_1", "name": "自由精神玫瑰" } ],
  "state": { },
  "revision": 46
}
```

### 3.10 `PUT /api/state`

整份覆盖，请求体就是完整 `state`。`meta.revision` 由服务端强制 +1，并广播 SSE。

> 兼容旧版保留。协作场景请用 `/api/state/sync`，否则会静默覆盖别人的修改。

### 3.11 `GET /api/collab/presence`

```json
{ "count": 1, "clients": [ { "id": "tab_a1", "name": "小林", "color": "#3c7462", "joinedAt": "2026-11-13T13:00:00.000Z" } ] }
```

只统计 15 秒内有心跳的轮询客户端 + 在线的 SSE 客户端。

### 3.12 `GET /api/collab/poll`

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `since` | 否 | 客户端已知的 `revision`，默认 0 |
| `clientId` | 否 | 协作身份，默认 `guest_poll` |
| `name` | 否 | 显示名，默认「花友」 |

```json
{
  "revision": 46,
  "changed": true,
  "presence": { "count": 2, "clients": [] },
  "state": { },
  "actor": { "id": "tab_xxx", "name": "小林" },
  "action": "调整了库存",
  "at": "2026-11-13T13:05:00.000Z"
}
```

`changed === false` 时只返回 `revision` 与 `presence`，不带 `state`（省流量）。前端每 2.5 秒拉一次。

### 3.13 `GET /api/events`（SSE）

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `clientId` | 否 | 协作身份 |
| `name` | 否 | 显示名 |

响应头：`Content-Type: text/event-stream`、`Cache-Control: no-cache, no-transform`、`X-Accel-Buffering: no`，并下发 `retry: 3000`。事件三种：

| 事件 | 时机 | data |
| --- | --- | --- |
| `hello` | 连接建立 | `{ self: { id, name }, revision, state, presence }` |
| `presence` | 有人上线/下线 | `{ count, clients }` |
| `state` | 有人保存成功 | `{ revision, actor, action, at, state, presence }` |

服务端每 15 秒发一次 `: ping` 注释行保活；连接断开自动清理并广播 `presence`。前端若 2.5 秒内收不到 `hello`（反向代理缓冲了流），会关闭 SSE 改用轮询。

```bash
curl -N "http://localhost:8787/api/events?clientId=test&name=curl"
```

### 3.14 `GET /api/assistant/tools`

```json
{
  "tools": [
    { "name": "get_inventory_overview", "label": "库存总览", "description": "…" }
  ],
  "model": { "provider": "pollinations", "model": "openai-fast", "tools": true }
}
```

五个只读工具：`get_inventory_overview`、`get_sales_summary`、`get_restock_recommendations`、`get_flower_details`、`suggest_price`。

### 3.15 `POST /api/assistant/chat`

```json
{ "messages": [ { "role": "user", "content": "今天该补什么花？" } ] }
```

只接受 `user` / `assistant` 角色，单条内容截断到 3000 字。

```json
{
  "reply": "当前有3种花低于安全库存……",
  "toolTrace": [ { "name": "get_restock_recommendations", "label": "补货建议", "args": {}, "ok": true } ],
  "model": "openai-fast",
  "provider": "pollinations",
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 },
  "latencyMs": 1420,
  "fallback": false
}
```

| 码 | 场景 |
| --- | --- |
| 400 | `messages` 不是非空数组 |
| 429 | 单 IP 5 分钟内超 12 次，或全局每小时超 300 次 |
| 500 | 模型异常且本地规则也失败 |

模型不可用、限流或 `LLM_DISABLE=1` 时返回 `fallback: true` 的本地规则回答，接口本身仍是 `200`。

---

## 4. 数据结构速查（`state`）

| 数组 | 关键字段 |
| --- | --- |
| `flowers[]` | `id` `name` `variety` `category` `color` `grade` `unit` `cost` `price` `stock` `minStock` `supplier` `location` `note` `createdAt` `restockedAt` `active` |
| `orders[]` | `id` `no` `date` `customer` `customerPhone` `payment` `paymentStatus` `status` `lines[]` `total` `cost` `profit` `source` `delivery{}` `requestId` `refundedAt` |
| `orders[].lines[]` | `flowerId` `name` `variety` `unit` `qty` `unitPrice` `cost` `subtotal` |
| `movements[]` | `id` `flowerId` `type`（`initial` `in` `loss` `count` `sale` `refund`）`change` `before` `after` `unitCost` `note` `date` `orderId` |
| `priceHistory[]` | `id` `flowerId` `oldPrice` `newPrice` `date` `reason` |
| `settings` | `shopName` `owner` `createdAt` |
| `meta` | `revision` `updatedAt` |

---

## 5. 已知限制（照实记录）

| 问题 | 现状 | 影响 |
| --- | --- | --- |
| 没有 `DELETE` 接口 | 删除花卉走 `/api/state/sync` 的差量同步 | 不符合“GET 列表 / POST 新增 / DELETE 删除”的 REST 验收口径 |
| 没有 `POST /api/flowers` | 新增花卉同样走差量同步 | 同上 |
| `PUT /api/state` 参数错误返回 500 | `prepareState` 抛的错没带 `status` | 应为 400 |
| 不支持的方法返回 404 | 未做 405 分支 | 语义不准 |
| `qty` 接受数字字符串 `"3"` | `Number()` 宽松转换 | 类型校验不严格 |
| 单进程内存态 | 锁、限流桶、SSE 连接都在进程内 | 不能多实例水平扩展 |
| 无认证 / 无租户 | 共享单店 | 正式商用需补登录、角色、租户隔离 |

---

## 6. 变更记录

| 版本 | 变更 |
| --- | --- |
| 1.2.0 | 增加顾客端接口、AI 工具与 SSE/轮询降级 |
| 1.1.0 | 增加协作同步与冲突检测 |
| 1.0.0 | 库存、销售、盈利、定价基础接口 |
