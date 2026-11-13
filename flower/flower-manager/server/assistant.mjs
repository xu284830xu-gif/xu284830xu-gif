/* 花间集 · AI 经营助手
 * 默认使用 Pollinations 的匿名 OpenAI 兼容接口（无需 Key，支持 tools）。
 * 如配置 DEEPSEEK_API_KEY / OPENAI_API_KEY / LLM_ENDPOINT，会自动切换到对应服务。
 */

import {
  TOOL_DEFINITIONS,
  TOOL_LABELS,
  executeTool,
  inventoryOverview,
  salesSummary,
  restockRecommendations,
  findFlower,
  suggestPrice
} from './business-tools.mjs';

const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY);
const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
const customEndpoint = process.env.LLM_ENDPOINT || '';
const apiKey = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '';

const endpoint = customEndpoint || (hasDeepSeek
  ? 'https://api.deepseek.com/chat/completions'
  : hasOpenAI
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://text.pollinations.ai/openai');

const model = process.env.LLM_MODEL || (hasDeepSeek ? 'deepseek-chat' : hasOpenAI ? 'gpt-4o-mini' : 'openai-fast');
const timeoutMs = Math.max(10000, Number(process.env.LLM_TIMEOUT_MS) || 60000);
const toolRounds = Math.max(1, Math.min(4, Number(process.env.LLM_TOOL_ROUNDS) || 3));
const disableModel = process.env.LLM_DISABLE === '1';

export function modelInfo() {
  let provider = 'pollinations';
  if (customEndpoint) provider = 'custom';
  else if (hasDeepSeek) provider = 'deepseek';
  else if (hasOpenAI) provider = 'openai';
  return {
    provider,
    model,
    endpoint,
    tools: true,
    mode: disableModel ? 'local-fallback' : 'model+tools',
    configured: !disableModel
  };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .slice(-12)
    .map((message) => ({ role: message.role, content: message.content.slice(0, 3000) }));
}

function systemPrompt() {
  return `你是“花掌柜 AI”，花间集花店的经营助手。当前日期：${new Date().toLocaleDateString('zh-CN')}。
规则：
1. 回答经营问题前，优先调用工具读取真实数据；不要编造库存、销量、利润和价格。
2. 用中文回答，先给结论，再给2-3条可执行建议，控制在180字以内。
3. 你可以调用库存、销售、补货、花卉详情和定价试算工具。
4. 你只能提供建议，不能直接改库存、改价、开单或退款；需要用户自己在页面操作。
5. 如果数据不足，明确说明，不要猜测。`;
}

function summarizeToolResult(name, result) {
  if (!result || typeof result !== 'object') return '已返回结果';
  if (result.error) return result.error;
  switch (name) {
    case 'get_inventory_overview':
      return `${result.sku_count}种花，低库存${result.low_stock_count}种，库存成本¥${result.stock_cost}`;
    case 'get_sales_summary':
      return `${result.range_days}天营收¥${result.revenue}，净利¥${result.net_profit}`;
    case 'get_restock_recommendations':
      return `${result.recommendations?.length || 0}种花建议补货`;
    case 'get_flower_details':
      return result.found ? `${result.name}库存${result.stock}${result.unit}，毛利率${Math.round(result.margin * 1000) / 10}%` : result.message;
    case 'suggest_price':
      return result.found ? `${result.name}建议价¥${result.suggested_price}` : result.message;
    default:
      return '已返回结果';
  }
}

function parseArguments(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function composeToolAnswer(question, executed, state) {
  const blocks = [];
  const byName = new Map(executed.map((item) => [item.name, item.result]));
  const sales = byName.get('get_sales_summary');
  const inventory = byName.get('get_inventory_overview');
  const restock = byName.get('get_restock_recommendations');
  const details = byName.get('get_flower_details');
  const price = byName.get('suggest_price');

  if (details?.found) {
    blocks.push(`${details.name}当前售价¥${details.price}，成本¥${details.cost}，毛利率${Math.round(details.margin * 1000) / 10}%，库存${details.stock}${details.unit}，${details.shelf_status}。`);
  }
  if (price?.found) {
    blocks.push(`按${Math.round(price.target_margin * 100)}%目标毛利倒推，建议售价¥${price.suggested_price}，与当前价相差¥${price.price_difference}。`);
  }
  if (sales) {
    blocks.push(`近${sales.range_days}天营收¥${sales.revenue}，毛利¥${sales.gross_profit}，扣除损耗后净利¥${sales.net_profit}。`);
    if (sales.top_products?.[0]) {
      blocks.push(`最畅销的是${sales.top_products[0].name}，售出${sales.top_products[0].units}份。`);
    }
  }
  if (restock?.recommendations?.length) {
    const items = restock.recommendations.slice(0, 3)
      .map((item) => `${item.name}补${item.suggested_restock}${item.unit}`)
      .join('、');
    blocks.push(`补货优先级：${items}。`);
  }
  if (inventory) {
    blocks.push(`当前${inventory.sku_count}种花、库存成本¥${inventory.stock_cost}，其中${inventory.low_stock_count}种低于安全库存。`);
    if (inventory.low_stock_items?.length) {
      blocks.push(`低库存：${inventory.low_stock_items.slice(0, 3).map((item) => item.name).join('、')}。`);
    }
  }

  if (!blocks.length) {
    return localFallback([{ role: 'user', content: question }], state).reply;
  }

  let advice = '建议优先处理高优先级补货，并持续关注低毛利与滞销花材。';
  if (/定价|价格|毛利|售价|成本/.test(question)) {
    advice = '建议结合花材品质、季节和周边市场微调，不要只看单一毛利率。';
  } else if (/利润|盈利|营收|销售|赚/.test(question)) {
    advice = '建议重点查看低毛利商品和损耗，避免只看营业额。';
  } else if (/补货|库存|缺/.test(question)) {
    advice = '建议先补高优先级，再按实际到货和天气调整，避免一次压货过多。';
  }
  return `${blocks.join('\n')}\n${advice}`;
}

const responseCache = new Map();
let lastFreeModelCallAt = 0;
const FREE_COOLDOWN_MS = 45000;

function cacheKey(messages, state) {
  const last = messages[messages.length - 1]?.content || '';
  const fingerprint = `${state?.flowers?.length || 0}:${state?.orders?.length || 0}:${state?.meta?.updatedAt || ''}`;
  return `${fingerprint}|${last}`;
}

function cachedResponse(key) {
  const item = responseCache.get(key);
  if (!item) return null;
  if (Date.now() - item.at > 5 * 60 * 1000) {
    responseCache.delete(key);
    return null;
  }
  return item.value;
}

function storeCache(key, value) {
  if (responseCache.size > 60) {
    const oldest = [...responseCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) responseCache.delete(oldest[0]);
  }
  responseCache.set(key, { at: Date.now(), value });
}

async function callModel(messages) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json',
    'User-Agent': 'Huajian-Flower-OS/1.0'
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 700
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`模型返回非JSON内容 (${response.status})：${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `模型请求失败 (${response.status})`);
  }
  return data;
}

function localFallback(messages, state) {
  const question = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
  const text = question.toLowerCase();
  const trace = [];
  const run = (name, args = {}) => {
    const result = executeTool(name, args, state);
    trace.push({
      name,
      label: TOOL_LABELS[name] || name,
      args,
      summary: summarizeToolResult(name, result)
    });
    return result;
  };

  if (/你好|hi|hello|能做什么|怎么用|帮助/.test(text)) {
    return {
      reply: '我是花掌柜 AI，可以帮你查库存、看销售利润、算补货和试算售价。你可以问：“今天该补什么花？”“本周赚了多少？”“自由精神玫瑰怎么定价？”',
      toolTrace: trace,
      fallback: true
    };
  }

  if (/补货|进货|该补|缺什么|库存不足|积压/.test(text)) {
    const restock = run('get_restock_recommendations', { limit: 5 });
    const inventory = run('get_inventory_overview');
    const items = restock.recommendations || [];
    const lines = items.length
      ? items.slice(0, 3).map((item) => `· ${item.name}：建议补${item.suggested_restock}${item.unit}（${item.priority}优先）`).join('\n')
      : '· 当前库存覆盖近期销量，暂无必须补货的花。';
    return {
      reply: `当前有${inventory.low_stock_count}种花低于安全库存。\n${lines}\n建议先处理高优先级，再按实际到货和天气微调。`,
      toolTrace: trace,
      fallback: true
    };
  }

  if (/利润|盈利|营收|营业额|销售|卖了多少|赚了多少|订单|损耗/.test(text)) {
    const days = /30|近月|一个月/.test(text) ? 30 : /今天|今日/.test(text) ? 1 : 7;
    const sales = run('get_sales_summary', { days });
    return {
      reply: `近${sales.range_days}天营收¥${sales.revenue}，毛利¥${sales.gross_profit}，扣除损耗后净利¥${sales.net_profit}。\n热销第一是${sales.top_products?.[0]?.name || '暂无数据'}。\n建议重点看低毛利商品和损耗较高的花材。`,
      toolTrace: trace,
      fallback: true
    };
  }

  const flowers = state.flowers.filter((flower) => flower.active !== false);
  const mentioned = flowers.find((flower) => text.includes(flower.name.toLowerCase())
    || (flower.variety && text.includes(String(flower.variety).toLowerCase())));
  if (mentioned && /价格|定价|毛利|售价|成本|贵|便宜/.test(text)) {
    const details = run('get_flower_details', { name: mentioned.name });
    const price = run('suggest_price', { flowerName: mentioned.name, targetMargin: 0.45 });
    return {
      reply: `${details.name}当前售价¥${details.price}，成本¥${details.cost}，毛利率${Math.round(details.margin * 1000) / 10}%。\n若按45%目标毛利，建议价¥${price.suggested_price}。\n最终定价还要结合品质、季节和周边市场。`,
      toolTrace: trace,
      fallback: true
    };
  }

  if (/热销|畅销|最好卖|卖得最好|爆款/.test(text)) {
    const sales = run('get_sales_summary', { days: 30 });
    const top = sales.top_products?.[0];
    return {
      reply: top
        ? `近30天最畅销的是${top.name}，售出${top.units}份，营收¥${top.revenue}，毛利¥${top.profit}。建议保证安全库存，并围绕它设计花束组合。`
        : '近30天还没有足够的已完成销售数据。',
      toolTrace: trace,
      fallback: true
    };
  }

  const inventory = run('get_inventory_overview');
  const sales = run('get_sales_summary', { days: 7 });
  const low = inventory.low_stock_items?.slice(0, 3).map((item) => item.name).join('、') || '无';
  return {
    reply: `近7天营收¥${sales.revenue}，净利¥${sales.net_profit}。\n当前低库存：${low}。\n你可以继续问“怎么补货”“哪种花最赚钱”或“某一种花怎么定价”。`,
    toolTrace: trace,
    fallback: true
  };
}

export async function chatWithAssistant({ state, messages }) {
  const cleanMessages = normalizeMessages(messages);
  if (!cleanMessages.length) {
    throw new Error('消息不能为空');
  }

  if (disableModel) {
    const fallback = localFallback(cleanMessages, state);
    return {
      ...fallback,
      model: 'local-rules',
      provider: 'local',
      usage: null,
      latencyMs: 0,
      mode: 'local',
      fallbackReason: 'LLM_DISABLE=1'
    };
  }

  const info = modelInfo();
  const cacheId = cacheKey(cleanMessages, state);
  const hit = cachedResponse(cacheId);
  if (hit) return { ...hit, cached: true };

  const started = Date.now();
  const conversation = [
    { role: 'system', content: systemPrompt() },
    ...cleanMessages
  ];
  const toolTrace = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const useOneShot = process.env.LLM_ONE_SHOT === '1'
    || (info.provider === 'pollinations' && process.env.LLM_ONE_SHOT !== '0');

  if (useOneShot && info.provider === 'pollinations' && Date.now() - lastFreeModelCallAt < FREE_COOLDOWN_MS) {
    const fallback = localFallback(cleanMessages, state);
    return {
      ...fallback,
      model: 'local-rules',
      provider: 'local',
      usage,
      latencyMs: Date.now() - started,
      mode: 'local',
      fallbackReason: '免费模型每45秒可调用一次，已使用本地经营规则回答'
    };
  }

  try {
    if (info.provider === 'pollinations') lastFreeModelCallAt = Date.now();
    const data = await callModel(conversation);
    const message = data?.choices?.[0]?.message;
    if (!message) throw new Error('模型未返回消息');
    if (data.usage) {
      usage.prompt_tokens += Number(data.usage.prompt_tokens) || 0;
      usage.completion_tokens += Number(data.usage.completion_tokens) || 0;
      usage.total_tokens += Number(data.usage.total_tokens) || 0;
    }
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

    if (useOneShot) {
      if (calls.length) {
        const executed = [];
        for (const call of calls) {
          const name = call?.function?.name;
          const args = parseArguments(call?.function?.arguments);
          let result;
          try {
            result = executeTool(name, args, state);
          } catch (error) {
            result = { error: error.message };
          }
          executed.push({ name, args, result });
          toolTrace.push({
            name,
            label: TOOL_LABELS[name] || name,
            args,
            summary: summarizeToolResult(name, result)
          });
        }
        const reply = composeToolAnswer(cleanMessages[cleanMessages.length - 1]?.content || '', executed, state);
        const response = {
          reply,
          toolTrace,
          fallback: false,
          model: data.model || model,
          provider: info.provider,
          usage,
          latencyMs: Date.now() - started,
          mode: 'model-plan+tools'
        };
        storeCache(cacheId, response);
        return response;
      }

      const reply = String(message.content || '').trim();
      if (!reply) throw new Error('模型返回空内容');
      const response = {
        reply,
        toolTrace,
        fallback: false,
        model: data.model || model,
        provider: info.provider,
        usage,
        latencyMs: Date.now() - started,
        mode: 'model'
      };
      storeCache(cacheId, response);
      return response;
    }

    if (calls.length) {
      conversation.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: calls
      });
      for (const call of calls) {
        const name = call?.function?.name;
        const args = parseArguments(call?.function?.arguments);
        let result;
        try {
          result = executeTool(name, args, state);
        } catch (error) {
          result = { error: error.message };
        }
        toolTrace.push({
          name,
          label: TOOL_LABELS[name] || name,
          args,
          summary: summarizeToolResult(name, result)
        });
        conversation.push({
          role: 'tool',
          tool_call_id: call.id,
          name,
          content: JSON.stringify(result).slice(0, 12000)
        });
      }
    } else {
      const reply = String(message.content || '').trim();
      if (!reply) throw new Error('模型返回空内容');
      const response = {
        reply,
        toolTrace,
        fallback: false,
        model: data.model || model,
        provider: info.provider,
        usage,
        latencyMs: Date.now() - started,
        mode: 'model+tools'
      };
      storeCache(cacheId, response);
      return response;
    }
  } catch (error) {
    const fallback = localFallback(cleanMessages, state);
    return {
      ...fallback,
      model: 'local-rules',
      provider: 'local',
      usage,
      latencyMs: Date.now() - started,
      mode: 'local',
      fallbackReason: String(error.message || error).slice(0, 300)
    };
  }

  // 自定义模型的多轮工具调用：继续把工具结果送回模型，最多 toolRounds 轮。
  for (let round = 1; round < toolRounds; round += 1) {
    try {
      const data = await callModel(conversation);
      const message = data?.choices?.[0]?.message;
      if (!message) throw new Error('模型未返回消息');
      if (data.usage) {
        usage.prompt_tokens += Number(data.usage.prompt_tokens) || 0;
        usage.completion_tokens += Number(data.usage.completion_tokens) || 0;
        usage.total_tokens += Number(data.usage.total_tokens) || 0;
      }
      const reply = String(message.content || '').trim();
      if (reply) {
        const response = {
          reply,
          toolTrace,
          fallback: false,
          model: data.model || model,
          provider: info.provider,
          usage,
          latencyMs: Date.now() - started,
          mode: 'model+tools'
        };
        storeCache(cacheId, response);
        return response;
      }
    } catch (error) {
      break;
    }
  }

  const fallback = localFallback(cleanMessages, state);
  return {
    ...fallback,
    model: 'local-rules',
    provider: 'local',
    usage,
    latencyMs: Date.now() - started,
    mode: 'local',
    fallbackReason: '模型未返回可用结果'
  };
}
