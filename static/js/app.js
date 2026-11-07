/**
 * OPSpine App Entry — boot the shell, mount initial workspace, wire history.
 */
const Workspace = {
  mounts: {},
  
  register(key, mountFn) { this.mounts[key] = mountFn; },
  
  async mount(key, container) {
    const fn = this.mounts[key];
    if (!fn) {
      const el = document.createElement('div');
      el.className = 'workspace-panel';
      el.dataset.key = key;
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">◈</div><p>Workspace "${key}" is loading…</p></div>`;
      container.appendChild(el);
      return el;
    }
    const el = await fn();
    el.classList.add('workspace-panel');
    el.dataset.key = key;
    container.appendChild(el);
    return el;
  }
};

(function boot() {
  // Register all workspace mounts
  // These must all be loaded before boot (scripts are loaded in order in index.html)
  
  function init() {
    Shell.init();
    Commands.init();
    
    // Set initial rail mode based on landing workspace
    Shell.applyNavModeForWorkspace(OPS.state.currentKey);
    
    // Mount initial workspace
    const initKey = OPS.state.currentKey;
    const fn = Workspace.mounts[initKey];
    if (fn) {
      const panel = fn();
      panel.classList.add('workspace-panel', 'active');
      panel.dataset.key = initKey;
      Shell.container.appendChild(panel);
      // Reveal animation
      requestAnimationFrame(() => {
        const cards = panel.querySelectorAll('.reveal-card, .glass-card');
        Motion.reveal([...cards], 100);
        Motion.initSheenTilt(panel.querySelectorAll('.glass-card'));
      });
    }
    
    // History navigation
    window.addEventListener('popstate', e => {
      const path = e.state?.path || location.pathname;
      Shell.navigate(path, false);
    });
    
    // Replace initial history entry
    history.replaceState({ path: OPS.state.currentPath, key: OPS.state.currentKey }, '', OPS.state.currentPath);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
