/**
 * OPSpine Dashboard — parent launcher with aurora, animated tool cards, quick actions.
 */
(function() {
  const TOOL_CARDS = [
    { key: 'home', path: '/abyss', label: 'Abyss', desc: 'Route one prompt to the right engine', icon: 'sparkles', shortcut: '1', color: '#8faeff' },
    { key: 'verify', path: '/scout', label: 'Scout', desc: 'Research & verify claims with sources', icon: 'search', shortcut: '2', color: '#3b5998' },
    { key: 'studio', path: '/forge', label: 'Forge', desc: 'Produce real documents, decks, sheets', icon: 'hammer', shortcut: '3', color: '#ff3d71' },
    { key: 'draft', path: '/quill', label: 'Quill', desc: 'Write, refine, and polish prose', icon: 'pen', shortcut: '4', color: '#2563eb' },
    { key: 'cadence', path: '/kronos', label: 'Kronos', desc: 'Schedule work in plain language', icon: 'calendar', shortcut: '5', color: '#1a1a1a' },
    { key: 'whiteboard', path: '/whiteboard', label: 'Whiteboard', desc: 'Think in connected nodes', icon: 'nodes', shortcut: '6', color: '#ffffff' },
    { key: 'shortcuts', path: '/dash', label: 'Dash', desc: 'Fire any action in one hop', icon: 'zap', shortcut: '7', color: '#4fc3f7' },
    { key: 'board', path: '/working-board', label: 'Working Board', desc: 'Execute projects end-to-end', icon: 'board', shortcut: '8', color: '#ffffff' },
  ];
  
  const QUICK_ACTIONS = [
    { label: 'New Brief', icon: 'search', action: () => Shell.navigate('/scout') },
    { label: 'New Document', icon: 'hammer', action: () => Shell.navigate('/forge') },
    { label: 'New Draft', icon: 'pen', action: () => Shell.navigate('/quill') },
    { label: 'New Event', icon: 'calendar', action: () => Shell.navigate('/kronos') },
    { label: 'Open Library', icon: 'folder', action: () => Shell.navigate('/library') },
    { label: 'Settings', icon: 'settings', action: () => Shell.navigate('/settings') },
  ];
  
  const MOTION_PRESETS = [
    { id: 'liquid', label: 'Liquid', desc: 'Balanced glass' },
    { id: 'calm', label: 'Calm', desc: 'Gentle' },
    { id: 'cinematic', label: 'Cinematic', desc: 'Rich parallax' },
    { id: 'still', label: 'Still', desc: 'Zero motion' },
  ];
  
  function iconSVG(name, color) {
    const icons = {
      sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.09 6.26L20 9l-5 4.87L16.18 21 12 17.77 7.82 21 9 13.87 4 9l5.91-.74L12 2z"/></svg>',
      search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      hammer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 12l-8.5 8.5c-.83.83-2.17.83-3 0a2.12 2.12 0 0 1 0-3L12 9"/><path d="M17.64 15L22 10.64"/><path d="m14.41 6.41-3.4-2.57-1.13 1.13 2.13 2.13"/></svg>',
      pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
      calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      nodes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="8.5" y1="7.5" x2="15.5" y2="16.5"/><line x1="15.5" y1="7.5" x2="8.5" y2="16.5"/></svg>',
      zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
      folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
      settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    };
    return icons[name] || icons.sparkles;
  }
  
  function mount() {
    const el = document.createElement('div');
    el.className = 'dashboard-panel';
    el.innerHTML = `
      <div class="dashboard-hero">
        <div class="hero-meta reveal-card">
          <span class="eyebrow">
            <span class="status-dot"></span>
            LOCAL MODE · ${new Date().toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric'})}
          </span>
        </div>
        <h1 class="hero-greeting display reveal-card">Loading…</h1>
        <p class="hero-sub reveal-card">One operating environment. Eight specialist rooms. Zero cloud dependency.</p>
        
        <div class="hero-quick-entry reveal-card">
          <div class="glass-surface quick-entry-glass">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="dash-prompt" class="quick-entry-input" placeholder="Ask anything, or jump to a room…" autocomplete="off">
            <kbd class="kbd">⌘K</kbd>
          </div>
        </div>
      </div>
      
      <div class="dashboard-section reveal-card">
        <div class="section-header">
          <span class="eyebrow">Motion & Material</span>
          <div class="motion-presets" id="motion-presets"></div>
        </div>
      </div>
      
      <div class="dashboard-section">
        <div class="section-header">
          <span class="eyebrow">Quick Actions</span>
        </div>
        <div class="quick-actions-grid" id="quick-actions"></div>
      </div>
      
      <div class="dashboard-section">
        <div class="section-header">
          <span class="eyebrow">Workspaces</span>
          <span class="small" style="opacity:.5">Press ⌘1–8 to jump directly</span>
        </div>
        <div class="tool-cards-grid" id="tool-cards"></div>
      </div>
      
      <div class="dashboard-grid reveal-card">
        <div class="dashboard-panel-card">
          <h3>Recent Activity</h3>
          <div class="activity-list" id="activity-list">
            <div class="skeleton" style="height:20px;margin:8px 0"></div>
            <div class="skeleton" style="height:20px;margin:8px 0;width:80%"></div>
            <div class="skeleton" style="height:20px;margin:8px 0;width:90%"></div>
          </div>
        </div>
        <div class="dashboard-panel-card">
          <h3>Frequently Used</h3>
          <div class="freq-list" id="freq-list">
            <div class="skeleton" style="height:20px;margin:8px 0"></div>
          </div>
        </div>
        <div class="dashboard-panel-card">
          <h3>Today at a Glance</h3>
          <div class="stats-grid" id="stats-grid"></div>
        </div>
      </div>
    `;
    
    // Populate after append
    setTimeout(() => populate(el), 0);
    return el;
  }
  
  function populate(el) {
    // Greeting
    API.dashboard().then(data => {
      const g = el.querySelector('.hero-greeting');
      if (g) g.textContent = data.greeting;
      
      // Stats
      const statsEl = el.querySelector('#stats-grid');
      if (statsEl && data.stats) {
        const stats = [
          { label: 'Briefs', val: data.stats.briefs },
          { label: 'Documents', val: data.stats.documents },
          { label: 'Tasks', val: data.stats.pending_tasks },
          { label: 'Events this week', val: data.stats.upcoming_events },
        ];
        statsEl.innerHTML = stats.map(s => `
          <div class="stat-item">
            <div class="stat-val">${s.val}</div>
            <div class="stat-label">${s.label}</div>
          </div>
        `).join('');
      }
      
      // Activity
      const actEl = el.querySelector('#activity-list');
      if (actEl && data.activity) {
        if (data.activity.length === 0) {
          actEl.innerHTML = '<div class="empty-state" style="padding:24px"><p>No activity yet. Start working in any room.</p></div>';
        } else {
          actEl.innerHTML = data.activity.slice(0, 8).map(a => {
            const date = new Date(a.created_at * 1000);
            const route = OPS.findRoute(a.workspace);
            return `<div class="activity-row">
              <span class="activity-dot" style="background:${(OPS.state.palettes[a.workspace]||{}).accent||'#7b9cff'}"></span>
              <span class="activity-text">${a.action.replace('_',' ')}${a.detail ? ': ' + a.detail.slice(0,50) : ''}</span>
              <span class="activity-time small">${timeAgo(date)}</span>
            </div>`;
          }).join('');
        }
      }
      
      // Frequent
      const freqEl = el.querySelector('#freq-list');
      if (freqEl && data.visits) {
        if (data.visits.length === 0) {
          freqEl.innerHTML = '<div class="empty-state" style="padding:24px"><p>Visit rooms to build your frequent list.</p></div>';
        } else {
          freqEl.innerHTML = data.visits.slice(0, 6).map(v => {
            const route = OPS.findRoute(v.workspace);
            if (!route) return '';
            return `<button class="freq-row" data-path="${route.path}">
              <span>${route.label}</span>
              <span class="small" style="opacity:.45">${v.count} visits</span>
            </button>`;
          }).join('');
          freqEl.querySelectorAll('.freq-row').forEach(btn => {
            btn.addEventListener('click', () => Shell.navigate(btn.dataset.path));
          });
        }
      }
    }).catch(err => {
      el.querySelector('.hero-greeting').textContent = 'Welcome to OPSpine';
    });
    
    // Motion presets
    const mpEl = el.querySelector('#motion-presets');
    mpEl.innerHTML = MOTION_PRESETS.map(p => `
      <button class="motion-preset ${p.id === OPS.state.motionPreset ? 'active' : ''}" data-preset="${p.id}">
        <span class="preset-name">${p.label}</span>
        <span class="preset-desc small">${p.desc}</span>
      </button>
    `).join('');
    mpEl.querySelectorAll('.motion-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        OPS.setMotionPreset(btn.dataset.preset);
        mpEl.querySelectorAll('.motion-preset').forEach(b => b.classList.toggle('active', b === btn));
        Shell.toast(`Motion: ${btn.dataset.preset.charAt(0).toUpperCase() + btn.dataset.preset.slice(1)}`);
      });
    });
    
    // Quick actions
    const qaEl = el.querySelector('#quick-actions');
    qaEl.innerHTML = QUICK_ACTIONS.map(a => `
      <button class="quick-action-card glass-card reveal-card">
        <span class="card-sheen"></span>
        <span class="qa-icon">${iconSVG(a.icon)}</span>
        <span class="qa-label">${a.label}</span>
      </button>
    `).join('');
    qaEl.querySelectorAll('.quick-action-card').forEach((btn, i) => {
      btn.addEventListener('click', QUICK_ACTIONS[i].action);
    });
    
    // Tool cards
    const tcEl = el.querySelector('#tool-cards');
    tcEl.innerHTML = TOOL_CARDS.map(c => `
      <button class="tool-card glass-card reveal-card" data-path="${c.path}" style="--card-accent:${c.color}">
        <span class="card-sheen"></span>
        <div class="tc-head">
          <span class="tc-icon" style="background:${c.color}20;color:${c.color}">${iconSVG(c.icon)}</span>
          <span class="tc-kbd">⌘${c.shortcut}</span>
        </div>
        <div class="tc-body">
          <h3 class="tc-name">${c.label}</h3>
          <p class="tc-desc">${c.desc}</p>
        </div>
        <div class="tc-foot">
          <span class="tc-enter">Enter →</span>
        </div>
      </button>
    `).join('');
    tcEl.querySelectorAll('.tool-card').forEach(card => {
      card.addEventListener('click', () => Shell.navigate(card.dataset.path));
    });
    
    // Init sheen/tilt on cards
    setTimeout(() => {
      Motion.initSheenTilt(el.querySelectorAll('.glass-card'));
      Motion.reveal(el.querySelectorAll('.reveal-card'), 50);
    }, 50);
    
    // Quick entry input
    const input = el.querySelector('#dash-prompt');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && input.value.trim()) {
        routePrompt(input.value.trim());
      }
    });
    input.addEventListener('focus', () => Shell.openPalette());
  }
  
  async function routePrompt(text) {
    Shell.showSpinner();
    try {
      const result = await API.aiRoute(text);
      Shell.hideSpinner();
      const path = OPS.pathFromKey(result.route);
      if (path && path !== '/dashboard') {
        Shell.toast(result.message);
        setTimeout(() => Shell.navigate(path), 300);
      }
    } catch (err) {
      Shell.hideSpinner();
      Shell.toast(err.message, { type: 'error' });
    }
  }
  
  function timeAgo(date) {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }
  
  Workspace.register('dashboard', mount);
})();
