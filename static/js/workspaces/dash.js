/**
 * Dash — Shortcuts & quick actions (dark telemetry)
 */
(function() {
  function mount() {
    const el = document.createElement('div');
    el.className = 'dash-panel scroll-area';
    el.innerHTML = `
      <div class="workspace-header">
        <div class="workspace-title">
          <span class="eyebrow">◉ DASH · COMMAND CENTER</span>
          <h1 style="font-weight:300;letter-spacing:-0.02em">Dash.</h1>
        </div>
      </div>
      
      <div class="dash-stats">
        <div class="dash-stat glass-card">
          <div class="dash-meter"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(79,195,247,.15)" stroke-width="3"/><circle cx="18" cy="18" r="15" fill="none" stroke="#4fc3f7" stroke-width="3" stroke-dasharray="70 100" stroke-linecap="round" transform="rotate(-90 18 18)"/></svg><span>70%</span></div>
          <div class="dash-stat-label">Commands available</div>
        </div>
        <div class="dash-stat glass-card">
          <div class="dash-stat-num" id="dash-today">0</div>
          <div class="dash-stat-label">Actions today</div>
        </div>
        <div class="dash-stat glass-card">
          <div class="dash-stat-num" id="dash-docs">0</div>
          <div class="dash-stat-label">Files generated</div>
        </div>
        <div class="dash-stat glass-card">
          <div class="dash-stat-num" style="color:#4ade80">ONLINE</div>
          <div class="dash-stat-label">Local engine</div>
        </div>
      </div>
      
      <div class="dash-command-section glass-card">
        <div class="dash-cmd-head">
          <span class="eyebrow">COMMAND CENTER</span>
          <div class="dash-filter-chips">
            <button class="chip dash-filter active" data-filter="all">All</button>
            <button class="chip dash-filter" data-filter="nav">Navigate</button>
            <button class="chip dash-filter" data-filter="create">Create</button>
            <button class="chip dash-filter" data-filter="system">System</button>
          </div>
        </div>
        <div class="dash-cmd-input-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="dash-cmd-input" class="dash-cmd-input" placeholder="Type a command…" autocomplete="off">
        </div>
        <div class="dash-cmd-table">
          <table>
            <thead><tr><th>Command</th><th>Shortcut</th><th>Workspace</th><th>Action</th></tr></thead>
            <tbody id="dash-cmd-body"></tbody>
          </table>
        </div>
      </div>
      
      <div class="dash-two-col">
        <div class="dash-recent glass-card">
          <span class="eyebrow">RECENT ACTIONS</span>
          <div id="dash-recent-list" style="margin-top:var(--sp-3)"></div>
        </div>
        <div class="dash-custom glass-card">
          <span class="eyebrow">CUSTOM SHORTCUTS</span>
          <div id="dash-custom-list" style="margin-top:var(--sp-3)"></div>
          <button class="glass-btn" id="dash-add-custom" style="margin-top:var(--sp-3)">+ Add shortcut</button>
        </div>
      </div>
    `;
    setTimeout(() => populate(el), 0);
    return el;
  }
  
  let commands = [];
  
  function populate(el) {
    const tbody = el.querySelector('#dash-cmd-body');
    const input = el.querySelector('#dash-cmd-input');
    let currentFilter = 'all';
    
    async function load() {
      const data = await API.commands();
      commands = data.commands;
      render();
      
      const dash = await API.dashboard();
      el.querySelector('#dash-today').textContent = dash.activity ? dash.activity.filter(a => a.created_at > Date.now()/1000 - 86400).length : 0;
      el.querySelector('#dash-docs').textContent = dash.stats ? dash.stats.documents : 0;
      
      const act = await API.activity(15);
      el.querySelector('#dash-recent-list').innerHTML = act.activity.map(a => `
        <div class="dash-recent-row">
          <span style="color:#4fc3f7">●</span>
          <span>${a.action.replace('_',' ')}</span>
          <span class="small" style="opacity:.4;margin-left:auto;font-family:var(--mono)">${new Date(a.created_at*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
        </div>
      `).join('');
    }
    
    function render() {
      const q = input.value.toLowerCase();
      let filtered = commands;
      if (currentFilter !== 'all') {
        filtered = filtered.filter(c => {
          if (currentFilter === 'nav') return c.action.startsWith('nav:');
          if (currentFilter === 'create') return c.action.includes(':new');
          if (currentFilter === 'system') return c.action.startsWith('system:');
          return true;
        });
      }
      if (q) filtered = filtered.filter(c => c.name.toLowerCase().includes(q) || (c.action||'').toLowerCase().includes(q));
      
      tbody.innerHTML = filtered.map(c => `
        <tr data-action="${c.action}" class="dash-cmd-row">
          <td><strong>${c.name}</strong></td>
          <td>${c.shortcut ? `<kbd class="kbd">${c.shortcut}</kbd>` : ''}</td>
          <td><span class="small" style="opacity:.5">${c.workspace || '—'}</span></td>
          <td><span class="small" style="font-family:var(--mono);opacity:.4">${c.action}</span></td>
        </tr>
      `).join('') || '<tr><td colspan="4" style="text-align:center;padding:var(--sp-6);opacity:.4">No commands found</td></tr>';
      
      tbody.querySelectorAll('.dash-cmd-row').forEach(r => {
        r.addEventListener('click', () => {
          const action = r.dataset.action;
          executeAction(action);
        });
      });
    }
    
    input.addEventListener('input', render);
    el.querySelectorAll('.dash-filter').forEach(f => {
      f.addEventListener('click', () => {
        el.querySelectorAll('.dash-filter').forEach(x => x.classList.remove('active'));
        f.classList.add('active');
        currentFilter = f.dataset.filter;
        render();
      });
    });
    
    el.querySelector('#dash-add-custom').addEventListener('click', () => {
      Shell.toast('Custom shortcuts can be added via the API.', { type: 'info' });
    });
    
    el.querySelector('#dash-custom-list').innerHTML = '<div class="small" style="opacity:.4">Custom shortcuts will appear here.</div>';
    
    load();
  }
  
  function executeAction(action) {
    if (action.startsWith('nav:')) {
      const key = action.split(':')[1];
      const path = OPS.pathFromKey(key);
      if (path) Shell.navigate(path);
    } else {
      Shell.toast(`Running: ${action}`);
    }
  }
  
  Workspace.register('shortcuts', mount);
})();
