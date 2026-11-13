/* =========================================================
   花间集 · 花掌柜 AI
   仅在服务端模式加载；通过 /api/assistant/chat 调用模型与经营工具。
   ========================================================= */
(() => {
  'use strict';

  if (window.APP_MODE !== 'server') return;

  const state = {
    open: false,
    busy: false,
    history: [],
    lastUserMessage: '',
    typingTimer: null,
    ready: false
  };

  const suggestions = [
    '今天该补什么花？',
    '本周利润怎么样？',
    '自由精神玫瑰怎么定价？',
    '近30天什么花最好卖？'
  ];

  const els = {};

  function createUi() {
    const topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn ai-top-btn';
    button.id = 'aiTopButton';
    button.title = '打开花掌柜 AI 经营助手';
    button.setAttribute('aria-label', '打开花掌柜 AI 经营助手');
    button.innerHTML = `${icon('sparkles', 17)}<span class="ai-top-label">AI</span>`;
    const settings = topbarRight.querySelector('[data-action="open-settings"]');
    topbarRight.insertBefore(button, settings || topbarRight.firstChild);

    const layer = document.createElement('div');
    layer.className = 'ai-layer';
    layer.id = 'aiLayer';
    layer.hidden = true;
    layer.innerHTML = `
      <div class="ai-backdrop" data-ai-close></div>
      <section class="ai-panel" role="dialog" aria-modal="true" aria-labelledby="aiTitle">
        <header class="ai-head">
          <span class="ai-head-mark">${icon('flower', 19)}</span>
          <div class="ai-head-copy">
            <strong id="aiTitle">花掌柜 AI</strong>
            <span>经营数据 · 工具调用</span>
          </div>
          <button type="button" class="ai-icon-btn" data-ai-clear title="清空对话" aria-label="清空对话">${icon('refresh', 15)}</button>
          <button type="button" class="ai-icon-btn" data-ai-close title="关闭" aria-label="关闭 AI 助手">${icon('x', 15)}</button>
        </header>
        <div class="ai-status" id="aiStatus"><i></i><span>正在连接经营数据…</span></div>
        <div class="ai-messages" id="aiMessages">
          <div class="ai-welcome" id="aiWelcome">
            <div class="ai-welcome-mark">${icon('sparkles', 21)}</div>
            <div>
              <strong>老板好，我是花掌柜 AI。</strong>
              <p>我可以读取这家店的库存、销售、价格和利润数据，再调用补货、定价等工具给你具体建议。</p>
            </div>
          </div>
          <div class="ai-suggestions" id="aiSuggestions">
            ${suggestions.map((text) => `<button type="button" data-ai-suggest="${text}">${text}</button>`).join('')}
          </div>
        </div>
        <form class="ai-input-row" id="aiForm">
          <textarea id="aiInput" rows="1" maxlength="500" placeholder="问问库存、利润、补货或定价…" aria-label="向花掌柜 AI 提问"></textarea>
          <button type="submit" class="ai-send" id="aiSend" aria-label="发送">${icon('arrow-up-right', 18)}</button>
        </form>
        <div class="ai-foot">AI 只提供经营建议，不会直接修改库存、价格或订单。数据以页面为准。</div>
      </section>`;
    document.body.appendChild(layer);

    els.button = button;
    els.layer = layer;
    els.panel = layer.querySelector('.ai-panel');
    els.messages = layer.querySelector('#aiMessages');
    els.welcome = layer.querySelector('#aiWelcome');
    els.suggestions = layer.querySelector('#aiSuggestions');
    els.form = layer.querySelector('#aiForm');
    els.input = layer.querySelector('#aiInput');
    els.send = layer.querySelector('#aiSend');
    els.status = layer.querySelector('#aiStatus');

    button.addEventListener('click', openPanel);
    layer.addEventListener('click', (event) => {
      if (event.target.closest('[data-ai-close]')) closePanel();
      if (event.target.closest('[data-ai-clear]')) clearChat();
      const suggest = event.target.closest('[data-ai-suggest]');
      if (suggest) {
        els.input.value = suggest.dataset.aiSuggest;
        sendMessage();
      }
    });
    els.form.addEventListener('submit', (event) => {
      event.preventDefault();
      sendMessage();
    });
    els.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
    els.input.addEventListener('input', resizeInput);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.open) closePanel();
    });
  }

  function resizeInput() {
    els.input.style.height = 'auto';
    els.input.style.height = `${Math.min(108, els.input.scrollHeight)}px`;
  }

  function setStatus(text, mode = '') {
    if (!els.status) return;
    els.status.className = `ai-status ${mode}`;
    els.status.innerHTML = `<i></i><span>${text}</span>`;
  }

  function openPanel() {
    if (!els.layer) return;
    state.open = true;
    els.layer.hidden = false;
    document.body.classList.add('ai-open');
    void els.layer.offsetWidth;
    els.layer.classList.add('is-open');
    setTimeout(() => els.input?.focus(), 180);
  }

  function closePanel() {
    if (!els.layer) return;
    state.open = false;
    els.layer.classList.remove('is-open');
    document.body.classList.remove('ai-open');
    setTimeout(() => {
      if (!state.open) els.layer.hidden = true;
    }, 180);
  }

  function clearChat() {
    if (state.busy) return;
    state.history = [];
    state.lastUserMessage = '';
    els.messages.querySelectorAll('.ai-msg, .ai-typing-row, .ai-error').forEach((node) => node.remove());
    els.suggestions.hidden = false;
    els.input.value = '';
    resizeInput();
    setStatus('对话已清空，可以重新提问', 'ok');
  }

  function cleanText(text) {
    return String(text || '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/`/g, '')
      .trim();
  }

  function addMessage(role, text, meta = {}) {
    const row = document.createElement('div');
    row.className = `ai-msg ai-msg-${role}`;
    if (role === 'assistant') {
      row.innerHTML = `<span class="ai-msg-avatar">${icon('flower', 15)}</span>`;
    }
    const content = document.createElement('div');
    content.className = 'ai-msg-content';
    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble';
    bubble.textContent = cleanText(text);
    content.appendChild(bubble);

    if (meta.toolTrace && meta.toolTrace.length) {
      const trace = document.createElement('div');
      trace.className = 'ai-tools';
      meta.toolTrace.forEach((tool) => {
        const chip = document.createElement('span');
        chip.className = 'ai-tool';
        chip.title = tool.summary || '';
        chip.innerHTML = `${icon('sliders', 11)}<span></span>`;
        chip.querySelector('span').textContent = tool.label || tool.name;
        trace.appendChild(chip);
      });
      content.appendChild(trace);
    }
    if (meta.fallback) {
      const badge = document.createElement('span');
      badge.className = 'ai-fallback';
      badge.textContent = '本地经营规则模式';
      if (meta.fallbackReason) badge.title = meta.fallbackReason;
      content.appendChild(badge);
    }
    row.appendChild(content);
    els.messages.appendChild(row);
    els.suggestions.hidden = true;
    scrollMessages();
    return row;
  }

  function addTyping() {
    const row = document.createElement('div');
    row.className = 'ai-typing-row';
    row.innerHTML = `<span class="ai-msg-avatar">${icon('flower', 15)}</span><span class="ai-typing"><i></i><i></i><i></i></span><span class="ai-typing-label">正在读取经营数据…</span>`;
    els.messages.appendChild(row);
    scrollMessages();
    return row;
  }

  function scrollMessages() {
    requestAnimationFrame(() => {
      els.messages.scrollTop = els.messages.scrollHeight;
    });
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    els.send.disabled = isBusy;
    els.input.disabled = isBusy;
    if (isBusy) {
      els.panel.classList.add('is-busy');
      let seconds = 0;
      if (state.typingTimer) clearInterval(state.typingTimer);
      state.typingTimer = setInterval(() => {
        seconds += 1;
        const label = document.querySelector('.ai-typing-label');
        if (label) label.textContent = `正在读取经营数据… ${seconds}s`;
      }, 1000);
    } else {
      els.panel.classList.remove('is-busy');
      if (state.typingTimer) {
        clearInterval(state.typingTimer);
        state.typingTimer = null;
      }
    }
  }

  async function sendMessage() {
    const text = String(els.input.value || '').trim();
    if (!text || state.busy) return;

    state.lastUserMessage = text;
    state.history.push({ role: 'user', content: text });
    if (state.history.length > 10) state.history = state.history.slice(-10);
    addMessage('user', text);
    els.input.value = '';
    resizeInput();
    setBusy(true);
    const typing = addTyping();
    setStatus('正在读取真实经营数据…', 'working');

    try {
      if (window.__pendingSave) {
        await Promise.resolve(window.__pendingSave).catch(() => {});
      }
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ messages: state.history })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
      typing.remove();
      addMessage('assistant', data.reply || '暂时没有生成回答。', data);
      state.history.push({ role: 'assistant', content: data.reply || '' });
      if (state.history.length > 10) state.history = state.history.slice(-10);
      if (data.fallback) {
        setStatus('模型暂不可用，已使用本地经营规则回答', 'warn');
      } else {
        setStatus(`已连接 ${data.model || '模型'} · 本次调用 ${data.toolTrace?.length || 0} 个工具`, 'ok');
      }
    } catch (error) {
      typing.remove();
      const row = document.createElement('div');
      row.className = 'ai-error';
      row.innerHTML = `${icon('alert', 15)}<span>AI 服务暂时不可用。请确认服务端已启动，或稍后重试。</span>`;
      els.messages.appendChild(row);
      scrollMessages();
      setStatus('连接失败，请稍后再试', 'error');
      console.warn('[AI]', error);
    } finally {
      setBusy(false);
      if (state.lastUserMessage) {
        // 保留输入焦点，方便连续追问
        window.setTimeout(() => els.input?.focus(), 80);
      }
    }
  }

  async function loadStatus() {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      if (!response.ok) throw new Error('health failed');
      const data = await response.json();
      const count = data.assistant?.tools ? 5 : 0;
      setStatus(`云端已连接 · ${count} 个经营工具可用`, 'ok');
      state.ready = true;
    } catch {
      setStatus('云端连接异常，AI 可能不可用', 'error');
    }
  }

  function init() {
    createUi();
    loadStatus();
    window.addEventListener('flower:ready', (event) => {
      if (event.detail?.offline) setStatus('云端离线 · 当前使用本地缓存', 'warn');
    });
    if (window.__AUTO_OPEN_AI__) {
      window.setTimeout(() => {
        if (window.__FLOWER_APP_READY__) openPanel();
        else window.addEventListener('flower:ready', openPanel, { once: true });
      }, 350);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
