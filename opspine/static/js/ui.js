/* ==========================================================================
   OPSpine UI primitives
   Toasts, confirm dialog, focus trapping, formatting, and small DOM helpers.
   Everything here is shared by the shell and every workspace.
   ========================================================================== */
(function () {
  'use strict';

  const U = {};

  /* ---------- DOM helpers ---------- */
  U.$ = (selector, root = document) => root.querySelector(selector);
  U.$$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  U.el = function (tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else node.setAttribute(key, value === true ? '' : value);
    });
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  };

  U.clear = (node) => {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  U.escape = function (value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /* ---------- formatting ---------- */
  U.relativeTime = function (timestamp) {
    if (!timestamp) return '';
    const seconds = Date.now() / 1000 - Number(timestamp);
    if (Number.isNaN(seconds)) return '';
    if (seconds < 45) return 'just now';
    if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))} min ago`;
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return hours === 1 ? '1 hr ago' : `${hours} hr ago`;
    }
    if (seconds < 604800) {
      const days = Math.floor(seconds / 86400);
      return days === 1 ? 'yesterday' : `${days} days ago`;
    }
    return new Date(Number(timestamp) * 1000).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };

  U.formatDate = function (timestamp) {
    if (!timestamp) return '';
    return new Date(Number(timestamp) * 1000).toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  };

  U.formatTime = function (timestamp) {
    if (!timestamp) return '';
    return new Date(Number(timestamp) * 1000).toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit',
    });
  };

  U.formatDateTime = function (timestamp) {
    if (!timestamp) return '';
    return `${U.formatDate(timestamp)} · ${U.formatTime(timestamp)}`;
  };

  U.filesize = function (bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1048576).toFixed(1)} MB`;
  };

  U.toLocalInput = function (timestamp) {
    const date = new Date(Number(timestamp) * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  U.fromLocalInput = function (value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
  };

  /* ---------- toasts ---------- */
  const toastHost = () => document.getElementById('toasts');

  U.toast = function (message, kind = 'info', timeout = 4200) {
    const host = toastHost();
    if (!host) return;
    const node = U.el('div', { class: `toast toast--${kind}`, role: 'status' }, [
      U.el('span', { class: 'toast__dot' }),
      U.el('span', { class: 'toast__text', text: message }),
    ]);
    /* Keep the stack short so it never covers working content. */
    while (host.children.length >= 3) {
      host.removeChild(host.firstElementChild);
    }
    host.appendChild(node);
    const remove = () => {
      node.style.transition = 'opacity 160ms ease';
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 180);
    };
    setTimeout(remove, timeout);
    node.addEventListener('click', remove);
  };

  U.success = (message) => U.toast(message, 'success');
  U.error = (message) => U.toast(message, 'error', 6000);

  /* ---------- confirm dialog ---------- */
  let confirmResolver = null;

  U.confirm = function (options = {}) {
    const overlay = document.getElementById('confirm');
    if (!overlay) return Promise.resolve(window.confirm(options.message || 'Are you sure?'));
    const title = overlay.querySelector('#confirm-title');
    const message = overlay.querySelector('#confirm-message');
    const accept = overlay.querySelector('#confirm-accept');

    title.textContent = options.title || 'Are you sure?';
    message.textContent = options.message || '';
    accept.textContent = options.confirmLabel || 'Delete';
    accept.classList.toggle('btn--danger', !options.safe);

    overlay.hidden = false;
    overlay.dataset.open = 'true';
    accept.focus();

    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  };

  U.closeConfirm = function (result) {
    const overlay = document.getElementById('confirm');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    delete overlay.dataset.open;
    if (confirmResolver) {
      const resolve = confirmResolver;
      confirmResolver = null;
      resolve(Boolean(result));
    }
  };

  /* ---------- text prompt ---------- */
  let promptResolver = null;

  /* Resolves with the trimmed text, or null when cancelled. Falls back to
     window.prompt only when the shared dialog is not on the page. */
  U.prompt = function (options = {}) {
    const overlay = document.getElementById('prompt');
    const input = document.getElementById('prompt-input');
    if (!overlay || !input) {
      const answer = window.prompt(options.title || 'Enter a value', options.value || '');
      return Promise.resolve(answer === null ? null : answer.trim());
    }
    document.getElementById('prompt-title').textContent = options.title || 'Enter a value';
    const hint = document.getElementById('prompt-hint');
    hint.textContent = options.message || '';
    hint.hidden = !options.message;
    document.getElementById('prompt-label').textContent = options.label || options.title || 'Value';
    input.value = options.value || '';
    input.maxLength = options.maxLength || 160;
    input.placeholder = options.placeholder || '';
    const accept = document.getElementById('prompt-accept');
    accept.textContent = options.confirmLabel || 'Save';
    accept.classList.toggle('btn--danger', Boolean(options.danger));

    overlay.hidden = false;
    overlay.dataset.open = 'true';
    input.focus();
    input.select();

    return new Promise((resolve) => {
      promptResolver = resolve;
    });
  };

  U.closePrompt = function (value) {
    const overlay = document.getElementById('prompt');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    delete overlay.dataset.open;
    if (promptResolver) {
      const resolve = promptResolver;
      promptResolver = null;
      resolve(value === null || value === undefined ? null : String(value).trim());
    }
  };

  /* ---------- focus trap ---------- */
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
    ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  U.trapFocus = function (container, event) {
    const items = U.$$(FOCUSABLE, container).filter(
      (node) => node.offsetParent !== null || node === document.activeElement
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  /* ---------- state rendering ---------- */
  U.state = function ({ title, body, variant = '', actionLabel, onAction }) {
    const wrapper = U.el('div', {
      class: `state${variant ? ` state--${variant}` : ''}`,
    });
    if (variant === 'loading') {
      wrapper.appendChild(U.el('span', { class: 'spinner' }));
    }
    if (title) wrapper.appendChild(U.el('p', { class: 'state__title', text: title }));
    if (body) wrapper.appendChild(U.el('p', { class: 'state__body', text: body }));
    if (actionLabel && onAction) {
      wrapper.appendChild(
        U.el('button', {
          class: 'btn btn--sm',
          type: 'button',
          onClick: onAction,
        }, actionLabel)
      );
    }
    return wrapper;
  };

  U.stateInto = function (host, options) {
    U.clear(host);
    host.appendChild(U.state(options));
  };

  /* ---------- misc ---------- */
  U.debounce = function (fn, wait = 220) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  };

  U.copy = async function (text, message = 'Copied to clipboard.') {
    try {
      await navigator.clipboard.writeText(text);
      U.success(message);
      return true;
    } catch (err) {
      U.error('The browser blocked clipboard access.');
      return false;
    }
  };

  U.mod = function () {
    return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? 'Cmd' : 'Ctrl';
  };

  window.OPS = window.OPS || {};
  window.OPS.ui = U;
})();
