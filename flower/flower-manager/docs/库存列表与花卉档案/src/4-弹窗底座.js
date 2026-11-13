/* =========================================================
   花间集 · 库存列表 → 花卉档案（源码整理）
   文件 4 / 5：弹窗底座
   摘录自：app.js 第 261-281 行、第 336-351 行（原样摘录）
   补充：lastFocused / pendingConfirm 在原项目中声明于 app.js 顶部，
         这里一并声明，使本文件可以独立取用。
   ========================================================= */

let lastFocused = null;
let pendingConfirm = null;

/* ---------- app.js:261-281  openModal：打开弹窗 ---------- */
function openModal({ title, subtitle = '', body = '', footer = '', size = '' }) {
  const layer = document.getElementById('modalLayer');
  const modal = document.getElementById('modal');
  if (!layer || !modal) return;
  lastFocused = document.activeElement;
  modal.className = `modal ${size === 'wide' ? 'is-wide' : size === 'large' ? 'is-large' : ''}`;
  modal.innerHTML = `<div class="modal-head">
      <h2 id="modalTitle">${title}</h2>
      ${subtitle ? `<p>${subtitle}</p>` : ''}
      <button class="modal-close" data-action="close-modal" aria-label="关闭弹窗" title="关闭">${icon('x', 14)}</button>
    </div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}`;
  layer.hidden = false;
  document.body.classList.add('modal-open');
  window.setTimeout(() => {
    const focusTarget = modal.querySelector('[data-autofocus]') ||
      modal.querySelector('input:not([type="hidden"]):not([type="file"]), select, textarea');
    if (focusTarget) focusTarget.focus();
  }, 45);
}

/* ---------- app.js:336-351  closeModal：关闭弹窗 ---------- */
function closeModal() {
  const layer = document.getElementById('modalLayer');
  const modal = document.getElementById('modal');
  if (!layer || layer.hidden) return;
  layer.hidden = true;
  if (modal) modal.innerHTML = '';
  document.body.classList.remove('modal-open');
  pendingConfirm = null;
  if (lastFocused && document.contains(lastFocused)) {
    try { lastFocused.focus({ preventScroll: true }); } catch (_) { /* noop */ }
  }
  lastFocused = null;
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('flower:modal-closed'));
  }, 40);
}
