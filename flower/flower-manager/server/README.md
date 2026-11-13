# 花间集 · 全栈服务端

## 启动

在 `flower-manager` 目录执行：

```powershell
npm start
# 或
node server/server.mjs
# 或（Windows 一键）
.\server\start.ps1
```

打开 http://localhost:8787

AI 直达页：http://localhost:8787/ai（打开后自动弹出花掌柜 AI）

顾客在线花房：http://localhost:8787/shop

首次启动会自动把 `server/seed.json` 写入 `server/data/state.json`。之后所有页面保存会同步到该文件。

## 接口

> 完整的字段说明、请求/响应示例、错误码与已知限制见 **[API.md](API.md)**。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 服务、状态数据量、模型与工具状态 |
| GET | `/api/state` | 读取完整经营状态（含 `meta.revision`） |
| PUT | `/api/state` | 兼容旧版整份覆盖，不用于协作保存 |
| POST | `/api/state/sync` | **协作保存**：base/next 差分合并，冲突返回 409 |
| GET | `/api/events` | SSE 实时事件流（presence / hello / state） |
| GET | `/api/collab/presence` | 当前在线成员快照 |
| GET | `/api/collab/poll?since=版本号` | 轮询同步降级：返回是否有更新、最新状态与在线成员 |
| GET | `/api/storefront` | 顾客端公开商品、店铺和分类，**不含成本/利润** |
| POST | `/api/storefront/orders` | 顾客下单：服务端校验库存/价格，原子扣库存并生成线上订单 |
| GET | `/api/flowers` | 花卉列表 |
| GET | `/api/summary?days=7` | 营收、成本、毛利、净利、热销 |
| GET | `/api/inventory` | 库存总览与预警 |
| GET | `/api/restock?limit=5` | 智能补货建议 |
| GET | `/api/assistant/tools` | 可用 AI 工具列表 |
| POST | `/api/assistant/chat` | AI 对话 + 工具调用 |

### 协作保存

`POST /api/state/sync` 请求：

```json
{
  "base": { "flowers": [], "orders": [] },
  "next": { "flowers": [], "orders": [] },
  "client": { "id": "tab_xxx", "name": "小林" }
}
```

服务端按 `flowers / orders / movements / priceHistory / settings` 的对象 id 做差分：

- 只合并客户端真正改动的对象，其他协作者的新增和修改会保留
- 同一个对象在 `base` 之后已被别人改动，则整个提交返回 `409`，不会部分写入
- 成功后 `meta.revision +1`，并通过 SSE 广播给其他在线页面
- 前端在开单、库存调整、改价、退款、导入数据时自动使用该接口

`GET /api/events?clientId=...&name=...` 返回 `text/event-stream`，事件：

- `hello`：连接成功，带当前状态、版本号和在线成员
- `presence`：某位协作者上线/下线
- `state`：某位协作者提交了新的经营状态

> Cloudflare Quick Tunnel 等反向代理可能缓冲 SSE。前端在 2.5 秒内没有收到 `hello` 时会自动关闭 SSE，改用 `/api/collab/poll` 每 2.5 秒拉取一次；本机直连时仍优先使用 SSE。这样公网演示和正式部署都能保持多人同步。

> 当前是**共享单店协作版**，所有打开链接的人默认拥有同一店铺的操作权限，尚未接入账号登录与角色权限。生产环境需在这层之上增加认证和租户隔离。

## 顾客端 / 线上订单

顾客入口：`/shop`。页面的商品数据来自 `GET /api/storefront`，服务端会过滤掉成本、利润、供应商、货位和内部备注等后台字段。

`POST /api/storefront/orders` 请求：

```json
{
  "requestId": "c0a8...",
  "items": [
    { "flowerId": "f_seed_1", "qty": 2 }
  ],
  "customer": { "name": "王女士", "phone": "13800000000" },
  "delivery": {
    "method": "delivery",
    "address": "花间集路 88 号",
    "date": "2026-11-12",
    "time": "15:00 - 18:00",
    "note": "生日花束"
  },
  "note": "请写一张卡片",
  "paymentMethod": "wechat"
}
```

处理流程：

1. 服务端使用当前花卉售价和成本重新计算，不信任浏览器金额。
2. 校验花卉是否在售、库存是否足够、配送地址和日期是否合法。
3. 在同一个 `withSyncLock` 事务里扣库存、写销售订单、写库存流水、`revision +1`。
4. 通过 SSE 广播给后台在线页面；Cloudflare 环境后台会通过轮询在 2.5 秒内拿到。
5. 相同 `requestId` 重试返回已有订单，不会重复扣库存。
6. 单 IP 限制 20 单 / 10 分钟。

订单额外字段：

- `source: "online"`
- `channel: "线上花店"`
- `customerPhone`
- `paymentStatus: "paid"`
- `delivery: { method, methodLabel, address, date, time, note }`
- `requestId`（幂等）

后台销售记录会显示「线上」标签，订单详情展示电话、配送地址、预约时间和已支付状态；退款仍按原逻辑恢复库存并剔除营收。

> 支付为**演示支付**：当前没有接入微信/支付宝商户号，不产生真实扣款。正式上线需增加支付网关、异步回调验签、退款接口和更严格的订单风控。

`POST /api/assistant/chat` 请求：

```json
{
  "messages": [
    { "role": "user", "content": "今天该补什么花？" }
  ]
}
```

响应包含 `reply`、`toolTrace`、`model`、`fallback`、`latencyMs`。AI 工具只读，不会直接修改库存或订单。

## 模型配置

默认使用 Pollinations 的匿名 OpenAI 兼容接口，无需 Key，支持工具调用；免费额度约为每 45 秒 1 次，超出时自动切换到本地经营规则。

生产环境建议配置自己的模型 Key：

```powershell
$env:LLM_ENDPOINT = 'https://api.deepseek.com/chat/completions'
$env:LLM_MODEL = 'deepseek-chat'
$env:LLM_API_KEY = 'sk-...'
npm start
```

也兼容 OpenAI 或其他 OpenAI 兼容服务。详见项目根目录 `.env.example`。

## AI 工具

- `get_inventory_overview`：库存总览、低库存、滞销、库存成本
- `get_sales_summary`：区间营收、成本、毛利、净利、热销、客户
- `get_restock_recommendations`：按近 7 日销量与安全库存算补货
- `get_flower_details`：单个花卉的价格、成本、库存、库龄、销量
- `suggest_price`：按目标毛利率倒推建议售价

## 部署

### Docker

```bash
docker build -t huajian-flower .
docker run -p 8787:8787 -e PORT=8787 huajian-flower
```

### Render

仓库根目录已提供 `render.yaml`。连接 GitHub 后可直接创建 Web Service；若需要持久化数据，请挂载持久磁盘，或把 `server/data/state.json` 替换为数据库。

### 临时公网演示

本地服务启动后，可使用 Cloudflare Quick Tunnel：

```powershell
cloudflared tunnel --url http://localhost:8787
```

Quick Tunnel 地址是临时的，只适合演示，不适合作为正式生产地址。

## 说明

- 当前是单租户共享店铺：所有访问者共享同一份店铺数据，但会通过独立协作身份和 SSE 实时同步。
- 服务端对同一业务对象的并发修改会拒绝并返回 409，避免静默覆盖；非重叠修改会自动合并。
- 正式商用前建议增加登录、角色权限、租户隔离、数据库、审计日志和更严格的接口限流。
- 页面端的数据计算仍在前端执行；服务端负责持久化、协作合并、API 与 AI 工具调用。
- 375px 宽度下已隐藏桌面表格并改用移动卡片，页面无横向滚动。
