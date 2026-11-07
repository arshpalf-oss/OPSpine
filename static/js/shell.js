/**
 * OPSpine Shell — rail, toolbar, palette, toasts, navigation.
 * Mounted once and never re-created across workspace switches.
 */
const Shell = (() => {
  let rail, toolbar, container, palette, shortcutsPanel, drawerScrim, railReopen;
  
  function init() {
    rail = document.getElementById('rail');
    toolbar = document.getElementById('toolbar');
    container = document.getElementById('workspace-container');
    palette = document.getElementById('palette');
    shortcutsPanel = document.getElementById('shortcuts-panel');
    drawerScrim = document.getElementById('drawer-scrim');
    railReopen = document.getElementById('rail-reopen');
    
    buildRail();
    initNavMode();
    initNavButtons();
    initToolbarSearch();
    initPalette();
    initShortcutsPanel();
    initBackToTop();
    initDelegatedActions();
    initScrollState();
    Motion.initClock();
    Motion.initAmbientCanvas();
    updateCrumb();
    updateStatusDot();
    
    // Update status dot when AI status is fetched
    API.aiStatus().then(s => {
      OPS.state.aiStatus = s;
      updateStatusDot();
    }).catch(() => {});
  }
  
  // ── Rail building ───────────────────────────────────────────────────
  function buildRail() {
    const workspaces = OPS.state.routes.filter(r => r.group === 'workspace');
    const system = OPS.state.routes.filter(r => r.group === 'system');
    const parent = OPS.state.routes.filter(r => r.group === 'parent');
    
    const wi = document.getElementById('rail-items');
    const si = document.getElementById('rail-system');
    
    wi.innerHTML = '';
    si.innerHTML = '';
    
    // Parent (Dashboard)
    parent.forEach(r => {
      wi.appendChild(railItem(r));
    });
    
    // Workspaces
    workspaces.forEach(r => {
      wi.appendChild(railItem(r));
    });
    
    // System
    system.forEach(r => {
      si.appendChild(railItem(r));
    });
    
    updateActiveRail();
  }
  
  function railItem(r) {
    const a = document.createElement('button');
    a.className = 'rail-item';
    a.dataset.path = r.path;
    a.dataset.action = 'nav:' + r.key;
    a.setAttribute('aria-label', r.label);
    a.innerHTML = `
      <span class="rail-item-icon">${iconSvg(r.icon)}</span>
      <span class="rail-item-text">
        ${r.label}
        ${r.description ? `<span class="rail-item-desc">${r.description}</span>` : ''}
      </span>
      ${r.shortcut ? `<span class="rail-item-kbd">⌘${r.shortcut}</span>` : ''}
    `;
    a.addEventListener('click', () => navigate(r.path));
    return a;
  }
  
  function iconSvg(name) {
    const icons = {
      home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
      sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.09 6.26L20 9l-5 4.87L16.18 21 12 17.77 7.82 21 9 13.87 4 9l5.91-.74L12 2z"/></svg>',
      search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      hammer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 12l-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9"/><path d="M17.64 15L22 10.64"/><path d="M20.91 11.7l-1.25-1.25a2.5 2.5 0 0 1 0-3.54l-.88-.88-2.13 2.13-3.5-3.5L11.01 3l-2.13 2.13"/></svg>',
      pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
      calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      nodes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="8.5" y1="7.5" x2="15.5" y2="16.5"/><line x1="15.5" y1="7.5" x2="8.5" y2="16.5"/></svg>',
      zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
      folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
      settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    };
    return icons[name] || icons.home;
  }
  
  function updateActiveRail() {
    document.querySelectorAll('.rail-item').forEach(el => {
      el.classList.toggle('active', el.dataset.path === OPS.state.currentPath);
    });
  }
  
  // ── Nav modes ───────────────────────────────────────────────────────
  function initNavMode() {
    applyNavMode(OPS.state.navMode);
    
    // Mobile: handle resize
    const mq = window.matchMedia('(max-width: 900px)');
    function mqHandler(e) {
      if (e.matches) {
        rail.classList.remove('expanded', 'collapsed', 'hidden');
      } else {
        applyNavMode(OPS.state.navMode);
      }
    }
    mq.addEventListener ? mq.addEventListener('change', mqHandler) : mq.addListener(mqHandler);
    if (mq.matches) mqHandler(mq);
  }
  
  function applyNavMode(mode) {
    rail.classList.remove('collapsed', 'hidden', 'drawer-open');
    railReopen.hidden = true;
    drawerScrim.classList.remove('visible');
    drawerScrim.hidden = true;
    
    const mq = window.matchMedia('(max-width: 900px)');
    if (mq.matches) {
      // Mobile: rail is off-screen drawer by default
      if (mode === 'drawer-open') {
        rail.classList.add('drawer-open');
        drawerScrim.classList.add('visible');
        drawerScrim.hidden = false;
      }
      return;
    }
    
    if (mode === 'collapsed') {
      rail.classList.add('collapsed');
    } else if (mode === 'hidden') {
      rail.classList.add('hidden');
      railReopen.hidden = false;
    }
  }
  
  function toggleNav() {
    const mq = window.matchMedia('(max-width: 900px)');
    if (mq.matches) {
      if (rail.classList.contains('drawer-open')) {
        OPS.setNavMode('collapsed');
      } else {
        OPS.setNavMode('drawer-open');
      }
      applyNavMode(OPS.state.navMode === 'expanded' ? 'drawer-open' : 
                   rail.classList.contains('drawer-open') ? 'collapsed' : 'drawer-open');
      rail.classList.toggle('drawer-open');
      drawerScrim.classList.toggle('visible');
      drawerScrim.hidden = !drawerScrim.classList.contains('visible');
    } else {
      const modes = ['expanded', 'collapsed', 'hidden'];
      const idx = modes.indexOf(OPS.state.navMode);
      const next = modes[(idx + 1) % modes.length];
      OPS.setNavMode(next);
      applyNavMode(next);
    }
  }
  
  function initNavButtons() {
    document.querySelector('.rail-collapse')?.addEventListener('click', toggleNav);
    railReopen?.addEventListener('click', () => {
      OPS.setNavMode('expanded');
      applyNavMode('expanded');
    });
    drawerScrim?.addEventListener('click', () => {
      rail.classList.remove('drawer-open');
      drawerScrim.classList.remove('visible');
      drawerScrim.hidden = true;
    });
    
    // Brand click goes to dashboard
    document.querySelector('.rail-logo')?.addEventListener('click', () => navigate('/dashboard'));
  }
  
  // ── Toolbar search / palette trigger ────────────────────────────────
  function initToolbarSearch() {
    const input = document.getElementById('toolbar-input');
    input?.addEventListener('focus', openPalette);
    input?.addEventListener('click', openPalette);
  }
  
  function updateCrumb() {
    const r = OPS.findRoute(OPS.state.currentKey);
    const el = document.getElementById('crumb-workspace');
    if (el) el.textContent = r ? r.label : 'Dashboard';
  }
  
  function updateStatusDot() {
    const dot = document.getElementById('status-dot');
    const label = document.getElementById('status-label');
    if (!dot || !label) return;
    const s = OPS.state.aiStatus;
    if (s.local_only) {
      dot.style.background = '#4ade80';
      dot.style.boxShadow = '0 0 8px #4ade80';
      label.textContent = 'LOCAL';
    } else {
      const hasProvider = Object.values(s.providers || {}).some(v => v);
      if (hasProvider) {
        dot.style.background = '#60a5fa';
        dot.style.boxShadow = '0 0 8px #60a5fa';
        label.textContent = 'ONLINE';
      } else {
        dot.style.background = '#fbbf24';
        dot.style.boxShadow = '0 0 8px #fbbf24';
        label.textContent = 'LOCAL';
      }
    }
  }
  
  function showSpinner() { document.getElementById('toolbar-spinner').hidden = false; }
  function hideSpinner() { document.getElementById('toolbar-spinner').hidden = true; }
  
  // ── Navigation (single navigate function used everywhere) ───────────
  let transitioning = false;
  
  async function navigate(path, pushState = true) {
    if (transitioning) return;
    if (path === OPS.state.currentPath && pushState) return;
    
    transitioning = true;
    
    // Save current panel state
    const oldKey = OPS.state.currentKey;
    savePanelState(oldKey);
    
    // Resolve path
    if (!path.startsWith('/')) path = '/' + path;
    if (path === '/') path = '/dashboard';
    
    const newKey = OPS.keyFromPath(path);
    
    // URL
    if (pushState) {
      history.pushState({ path, key: newKey }, '', path);
    }
    
    // Update state + palette tokens
    OPS.setCurrentPath(path);
    OPS.applyWorkspace(newKey);
    recordVisit(newKey);
    
    // Find panels
    const oldPanel = container.querySelector('.workspace-panel.active');
    let newPanel = container.querySelector(`.workspace-panel[data-key="${newKey}"]`);
    
    if (!newPanel) {
      newPanel = await Workspace.mount(newKey, container);
    }
    
    // Restore panel state
    restorePanelState(newKey);
    
    // Transition
    updateActiveRail();
    updateCrumb();
    
    await Motion.transitionTo(oldPanel, newPanel);
    
    // Focus
    const backBtn = toolbar.querySelector('.toolbar-back');
    if (newKey !== 'dashboard' && backBtn) {
      // Don't steal focus from inputs
    }
    
    // Announce
    const route = OPS.findRoute(newKey);
    if (route) {
      container.setAttribute('aria-label', `${route.label} workspace`);
    }
    
    transitioning = false;
    OPS.emit();
  }
  
  function recordVisit(key) {
    // Fire and forget
    fetch('/api/dashboard').catch(() => {});
  }
  
  function savePanelState(key) {
    const panel = container.querySelector(`.workspace-panel[data-key="${key}"]`);
    if (!panel) return;
    const scrollEl = panel.querySelector('.scroll-area') || window;
    OPS.rememberPanelState(key, {
      scrollTop: scrollEl === window ? window.scrollY : scrollEl.scrollTop,
    });
  }
  
  function restorePanelState(key) {
    const state = OPS.getPanelState(key);
    const panel = container.querySelector(`.workspace-panel[data-key="${key}"]`);
    if (!panel) return;
    const scrollEl = panel.querySelector('.scroll-area');
    if (state.scrollTop) {
      requestAnimationFrame(() => {
        if (scrollEl) scrollEl.scrollTop = state.scrollTop;
        else window.scrollTo(0, state.scrollTop);
      });
    }
  }
  
  function goBack() {
    navigate('/dashboard');
  }
  
  // ── Command Palette ─────────────────────────────────────────────────
  function initPalette() {
    const input = document.getElementById('palette-input');
    const results = document.getElementById('palette-results');
    
    // Load commands
    API.commands().then(data => {
      OPS.state.commands = data.commands;
    }).catch(() => {});
    
    input.addEventListener('input', () => {
      OPS.state.paletteQuery = input.value;
      renderPaletteResults();
    });
    
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        movePaletteSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        movePaletteSelection(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        activatePaletteResult();
      }
    });
    
    // Close on outside click
    palette.addEventListener('click', e => {
      if (e.target.classList.contains('palette-backdrop')) closePalette();
    });
  }
  
  function openPalette() {
    palette.hidden = false;
    const input = document.getElementById('palette-input');
    setTimeout(() => input.focus(), 50);
    OPS.state.paletteQuery = '';
    OPS.state.selectedPaletteIndex = 0;
    input.value = '';
    renderPaletteResults();
  }
  
  function closePalette() {
    palette.hidden = true;
  }
  
  function renderPaletteResults() {
    const results = document.getElementById('palette-results');
    const q = OPS.state.paletteQuery.toLowerCase();
    
    // Build flat list of results: navigation + commands
    let items = [];
    
    // Routes
    OPS.state.routes.forEach(r => {
      items.push({
        type: 'nav', label: r.label, desc: r.description || 'Navigate',
        icon: r.icon, shortcut: r.shortcut ? `⌘${r.shortcut}` : null,
        action: () => navigate(r.path), matchText: (r.label + ' ' + (r.description || '')).toLowerCase(),
      });
    });
    
    // Commands
    OPS.state.commands.forEach(c => {
      items.push({
        type: 'command', label: c.name, desc: c.workspace ? c.workspace : 'Command',
        icon: c.icon || 'zap', shortcut: c.shortcut,
        action: () => executeAction(c.action), matchText: (c.name + ' ' + (c.workspace || '')).toLowerCase(),
      });
    });
    
    if (q) items = items.filter(i => i.matchText.includes(q));
    items = items.slice(0, 20);
    
    OPS.state._paletteItems = items;
    
    results.innerHTML = '';
    if (items.length === 0) {
      results.innerHTML = '<div class="palette-empty">No matching commands</div>';
      return;
    }
    
    items.forEach((item, i) => {
      const el = document.createElement('button');
      el.className = 'palette-result' + (i === OPS.state.selectedPaletteIndex ? ' selected' : '');
      el.innerHTML = `
        <span class="palette-result-icon">${iconSvg(item.icon)}</span>
        <span class="palette-result-text">
          <span class="palette-result-name">${item.label}</span>
          <span class="palette-result-desc">${item.desc}</span>
        </span>
        ${item.shortcut ? `<span class="palette-result-kbd">${item.shortcut}</span>` : ''}
      `;
      el.addEventListener('click', () => { OPS.state.selectedPaletteIndex = i; activatePaletteResult(); });
      el.addEventListener('mouseenter', () => {
        OPS.state.selectedPaletteIndex = i;
        [...results.children].forEach((c, j) => c.classList.toggle('selected', j === i));
      });
      results.appendChild(el);
    });
  }
  
  function movePaletteSelection(delta) {
    const items = OPS.state._paletteItems || [];
    if (items.length === 0) return;
    OPS.state.selectedPaletteIndex = (OPS.state.selectedPaletteIndex + delta + items.length) % items.length;
    renderPaletteResults();
    const sel = document.querySelector('.palette-result.selected');
    sel?.scrollIntoView({ block: 'nearest' });
  }
  
  function activatePaletteResult() {
    const items = OPS.state._paletteItems || [];
    const item = items[OPS.state.selectedPaletteIndex];
    if (item) {
      closePalette();
      item.action();
    }
  }
  
  // ── Shortcuts panel ─────────────────────────────────────────────────
  function initShortcutsPanel() {
    shortcutsPanel.addEventListener('click', e => {
      if (e.target.classList.contains('palette-backdrop')) closeShortcuts();
    });
    // Ensure both overlays start hidden (defensive against any state issues)
    shortcutsPanel.hidden = true;
    palette.hidden = true;
  }
  
  function openShortcuts() {
    shortcutsPanel.hidden = false;
    const grid = document.getElementById('shortcuts-grid');
    const shortcuts = [
      { keys: ['⌘K'], desc: 'Command palette' },
      { keys: ['⌘0'], desc: 'Dashboard' },
      { keys: ['⌘1'], desc: 'Abyss' },
      { keys: ['⌘2'], desc: 'Scout' },
      { keys: ['⌘3'], desc: 'Forge' },
      { keys: ['⌘4'], desc: 'Quill' },
      { keys: ['⌘5'], desc: 'Kronos' },
      { keys: ['⌘6'], desc: 'Whiteboard' },
      { keys: ['⌘7'], desc: 'Dash' },
      { keys: ['⌘8'], desc: 'Working Board' },
      { keys: ['⌘Enter'], desc: 'Run primary action' },
      { keys: ['⌘⇧V'], desc: 'Voice input' },
      { keys: ['⌘Z'], desc: 'Undo' },
      { keys: ['?'], desc: 'Shortcut help' },
      { keys: ['Esc'], desc: 'Close overlay' },
    ];
    grid.innerHTML = shortcuts.map(s => `
      <div class="shortcut-row">
        <span>${s.desc}</span>
        <span class="shortcut-keys">${s.keys.map(k => `<kbd class="kbd">${k}</kbd>`).join('')}</span>
      </div>
    `).join('');
  }
  
  function closeShortcuts() { shortcutsPanel.hidden = true; }
  
  // ── Toasts ──────────────────────────────────────────────────────────
  function toast(message, opts = {}) {
    const container = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    const icon = opts.icon || (opts.type === 'error' ? '⚠' : opts.type === 'success' ? '✓' : '●');
    el.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-msg">${message}</span>
      ${opts.undo ? `<span class="toast-undo" data-undo="${opts.undoId || ''}">Undo</span>` : ''}
      <span class="toast-close">✕</span>
    `;
    container.appendChild(el);
    
    const close = () => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 250);
    };
    
    el.querySelector('.toast-close').addEventListener('click', close);
    if (opts.undo) {
      el.querySelector('.toast-undo').addEventListener('click', () => {
        opts.undo();
        close();
      });
    }
    
    if (opts.duration !== 0) {
      setTimeout(close, opts.duration || 4000);
    }
    return el;
  }
  
  // ── Back to top ─────────────────────────────────────────────────────
  function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    btn.addEventListener('click', () => {
      const activePanel = container.querySelector('.workspace-panel.active');
      if (activePanel) activePanel.scrollTo({ top: 0, behavior: Motion.reduced ? 'auto' : 'smooth' });
      else window.scrollTo({ top: 0, behavior: Motion.reduced ? 'auto' : 'smooth' });
    });
    
    window.addEventListener('scroll', () => {
      btn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
  }
  
  function initScrollState() {
    // Main workspace scroll for back-to-top
    container.addEventListener('scroll', () => {
      const btn = document.getElementById('back-to-top');
      btn.classList.toggle('visible', container.scrollTop > 400);
    });
  }
  
  // ── Delegated actions (data-action attributes) ──────────────────────
  function initDelegatedActions() {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      e.preventDefault();
      executeAction(action, el);
    });
  }
  
  function executeAction(action, el) {
    switch (action) {
      case 'nav:dashboard': case 'nav:home': navigate('/dashboard'); break;
      case 'nav:abyss': case 'nav:home': navigate('/abyss'); break;
      case 'nav:scout': case 'nav:verify': navigate('/scout'); break;
      case 'nav:forge': case 'nav:studio': navigate('/forge'); break;
      case 'nav:quill': case 'nav:draft': navigate('/quill'); break;
      case 'nav:kronos': case 'nav:cadence': navigate('/kronos'); break;
      case 'nav:whiteboard': navigate('/whiteboard'); break;
      case 'nav:dash': case 'nav:shortcuts': navigate('/dash'); break;
      case 'nav:working-board': case 'nav:board': navigate('/working-board'); break;
      case 'nav:library': case 'nav:vault': navigate('/library'); break;
      case 'nav:settings': navigate('/settings'); break;
      case 'nav:back': goBack(); break;
      case 'nav:toggle': toggleNav(); break;
      case 'palette:close': closePalette(); break;
      case 'shortcuts:close': closeShortcuts(); break;
      case 'history:undo': toast('Nothing to undo'); break;
      case 'history:redo': toast('Nothing to redo'); break;
      case 'voice:toggle': toast('Voice input requires an API key (Groq Whisper). Configure in Settings.', { type: 'info' }); break;
      default:
        if (action.startsWith('scout:')) { navigate('/scout'); }
        else if (action.startsWith('forge:')) { navigate('/forge'); }
        else if (action.startsWith('quill:')) { navigate('/quill'); }
        else if (action.startsWith('kronos:')) { navigate('/kronos'); }
        else if (action.startsWith('board:')) { navigate('/working-board'); }
        else if (action === 'system:backup') { backupNow(); }
    }
  }
  
  async function backupNow() {
    try {
      const data = await API.backup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `opspine-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Backup downloaded');
    } catch (err) {
      toast('Backup failed: ' + err.message, { type: 'error' });
    }
  }
  
  return {
    init, navigate, toast, openPalette, closePalette, openShortcuts, closeShortcuts,
    showSpinner, hideSpinner, goBack, toggleNav, iconSvg,
    get toolbar() { return toolbar; },
    get container() { return container; },
  };
})();
