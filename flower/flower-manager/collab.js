/* =========================================================
   花间集 · 多人协作
   仅在服务端模式加载：在线成员、SSE 实时同步、署名和待同步提示。
   ========================================================= */
(() => {
  'use strict';

  if (window.APP_MODE !== 'server') return;

  const state = {
    booted: false,
    identity: null,
    presence: { count: 1, clients: [] },
    eventSource: null,
    pending: null,
    modalOpen: false,
    connected: false,
    helloTimer: null,
    pollTimer: null,
    pollBusy: false,
    pollMode: false,
    helloSeen: false
  };
  const els = {};

  function initials(name) {
    return String(name || '花').trim().slice(0, 1) || '花';
  }

  function ensureIdentity() {
    state.identity = getCollabIdentity();
    state.presence = {
      count: Math.max(1, state.presence.count || 1),
      clients: state.presence.clients?.length
        ? state.presence.clients
        : [{ id: state.identity.id, name: state.identity.name, color: '#3C7462' }]
    };
    return state.identity;
  }

  function makeAvatarButton() {
    const oldAvatar = document.querySelector('.topbar-avatar');
    if (!oldAvatar) return;
    let button = document.getElementById('collabButton');
    if (!button) {
      button = document.createElement('button');
      button.id = 'collabButton';
      button.type = 'button';
      button.className = 'topbar-avatar collab-avatar-btn';
      button.innerHTML = `<span class="collab-face"></span><i class="collab-badge">1</i>`;
      oldAvatar.replaceWith(button);
      button.addEventListener('click', openModalPanel);
    }
    els.avatar = button;
    els.face = button.querySelector('.collab-face');
    els.badge = button.querySelector('.collab-badge');
    updateAvatar();
  }

  function updateAvatar() {
    if (!els.avatar) return;
    const identity = state.identity || getCollabIdentity();
    els.face.textContent = initials(identity.name);
    els.badge.textContent = String(Math.max(1, state.presence.count || 1));
    els.avatar.title = `${state.presence.count || 1} 位协作者在线 · 点击查看协作成员`;
    els.avatar.classList.toggle('is-offline', !state.connected);
  }

  function createPendingPill() {
    if (document.getElementById('collabPending')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'collabPending';
    button.className = 'collab-pending';
    button.hidden = true;
    button.innerHTML = `<span class="collab-pending-dot"></span><span class="collab-pending-copy">同事刚刚更新了数据</span><strong>点击同步</strong>`;
    button.addEventListener('click', () => {
      if (ui.view === 'sales' && ui.cart.length > 0) {
        showToast('请先完成或清空当前开单，再同步同事的更新。', 'info');
        return;
      }
      if (!document.getElementById('modalLayer').hidden) closeModal();
      window.setTimeout(() => applyPending(true), 80);
    });
    document.body.appendChild(button);
    els.pending = button;
  }

  function showPending(payload) {
    state.pending = payload;
    if (!els.pending) createPendingPill();
    if (!els.pending) return;
    const actor = payload?.actor?.name ? `${payload.actor.name} ` : '同事';
    els.pending.querySelector('.collab-pending-copy').textContent = `${actor}刚刚更新了数据`;
    els.pending.hidden = false;
  }

  function clearPending() {
    state.pending = null;
    if (els.pending) els.pending.hidden = true;
  }

  function canApplyNow() {
    return typeof window.__collabCanApply === 'function' && window.__collabCanApply();
  }

  function applyPayload(payload, force = false) {
    if (!payload?.state) return false;
    if (!force && !canApplyNow()) {
      showPending(payload);
      return false;
    }
    const applied = typeof window.__collabApplyState === 'function'
      ? window.__collabApplyState(payload.state, payload)
      : false;
    if (applied) clearPending();
    return applied;
  }

  function applyPending(force = false) {
    if (!state.pending) return false;
    if (!force && !canApplyNow()) {
      showPending(state.pending);
      return false;
    }
    return applyPayload(state.pending, true);
  }

  function handleStateEvent(payload) {
    if (!payload || payload.actor?.id === state.identity?.id) return;
    if (payload.presence) {
      state.presence = payload.presence;
      updateAvatar();
      if (state.modalOpen) renderPresenceList();
    }
    applyPayload(payload);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    state.pollMode = false;
  }

  async function pollNow() {
    if (state.pollBusy) return;
    state.pollBusy = true;
    const identity = state.identity || getCollabIdentity();
    try {
      const response = await fetch(
        `/api/collab/poll?since=${encodeURIComponent(Number(window.__appRevision) || 0)}&clientId=${encodeURIComponent(identity.id)}&name=${encodeURIComponent(identity.name)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) throw new Error(`poll ${response.status}`);
      const data = await response.json();
      state.connected = true;
      if (data.presence) {
        state.presence = data.presence;
        updateAvatar();
        if (state.modalOpen) renderPresenceList();
      }
      if (data.changed && data.state) {
        handleStateEvent({
          state: data.state,
          actor: data.actor,
          action: data.action,
          at: data.at
        });
      }
    } catch (error) {
      state.connected = false;
      updateAvatar();
    } finally {
      state.pollBusy = false;
    }
  }

  function fallbackToPolling() {
    if (state.pollMode) return;
    state.pollMode = true;
    state.helloSeen = false;
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
    }
    if (state.helloTimer) {
      clearTimeout(state.helloTimer);
      state.helloTimer = null;
    }
    pollNow();
    state.pollTimer = setInterval(pollNow, 2500);
  }

  function connectEvents() {
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
    }
    if (state.helloTimer) {
      clearTimeout(state.helloTimer);
      state.helloTimer = null;
    }
    stopPolling();
    state.helloSeen = false;
    if (typeof EventSource === 'undefined') {
      fallbackToPolling();
      return;
    }
    const identity = state.identity || getCollabIdentity();
    const source = new EventSource(`/api/events?clientId=${encodeURIComponent(identity.id)}&name=${encodeURIComponent(identity.name)}`);
    state.eventSource = source;
    state.helloTimer = setTimeout(() => {
      if (!state.helloSeen) fallbackToPolling();
    }, 2500);
    source.addEventListener('hello', (event) => {
      try {
        const data = JSON.parse(event.data);
        state.helloSeen = true;
        state.connected = true;
        stopPolling();
        if (state.helloTimer) {
          clearTimeout(state.helloTimer);
          state.helloTimer = null;
        }
        if (data.presence) {
          state.presence = data.presence;
          updateAvatar();
          if (state.modalOpen) renderPresenceList();
        }
        const remoteRevision = Number(data.state?.meta?.revision) || Number(data.revision) || 0;
        if (remoteRevision > (Number(window.__appRevision) || 0)) {
          applyPayload({ state: data.state, actor: null, action: '同步了最新数据' });
        }
        updateAvatar();
      } catch (error) {
        console.warn('[collab] hello parse failed', error);
      }
    });
    source.addEventListener('presence', (event) => {
      try {
        const data = JSON.parse(event.data);
        state.presence = data;
        updateAvatar();
        if (state.modalOpen) renderPresenceList();
      } catch (_) { /* ignore */ }
    });
    source.addEventListener('state', (event) => {
      try {
        handleStateEvent(JSON.parse(event.data));
      } catch (error) {
        console.warn('[collab] state parse failed', error);
      }
    });
    source.onopen = () => {
      state.connected = true;
      updateAvatar();
    };
    source.onerror = () => {
      state.connected = false;
      updateAvatar();
      // Cloudflare Quick Tunnel 等代理可能缓冲 SSE；超时后自动降级为轮询。
      fallbackToPolling();
    };
  }

  function onlineRow(client) {
    const isMe = client.id === state.identity?.id;
    return `<div class="collab-online-row ${isMe ? 'is-me' : ''}">
      <span class="collab-online-dot" style="background:${client.color || '#3C7462'}"></span>
      <span class="collab-online-name">${escapeHTML(client.name || '花友')}</span>
      ${isMe ? '<span class="collab-you">你</span>' : ''}
      <span class="collab-online-status">在线</span>
    </div>`;
  }

  function renderPresenceList() {
    const list = document.getElementById('collabOnlineList');
    if (!list) return;
    const count = document.getElementById('collabOnlineCount');
    if (count) count.textContent = String(state.presence.count || 1);
    const clients = state.presence.clients || [];
    list.innerHTML = clients.length
      ? clients.map(onlineRow).join('')
      : `<div class="collab-online-empty">正在连接协作成员…</div>`;
  }

  function copyInvite() {
    const link = `${location.origin}/`;
    const done = () => showToast('链接已复制，发给同事即可一起操作。');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link).then(done).catch(() => fallbackCopy(link, done));
    } else {
      fallbackCopy(link, done);
    }
  }

  function fallbackCopy(text, done) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); done(); } catch (_) { showToast(text, 'info'); }
    textarea.remove();
  }

  function openModalPanel() {
    if (typeof openModal !== 'function') return;
    const identity = state.identity || getCollabIdentity();
    state.modalOpen = true;
    openModal({
      title: '协作成员',
      subtitle: '把同一个链接发给同事，大家的库存、订单和价格会实时同步。',
      body: `<form id="collabForm" class="modal-form" novalidate>
        <div class="collab-intro">
          <span class="collab-intro-icon">${icon('users', 17)}</span>
          <div><strong>实时协作已开启</strong><p>打开同一网址即为同一家店；修改会通过服务端合并并实时推送。</p></div>
        </div>
        <div class="form-error"></div>
        <div class="field">
          <label for="collabNameInput">你的协作称呼</label>
          <input id="collabNameInput" type="text" maxlength="16" value="${escapeHTML(identity.name)}" placeholder="例如：小林 / 店长" autocomplete="nickname" data-autofocus>
          <span class="hint">同事会在在线列表和操作提示里看到这个称呼。</span>
        </div>
        <div class="collab-online-title">当前在线 <span id="collabOnlineCount">${state.presence.count || 1}</span> 人</div>
        <div class="collab-online-list" id="collabOnlineList"></div>
        <button class="collab-copy-btn" type="button" id="collabCopyBtn">${icon('users', 14)} 复制当前链接邀请同事</button>
      </form>`,
      footer: `<span class="foot-note">修改会在所有打开的页面实时同步</span>
        <button class="btn btn-ghost" data-action="close-modal" type="button">关闭</button>
        <button class="btn btn-primary" type="submit" form="collabForm">保存称呼</button>`
    });
    renderPresenceList();
    const form = document.getElementById('collabForm');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = document.getElementById('collabNameInput');
        const name = String(input?.value || '').trim();
        if (!name) {
          const error = form.querySelector('.form-error');
          if (error) {
            error.textContent = '请先填写一个称呼。';
            error.classList.add('is-visible');
          }
          input?.focus();
          return;
        }
        try { localStorage.setItem('hj_collab_name', name.slice(0, 16)); } catch (_) { /* ignore */ }
        state.identity = getCollabIdentity();
        updateAvatar();
        connectEvents();
        closeModal();
        showToast(`协作称呼已设置为「${name}」。`, 'success');
      });
    }
    document.getElementById('collabCopyBtn')?.addEventListener('click', copyInvite);
  }

  function boot() {
    if (state.booted) return;
    state.booted = true;
    state.identity = getCollabIdentity();
    makeAvatarButton();
    createPendingPill();
    connectEvents();

    window.addEventListener('flower:modal-closed', () => {
      state.modalOpen = false;
      window.setTimeout(() => applyPending(false), 180);
    });
    window.addEventListener('beforeunload', () => {
      state.eventSource?.close();
      if (state.helloTimer) clearTimeout(state.helloTimer);
      if (state.pollTimer) clearInterval(state.pollTimer);
    });
    document.addEventListener('focusout', () => {
      if (state.pending) window.setTimeout(() => applyPending(false), 280);
    });
    window.addEventListener('online', () => {
      if (state.pollMode) {
        pollNow();
      } else if (!state.eventSource || state.eventSource.readyState === EventSource.CLOSED) {
        connectEvents();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (state.pollMode) pollNow();
      if (state.pending) applyPending(false);
    });
    if (new URLSearchParams(window.location.search).get('collab') === '1') {
      window.setTimeout(() => {
        if (!state.modalOpen) openModalPanel();
      }, 650);
    }
  }

  if (window.__FLOWER_APP_READY__) {
    boot();
  } else {
    window.addEventListener('flower:ready', boot, { once: true });
  }
})();
