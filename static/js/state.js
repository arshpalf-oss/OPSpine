/**
 * OPSpine State Management — single source of truth for UI state.
 * All data is fetched from API; localStorage holds only preferences.
 */
const OPS = (() => {
  const initData = JSON.parse(document.getElementById('initial-data').textContent);
  
  const state = {
    currentPath: initData.initialPath || '/dashboard',
    currentKey: initData.initialKey || 'dashboard',
    routes: initData.routes || [],
    palettes: initData.palettes || {},
    navMode: localStorage.getItem('opspine.navMode') || 'expanded',
    motionPreset: localStorage.getItem('opspine.motion') || 'liquid',
    leftSidebarOpen: localStorage.getItem('opspine.leftSidebar') !== 'closed',  // chat/history sidebar
    rightSidebarOpen: localStorage.getItem('opspine.rightSidebar') !== 'closed', // tools/connectors strip
    panelStates: {}, // per-workspace state (scroll, tabs, drafts, etc.)
    commands: [],
    activity: [],
    dashboardData: null,
    aiStatus: { local_only: true, providers: {} },
    selectedPaletteIndex: 0,
    paletteQuery: '',
    toasts: [],
    undoStack: [],
    redoStack: [],
  };

  const listeners = new Set();
  
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit() { listeners.forEach(fn => fn(state)); }
  
  function setNavMode(mode) {
    state.navMode = mode;
    localStorage.setItem('opspine.navMode', mode);
    emit();
  }
  
  function setMotionPreset(preset) {
    state.motionPreset = preset;
    localStorage.setItem('opspine.motion', preset);
    applyMotion(preset);
    emit();
  }
  
  function applyMotion(preset) {
    document.documentElement.setAttribute('data-motion', preset);
  }
  
  function applyWorkspace(key) {
    state.currentKey = key;
    const palette = state.palettes[key] || state.palettes.dashboard;
    const root = document.documentElement;
    const body = document.body;
    const layout = routeLayout(key);
    body.setAttribute('data-workspace', key);
    body.setAttribute('data-layout', layout);
    // Apply on BOTH root and body for reliability (body's background is what renders)
    const targets = [root.style, body.style];
    targets.forEach(t => {
      t.setProperty('--ws-bg', palette.bg);
      t.setProperty('--ws-ink', palette.ink);
      t.setProperty('--ws-line', palette.line);
      t.setProperty('--ws-accent', palette.accent);
      t.setProperty('--ws-glass', palette.glass);
      t.setProperty('--ws-glass2', palette.glass2 || palette.glass);
      t.setProperty('--ws-ink-soft', palette.ink_soft || palette.ink);
      t.setProperty('--ws-ink-mute', palette.ink_mute || 'rgba(128,128,128,.5)');
      t.background = palette.bg;
      t.color = palette.ink;
    });
    document.documentElement.style.colorScheme = isDark(key) ? 'dark' : 'light';
  }
  
  function isDark(key) {
    const darkKeys = ['dashboard', 'home', 'studio', 'whiteboard', 'shortcuts', 'board', 'vault', 'settings'];
    return darkKeys.includes(key);
  }
  
  function rememberPanelState(key, panelState) {
    state.panelStates[key] = { ...state.panelStates[key], ...panelState };
  }
  
  function getPanelState(key) {
    return state.panelStates[key] || {};
  }
  
  function findRoute(keyOrPath) {
    return state.routes.find(r => r.key === keyOrPath || r.path === keyOrPath);
  }
  
  function routeLayout(keyOrPath) {
    const r = findRoute(keyOrPath);
    return r ? (r.layout || 'tool') : 'tool';
  }
  
  function toggleLeftSidebar() {
    state.leftSidebarOpen = !state.leftSidebarOpen;
    localStorage.setItem('opspine.leftSidebar', state.leftSidebarOpen ? 'open' : 'closed');
    applySidebars();
    emit();
  }
  
  function toggleRightSidebar() {
    state.rightSidebarOpen = !state.rightSidebarOpen;
    localStorage.setItem('opspine.rightSidebar', state.rightSidebarOpen ? 'open' : 'closed');
    applySidebars();
    emit();
  }
  
  function applySidebars() {
    document.body.classList.toggle('left-closed', !state.leftSidebarOpen);
    document.body.classList.toggle('right-closed', !state.rightSidebarOpen);
  }
  
  function keyFromPath(path) {
    const r = state.routes.find(r => r.path === path);
    return r ? r.key : 'dashboard';
  }
  
  function pathFromKey(key) {
    const r = state.routes.find(r => r.key === key);
    return r ? r.path : '/dashboard';
  }
  
  function setCurrentPath(path) {
    state.currentPath = path;
    state.currentKey = keyFromPath(path);
    emit();
  }
  
  // Initialize motion
  applyMotion(state.motionPreset);
  applyWorkspace(state.currentKey);
  applySidebars();
  
  return {
    state,
    subscribe,
    emit,
    setNavMode,
    setMotionPreset,
    applyMotion,
    applyWorkspace,
    isDark,
    rememberPanelState,
    getPanelState,
    findRoute, routeLayout,
    keyFromPath, pathFromKey,
    setCurrentPath,
    toggleLeftSidebar, toggleRightSidebar, applySidebars,
  };
})();
