/* =========================================================
   花间集 · 在线花房
   ========================================================= */
(() => {
  'use strict';

  const CART_KEY = 'hj_shop_cart_v1';
  const CUSTOMER_KEY = 'hj_shop_customer_v1';
  const COLOR_HEX = {
    '粉色': '#dca3ad',
    '白色': '#eee7d8',
    '香槟': '#d9bd8b',
    '红色': '#b96360',
    '黄色': '#d9b85f',
    '紫色': '#a58bb7',
    '绿色': '#8ca783',
    '蓝色': '#8fa8bd',
    '橙色': '#d69a69',
    '混色': '#c89b91'
  };

  const state = {
    shop: null,
    products: [],
    categories: [],
    activeCategory: '全部',
    query: '',
    cart: new Map(),
    checkout: null,
    requestId: '',
    lastOrder: null,
    busy: false,
    toastTimer: null,
    pollTimer: null,
    loading: true
  };

  const els = {};
  const money = (value) => `¥${Number(value || 0).toFixed(2)}`;
  const num = (value) => Number(value) || 0;
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const hash = (value) => {
    let h = 0;
    for (const char of String(value)) h = (h * 31 + char.charCodeAt(0)) >>> 0;
    return h;
  };

  function initEls() {
    const ids = ['shopBrand', 'heroShopName', 'footerShopName', 'catalogUpdated', 'categoryTabs', 'searchInput',
      'productGrid', 'catalogEmpty', 'resetFilters', 'cartButton', 'heroCartButton', 'cartCount', 'heroCartCount',
      'cartLayer', 'cartItems', 'cartPanelCount', 'cartTotal', 'checkoutButton', 'checkoutAmount',
      'checkoutLayer', 'checkoutForm', 'checkoutSummary', 'checkoutTotal', 'checkoutError', 'payButton',
      'paymentLayer', 'paymentAmount', 'paymentMethodRow', 'confirmPayButton', 'confirmPayAmount',
      'successLayer', 'successOrder', 'continueShopping', 'copyOrderNo', 'shopToast'];
    ids.forEach((id) => { els[id] = document.getElementById(id); });
    els.addressField = document.getElementById('addressField');
  }

  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (Array.isArray(raw)) {
        raw.forEach((item) => {
          const id = String(item?.id || '');
          const qty = Math.max(1, Math.min(99, Math.floor(Number(item?.qty) || 0)));
          if (id && qty) state.cart.set(id, qty);
        });
      }
    } catch (_) { /* ignore */ }
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify([...state.cart.entries()].map(([id, qty]) => ({ id, qty }))));
    } catch (_) { /* ignore */ }
  }

  function saveCustomer(data) {
    try { localStorage.setItem(CUSTOMER_KEY, JSON.stringify(data)); } catch (_) { /* ignore */ }
  }

  function loadCustomer() {
    try { return JSON.parse(localStorage.getItem(CUSTOMER_KEY) || '{}') || {}; } catch (_) { return {}; }
  }

  function colorHex(color) {
    return COLOR_HEX[color] || '#c8a8a2';
  }

  function icon(name, size = 16) {
    const paths = {
      plus: '<path d="M12 5v14M5 12h14"/>',
      bag: '<path d="M6 7V6a6 6 0 0 1 12 0v1"/><path d="M4 7h16l1 14H3L4 7Z"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
      heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>'
    };
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
  }

  function flowerArt(product) {
    const color = colorHex(product.color);
    const category = product.category || '其他';
    const stem = '<path d="M60 134c-1-27 0-46 1-67M60 104c-15-2-24-10-30-21 14-1 25 8 30 21ZM60 96c15-3 25-11 30-22-14 0-25 8-30 22Z" stroke="#6b886d" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M60 130c-3-13-4-22-4-32" stroke="#8b9d7f" stroke-width="1.2" opacity=".55"/>';
    let bloom = '';
    let extra = '';
    if (category === '绣球') {
      for (let i = 0; i < 12; i += 1) {
        const angle = (Math.PI * 2 * i) / 12;
        const radius = i % 2 ? 20 : 27;
        const x = 60 + Math.cos(angle) * radius;
        const y = 55 + Math.sin(angle) * radius * .8;
        bloom += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i % 3 === 0 ? 9 : 7}" fill="${color}" fill-opacity="${i % 2 ? '.64' : '.42'}"/>`;
      }
      bloom += `<circle cx="60" cy="55" r="6" fill="#f2e6c9"/>`;
    } else if (category === '郁金香') {
      bloom = `<path d="M44 63c-2-23 5-34 16-34 12 0 18 13 16 34-5 6-10 9-16 9s-11-3-16-9Z" fill="${color}" fill-opacity=".68"/><path d="M52 31c-1 17 3 29 8 37 6-10 8-23 6-37-3 5-5 8-7 10-2-3-4-6-7-10Z" fill="${color}"/><path d="M60 67v-29" stroke="#f7eee2" stroke-width="1" opacity=".6"/>`;
    } else if (category === '兰花') {
      for (let i = 0; i < 5; i += 1) {
        const angle = -90 + i * 72;
        bloom += `<ellipse cx="60" cy="38" rx="8" ry="22" fill="${color}" fill-opacity="${i % 2 ? '.48' : '.72'}" transform="rotate(${angle} 60 56)"/>`;
      }
      bloom += `<circle cx="60" cy="56" r="9" fill="#e9d4a7"/><circle cx="60" cy="56" r="4" fill="#b98e58"/>`;
    } else if (category === '配花' || category === '叶材') {
      for (let i = 0; i < 6; i += 1) {
        const x = 36 + i * 9.5;
        const y = 35 + (i % 3) * 13;
        extra += `<path d="M60 104C${x + 6} 83 ${x} 61 ${x} ${y}" stroke="#799278" stroke-width="1" fill="none"/><circle cx="${x}" cy="${y}" r="${3 + (i % 2) * 2}" fill="${color}" fill-opacity=".72"/><path d="M${x - 6} ${y + 9}c7-5 12-3 16 2-7 4-12 2-16-2Z" fill="#7d9b7a" fill-opacity=".42"/>`;
      }
      bloom = `<circle cx="60" cy="45" r="3" fill="${color}"/>`;
    } else if (category === '玫瑰') {
      for (let i = 0; i < 7; i += 1) {
        const angle = (360 / 7) * i;
        bloom += `<ellipse cx="60" cy="36" rx="12" ry="19" fill="${color}" fill-opacity="${i % 2 ? '.42' : '.62'}" transform="rotate(${angle} 60 56)"/>`;
      }
      bloom += `<circle cx="60" cy="56" r="17" fill="${color}" fill-opacity=".72"/><path d="M56 49c8-3 13 4 8 10-5 5-11 1-8-5 2-4 6-3 6 0" stroke="#f8eee2" stroke-width="1" fill="none" opacity=".8"/><circle cx="60" cy="56" r="3" fill="#d4af73"/>`;
    } else {
      const count = category === '洋桔梗' ? 6 : 7;
      for (let i = 0; i < count; i += 1) {
        const angle = (360 / count) * i;
        bloom += `<ellipse cx="60" cy="37" rx="11" ry="18" fill="${color}" fill-opacity="${i % 2 ? '.43' : '.64'}" transform="rotate(${angle} 60 56)"/>`;
      }
      bloom += `<circle cx="60" cy="56" r="10" fill="#f0dfb9"/><circle cx="60" cy="56" r="4" fill="#c19a56"/>`;
    }
    return `<svg viewBox="0 0 120 140" fill="none" aria-hidden="true">${stem}${extra}${bloom}</svg>`;
  }

  function artBackground(product) {
    return `${colorHex(product.color)}24`;
  }

  function filteredProducts() {
    const query = state.query.trim().toLowerCase();
    return state.products.filter((product) => {
      if (state.activeCategory !== '全部' && product.category !== state.activeCategory) return false;
      if (!query) return true;
      return [product.name, product.variety, product.category, product.color, product.grade]
        .filter(Boolean).join(' ').toLowerCase().includes(query);
    });
  }

  function productCard(product, index) {
    const low = product.stock > 0 && product.stock <= 15;
    const soldOut = product.stock <= 0;
    const stockText = soldOut ? '今日售罄' : product.stock <= 15 ? `仅剩 ${product.stock} ${escapeHTML(product.unit)}` : `余 ${product.stock} ${escapeHTML(product.unit)}`;
    return `<article class="product-card" style="animation-delay:${index * 28}ms">
      <div class="product-art" style="--art-bg:${artBackground(product)}">
        <span class="product-badge ${low ? 'is-low' : ''}">${soldOut ? 'SOLD OUT' : escapeHTML(product.category)}</span>
        <span class="product-fav">${icon('heart', 13)}</span>
        ${flowerArt(product)}
      </div>
      <div class="product-info">
        <div class="product-name"><h3>${escapeHTML(product.name)}</h3><span>${escapeHTML(product.grade || '')}级</span></div>
        <p class="product-variety">${escapeHTML(product.variety || product.category)} · ${escapeHTML(product.color || '')}</p>
        <div class="product-foot">
          <div class="product-price">${money(product.price)}<small>/ ${escapeHTML(product.unit)}</small></div>
          <div class="product-stock-wrap">
            <span class="product-stock ${low ? 'is-low' : ''}">${stockText}</span>
            <button class="add-button" type="button" data-add="${escapeHTML(product.id)}" ${soldOut ? 'disabled' : ''} aria-label="加入购物袋">${icon('plus', 14)}</button>
          </div>
        </div>
      </div>
    </article>`;
  }

  function renderCatalog() {
    const products = filteredProducts();
    els.productGrid.innerHTML = products.map(productCard).join('');
    els.catalogEmpty.hidden = products.length > 0;
    els.productGrid.hidden = products.length === 0;
    els.catalogUpdated.textContent = state.loading ? '正在同步花材' : `库存更新于 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    els.categoryTabs.innerHTML = ['全部', ...state.categories].map((category) => `<button type="button" role="tab" class="${state.activeCategory === category ? 'is-active' : ''}" data-category="${escapeHTML(category)}" aria-selected="${state.activeCategory === category}">${escapeHTML(category)}</button>`).join('');
    els.heroCartCount.textContent = String(cartCount());
    els.cartCount.textContent = String(cartCount());
  }

  function cartCount() {
    let count = 0;
    state.cart.forEach((qty) => { count += qty; });
    return count;
  }

  function productById(id) {
    return state.products.find((product) => product.id === id);
  }

  function syncCart() {
    for (const [id, qty] of [...state.cart]) {
      const product = productById(id);
      if (!product || product.stock <= 0) {
        state.cart.delete(id);
        continue;
      }
      if (qty > product.stock) state.cart.set(id, product.stock);
    }
    saveCart();
  }

  function cartSummary() {
    const lines = [];
    let total = 0;
    for (const [id, qty] of state.cart) {
      const product = productById(id);
      if (!product) continue;
      const subtotal = Math.round(qty * product.price * 100) / 100;
      total += subtotal;
      lines.push({ product, qty, subtotal });
    }
    return { lines, total: Math.round(total * 100) / 100, count: cartCount() };
  }

  function renderCart() {
    const summary = cartSummary();
    els.cartPanelCount.textContent = String(summary.count);
    els.cartCount.textContent = String(summary.count);
    els.heroCartCount.textContent = String(summary.count);
    els.cartTotal.textContent = money(summary.total);
    els.checkoutAmount.textContent = money(summary.total);
    els.checkoutButton.disabled = summary.lines.length === 0;
    if (!summary.lines.length) {
      els.cartItems.innerHTML = `<div class="cart-empty"><span class="empty-bloom">✿</span><strong>购物袋还是空的</strong><p>挑一枝今天喜欢的花吧。</p><a href="#catalog" data-close-cart>去选花</a></div>`;
      return;
    }
    els.cartItems.innerHTML = summary.lines.map(({ product, qty, subtotal }) => `<div class="cart-item">
      <div class="cart-thumb" style="--thumb-bg:${artBackground(product)}">${flowerArt(product)}</div>
      <div class="cart-item-info">
        <strong>${escapeHTML(product.name)}</strong>
        <span>${escapeHTML(product.variety || product.category)} · ${money(product.price)} / ${escapeHTML(product.unit)}</span>
        <div class="cart-item-price">${money(subtotal)}</div>
      </div>
      <div class="cart-item-side">
        <div class="qty-control">
          <button type="button" data-qty="${escapeHTML(product.id)}" data-delta="-1" aria-label="减少数量">−</button>
          <span>${qty}</span>
          <button type="button" data-qty="${escapeHTML(product.id)}" data-delta="1" aria-label="增加数量">+</button>
        </div>
        <button class="cart-remove" type="button" data-remove="${escapeHTML(product.id)}">移除</button>
      </div>
    </div>`).join('');
  }

  function renderBrand() {
    const name = state.shop?.name || '花间集';
    els.shopBrand.textContent = name;
    els.heroShopName.textContent = name;
    els.footerShopName.textContent = name;
    document.title = `${name} · 在线花房`;
  }

  function renderAll() {
    renderBrand();
    renderCatalog();
    renderCart();
  }

  function showToast(message, type = 'success') {
    if (!els.shopToast) return;
    clearTimeout(state.toastTimer);
    els.shopToast.textContent = message;
    els.shopToast.className = `shop-toast is-visible ${type === 'error' ? 'is-error' : ''}`;
    state.toastTimer = setTimeout(() => {
      els.shopToast.className = 'shop-toast';
    }, 2600);
  }

  function hideToast() {
    clearTimeout(state.toastTimer);
    if (els.shopToast) els.shopToast.className = 'shop-toast';
  }

  function setLocked(locked) {
    document.body.classList.toggle('shop-lock', locked);
  }

  function refreshLock() {
    const locked = !els.cartLayer.hidden || !els.checkoutLayer.hidden || !els.paymentLayer.hidden || !els.successLayer.hidden;
    setLocked(locked);
  }

  function openCart() {
    hideToast();
    els.cartLayer.hidden = false;
    renderCart();
    refreshLock();
  }

  function closeCart() {
    els.cartLayer.hidden = true;
    refreshLock();
  }

  async function loadCatalog({ silent = false } = {}) {
    if (!silent) {
      state.loading = true;
      renderCatalog();
    }
    try {
      const response = await fetch(`/api/storefront?ts=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`catalog ${response.status}`);
      const data = await response.json();
      state.shop = data.shop;
      state.products = Array.isArray(data.products) ? data.products : [];
      state.categories = Array.isArray(data.categories) ? data.categories : [];
      state.loading = false;
      const beforeCount = cartCount();
      syncCart();
      renderAll();
      if (silent && beforeCount !== cartCount()) showToast('部分花材库存已变化，购物袋已自动更新。');
    } catch (error) {
      state.loading = false;
      if (!silent) {
        els.productGrid.innerHTML = '';
        els.productGrid.hidden = true;
        els.catalogEmpty.hidden = false;
        els.catalogEmpty.innerHTML = `<span class="empty-flower">✿</span><strong>花房暂时打烊</strong><p>没能连接到花间集，请稍后再试。</p><button type="button" id="retryCatalog">重新连接</button>`;
        document.getElementById('retryCatalog')?.addEventListener('click', () => loadCatalog());
        showToast('花材加载失败，请检查网络。', 'error');
      }
    }
  }

  function addToCart(id) {
    const product = productById(id);
    if (!product) return;
    if (product.stock <= 0) {
      showToast('这枝花今天已经售罄了。', 'error');
      return;
    }
    const current = state.cart.get(id) || 0;
    if (current >= product.stock) {
      showToast(`库存只剩 ${product.stock} ${product.unit}，不能再加啦。`, 'error');
      return;
    }
    state.cart.set(id, current + 1);
    saveCart();
    renderCart();
    els.heroCartCount.textContent = String(cartCount());
    els.cartCount.textContent = String(cartCount());
    showToast(`${product.name} 已加入购物袋`);
  }

  function changeQty(id, delta) {
    const product = productById(id);
    if (!product) return;
    const current = state.cart.get(id) || 0;
    const next = current + delta;
    if (next <= 0) {
      state.cart.delete(id);
    } else if (next > product.stock) {
      showToast(`库存只剩 ${product.stock} ${product.unit}。`, 'error');
      return;
    } else {
      state.cart.set(id, next);
    }
    saveCart();
    renderCart();
  }

  function removeItem(id) {
    state.cart.delete(id);
    saveCart();
    renderCart();
  }

  function openCheckout() {
    const summary = cartSummary();
    if (!summary.lines.length) {
      showToast('先挑几枝花再结算吧。', 'error');
      return;
    }
    const form = els.checkoutForm;
    const customer = loadCustomer();
    if (form.elements.name && !form.elements.name.value) form.elements.name.value = customer.name || '';
    if (form.elements.phone && !form.elements.phone.value) form.elements.phone.value = customer.phone || '';
    const dateInput = form.elements.date;
    dateInput.min = todayKey();
    if (!dateInput.value) dateInput.value = todayKey();
    els.checkoutSummary.innerHTML = `<div class="checkout-summary-head"><span>本次花束</span><strong>${summary.count} 件</strong></div>
      ${summary.lines.map(({ product, qty, subtotal }) => `<div class="checkout-summary-line"><span>${escapeHTML(product.name)} × ${qty}</span><b>${money(subtotal)}</b></div>`).join('')}`;
    els.checkoutTotal.textContent = money(summary.total);
    els.payButton.textContent = `去支付 ${money(summary.total)}`;
    els.checkoutError.textContent = '';
    hideToast();
    closeCart();
    els.checkoutLayer.hidden = false;
    refreshLock();
    setTimeout(() => form.elements.name?.focus(), 150);
  }

  function closeCheckout() {
    els.checkoutLayer.hidden = true;
    refreshLock();
  }
  function updateFulfillment() {
    const form = els.checkoutForm;
    const method = form.elements.method.value;
    els.addressField.hidden = method !== 'delivery';
    document.querySelectorAll('.fulfillment-option').forEach((label) => {
      label.classList.toggle('is-active', label.querySelector('input')?.checked);
    });
  }

  function updatePaymentOptions() {
    document.querySelectorAll('.payment-option').forEach((label) => {
      label.classList.toggle('is-active', label.querySelector('input')?.checked);
    });
  }

  function validateCheckout() {
    const form = els.checkoutForm;
    const name = String(form.elements.name.value || '').trim();
    const phone = String(form.elements.phone.value || '').trim();
    const method = form.elements.method.value;
    const address = String(form.elements.address.value || '').trim();
    const date = String(form.elements.date.value || '').trim();
    if (name.length < 2 || name.length > 20) {
      form.elements.name.focus();
      return { error: '请填写 2-20 个字的收货人称呼。' };
    }
    if (!/^[0-9+\-\s]{6,20}$/.test(phone)) {
      form.elements.phone.focus();
      return { error: '请填写有效的联系电话。' };
    }
    if (method === 'delivery' && address.length < 5) {
      form.elements.address.focus();
      return { error: '同城配送需要填写详细地址。' };
    }
    if (!date || date < todayKey()) {
      form.elements.date.focus();
      return { error: '请选择今天或之后的收花日期。' };
    }
    return {
      name,
      phone,
      method,
      address: method === 'delivery' ? address : '',
      date,
      time: String(form.elements.time.value || ''),
      note: String(form.elements.note.value || '').trim(),
      paymentMethod: form.elements.paymentMethod.value
    };
  }

  function openPayment(checkout) {
    state.checkout = checkout;
    state.requestId = state.requestId || (crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const summary = cartSummary();
    const label = checkout.paymentMethod === 'wechat' ? '微信支付' : '支付宝';
    const iconClass = checkout.paymentMethod === 'wechat' ? 'pay-wechat' : 'pay-alipay';
    const iconText = checkout.paymentMethod === 'wechat' ? '微' : '支';
    els.paymentAmount.textContent = money(summary.total);
    els.confirmPayAmount.textContent = money(summary.total);
    els.paymentMethodRow.innerHTML = `<span class="pay-icon ${iconClass}">${iconText}</span><span>${label} · 演示支付</span>`;
    hideToast();
    els.checkoutLayer.hidden = true;
    els.paymentLayer.hidden = false;
    refreshLock();
  }

  function closePayment(reopenCheckout = true) {
    els.paymentLayer.hidden = true;
    if (reopenCheckout && state.checkout) {
      els.checkoutLayer.hidden = false;
    }
    refreshLock();
  }

  async function confirmPayment() {
    if (state.busy || !state.checkout) return;
    const summary = cartSummary();
    if (!summary.lines.length) {
      closePayment();
      showToast('购物袋已空，请重新选花。', 'error');
      return;
    }
    state.busy = true;
    const button = els.confirmPayButton;
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = '支付处理中…';
    try {
      await new Promise((resolve) => setTimeout(resolve, 850));
      const payload = {
        requestId: state.requestId,
        items: summary.lines.map(({ product, qty }) => ({ flowerId: product.id, qty })),
        customer: { name: state.checkout.name, phone: state.checkout.phone },
        delivery: {
          method: state.checkout.method,
          address: state.checkout.address,
          date: state.checkout.date,
          time: state.checkout.time,
          note: state.checkout.note
        },
        note: state.checkout.note,
        paymentMethod: state.checkout.paymentMethod
      };
      const response = await fetch('/api/storefront/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '支付失败，请稍后重试。');
      }
      saveCustomer({ name: state.checkout.name, phone: state.checkout.phone });
      state.lastOrder = data.order;
      state.cart.clear();
      state.requestId = '';
      saveCart();
      closePayment(false);
      els.checkoutLayer.hidden = true;
      refreshLock();
      showSuccess(data.order);
      loadCatalog({ silent: true });
    } catch (error) {
      closePayment(false);
      els.checkoutLayer.hidden = false;
      els.checkoutError.textContent = error.message || '支付失败，请稍后重试。';
      refreshLock();
      showToast(error.message || '支付失败，请稍后重试。', 'error');
      if (/库存|下架/.test(error.message || '')) loadCatalog({ silent: true });
    } finally {
      state.busy = false;
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  function showSuccess(order) {
    hideToast();
    const delivery = order.delivery || {};
    const methodLabel = delivery.methodLabel || (delivery.method === 'delivery' ? '同城配送' : '到店自提');
    els.successOrder.innerHTML = `<div class="success-order-head"><span>订单号</span><strong>${escapeHTML(order.no)}</strong></div>
      <div class="success-order-lines">${order.lines.map((line) => `<div class="success-order-line"><span>${escapeHTML(line.name)} × ${line.qty}</span><span>${money(line.subtotal)}</span></div>`).join('')}</div>
      <div class="success-order-total"><span>实付金额 · ${escapeHTML(order.payment)}</span><strong>${money(order.total)}</strong></div>
      <div class="success-meta"><span>收花人：<strong>${escapeHTML(order.customer.name)} · ${escapeHTML(order.customer.phone)}</strong></span><span>履约方式：<strong>${escapeHTML(methodLabel)}${delivery.address ? ` · ${escapeHTML(delivery.address)}` : ''}</strong></span><span>预约时间：<strong>${escapeHTML(delivery.date || '')} ${escapeHTML(delivery.time || '')}</strong></span></div>`;
    els.successLayer.hidden = false;
    refreshLock();
  }

  function closeSuccess() {
    els.successLayer.hidden = true;
    refreshLock();
    window.scrollTo({ top: document.getElementById('catalog')?.offsetTop || 0, behavior: 'smooth' });
    loadCatalog();
  }

  function copyOrderNo() {
    const text = state.lastOrder?.no || '';
    if (!text) return;
    const done = () => showToast('订单号已复制');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); done(); } catch (_) { showToast(text); }
    input.remove();
  }

  function resetFilters() {
    state.activeCategory = '全部';
    state.query = '';
    els.searchInput.value = '';
    renderCatalog();
  }

  function bindEvents() {
    els.cartButton.addEventListener('click', openCart);
    els.heroCartButton.addEventListener('click', openCart);
    document.querySelectorAll('[data-close-cart]').forEach((element) => element.addEventListener('click', closeCart));
    els.productGrid.addEventListener('click', (event) => {
      const add = event.target.closest('[data-add]');
      if (add) addToCart(add.dataset.add);
    });
    els.categoryTabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      state.activeCategory = button.dataset.category;
      renderCatalog();
    });
    els.searchInput.addEventListener('input', () => {
      state.query = els.searchInput.value;
      renderCatalog();
    });
    els.resetFilters.addEventListener('click', resetFilters);
    els.cartItems.addEventListener('click', (event) => {
      const qty = event.target.closest('[data-qty]');
      if (qty) {
        changeQty(qty.dataset.qty, Number(qty.dataset.delta));
        return;
      }
      const remove = event.target.closest('[data-remove]');
      if (remove) removeItem(remove.dataset.remove);
      const close = event.target.closest('[data-close-cart]');
      if (close) closeCart();
    });
    els.checkoutButton.addEventListener('click', openCheckout);
    document.querySelectorAll('[data-close-checkout]').forEach((element) => element.addEventListener('click', closeCheckout));
    document.querySelectorAll('[data-close-payment]').forEach((element) => element.addEventListener('click', closePayment));
    els.checkoutForm.addEventListener('change', (event) => {
      if (event.target.name === 'method') updateFulfillment();
      if (event.target.name === 'paymentMethod') updatePaymentOptions();
    });
    els.checkoutForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const checkout = validateCheckout();
      if (checkout.error) {
        els.checkoutError.textContent = checkout.error;
        showToast(checkout.error, 'error');
        return;
      }
      els.checkoutError.textContent = '';
      openPayment(checkout);
    });
    els.confirmPayButton.addEventListener('click', confirmPayment);
    els.continueShopping.addEventListener('click', closeSuccess);
    els.copyOrderNo.addEventListener('click', copyOrderNo);
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!els.successLayer.hidden) closeSuccess();
      else if (!els.paymentLayer.hidden) closePayment();
      else if (!els.checkoutLayer.hidden) closeCheckout();
      else if (!els.cartLayer.hidden) closeCart();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) loadCatalog({ silent: true });
    });
  }

  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => {
      if (document.hidden) return;
      if (!els.cartLayer.hidden || !els.checkoutLayer.hidden || !els.paymentLayer.hidden || !els.successLayer.hidden) return;
      loadCatalog({ silent: true });
    }, 8000);
  }

  async function init() {
    initEls();
    loadCart();
    bindEvents();
    const dateInput = els.checkoutForm.elements.date;
    const customer = loadCustomer();
    if (customer.name) els.checkoutForm.elements.name.value = customer.name;
    if (customer.phone) els.checkoutForm.elements.phone.value = customer.phone;
    dateInput.min = todayKey();
    dateInput.value = todayKey();
    await loadCatalog();
    startPolling();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
