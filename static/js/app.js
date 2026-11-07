/**
 * OPSpine App Entry — boot the shell, mount initial workspace, wire history.
 */
const Workspace = {
  mounts: {},
  
  register(key, mountFn) { this.mounts[key] = mountFn; },
  
  async mount(key, container) {
    const fn = this.mounts[key];
    if (!fn) {
      const known = Object.keys(this.mounts).join(', ');
      const el = document.createElement('div');
      el.className = 'workspace-panel';
      el.dataset.key = key;
      el.innerHTML = `<div class="empty-state" style="padding:48px;text-align:center">
        <div class="empty-icon" style="font-size:48px;margin-bottom:16px;opacity:.3">◈</div>
        <p style="margin-bottom:8px"><strong>Workspace "${key}" could not load.</strong></p>
        <p class="small" style="opacity:.5">Registered mounts: ${known || '(none)'}</p>
        <button class="glass-btn" style="margin-top:16px" onclick="location.reload()">Reload</button>
      </div>`;
      container.appendChild(el);
      console.error('Workspace not registered:', key, '; known:', known);
      return el;
    }
    try {
      const el = await fn();
      el.classList.add('workspace-panel');
      el.dataset.key = key;
      container.appendChild(el);
      return el;
    } catch(err) {
      console.error('Error mounting workspace', key, err);
      const el = document.createElement('div');
      el.className = 'workspace-panel';
      el.dataset.key = key;
      el.innerHTML = `<div class="empty-state" style="padding:48px;text-align:center">
        <p style="color:#ef4444"><strong>Error loading "${key}"</strong></p>
        <p class="small" style="opacity:.6;margin-top:8px">${err.message}</p>
        <button class="glass-btn" style="margin-top:16px" onclick="location.reload()">Reload</button>
      </div>`;
      container.appendChild(el);
      return el;
    }
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
