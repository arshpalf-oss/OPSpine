/**
 * OPSpine Dashboard — parent launcher with aurora, animated tool cards, quick actions.
 */
(function() {
  const TOOL_CARDS = [
    { key: 'home', path: '/abyss', label: 'Abyss', eyebrow: 'CENTRAL AI WORKSPACE', desc: 'Holographic core — one prompt routed to the right engine', icon: 'sparkles', shortcut: '1', bg: '#131825', accent: '#8faeff', glyphBg: 'rgba(143,174,255,.15)' },
    { key: 'studio', path: '/forge', label: 'Forge', eyebrow: 'DOCUMENT PRODUCTION', desc: 'Real PPTX, PDF, DOCX, XLSX deliverables', icon: 'hammer', shortcut: '3', bg: '#1a141c', accent: '#ff3d71', glyphBg: 'rgba(255,61,113,.18)' },
    { key: 'verify', path: '/scout', label: 'Scout', eyebrow: 'RESEARCH & VERIFICATION', desc: 'Screened sources, claim verdicts, citations', icon: 'search', shortcut: '2', bg: '#1a2438', accent: '#60a5fa', glyphBg: 'rgba(96,165,250,.15)', bgImg: 'linear-gradient(180deg, rgba(96,165,250,.08) 0%, transparent 60%)' },
    { key: 'cadence', path: '/kronos', label: 'Kronos', eyebrow: 'CALENDAR & REMINDERS', desc: 'Month, week and day views · plain-English scheduling', icon: 'calendar', shortcut: '5', bg: '#e8eefc', accent: '#1a1a1a', glyphBg: '#fcd34d', dark: true, line: '#000' },
    { key: 'draft', path: '/quill', label: 'Quill', eyebrow: 'WRITING STUDIO', desc: 'Draft, convert, repair and refine any business text', icon: 'pen', shortcut: '4', bg: '#5b8def', accent: '#ffffff', glyphBg: '#ffffff', white: true },
    { key: 'shortcuts', path: '/dash', label: 'Dash', eyebrow: 'QUICK ACTIONS', desc: 'Searchable commands and custom shortcuts', icon: 'zap', shortcut: '7', bg: '#1e2433', accent: '#4ade80', glyphBg: 'rgba(74,222,128,.18)' },
    { key: 'whiteboard', path: '/whiteboard', label: 'Whiteboard', eyebrow: 'VISUAL THINKING', desc: 'Idea nodes, connections and local lenses', icon: 'nodes', shortcut: '6', bg: '#0d0f14', accent: '#a78bfa', glyphBg: 'rgba(167,139,250,.15)' },
    { key: 'board', path: '/working-board', label: 'Working Board', eyebrow: 'PROJECT EXECUTION', desc: 'Task canvas, links and Run → Kronos', icon: 'board', shortcut: '8', bg: '#151922', accent: '#f97316', glyphBg: 'rgba(249,115,22,.15)' },
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
    // Use Shell's canonical icon set for consistency with the rail
    return Shell.iconSvg(name);
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
    
    // Tool cards — vibrant colored tiles (image 3 style)
    const tcEl = el.querySelector('#tool-cards');
    tcEl.innerHTML = TOOL_CARDS.map(c => {
      const inkColor = c.white || c.dark ? (c.dark ? '#1a1a1a' : '#ffffff') : '#e8ecf8';
      const inkSoft = c.white || c.dark ? 'rgba(0,0,0,.6)' : 'rgba(232,236,248,.7)';
      const lineColor = c.white || c.dark ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.10)';
      const glyphStyle = `background:${c.glyphBg};color:${c.accent};`;
      const bgOverlay = c.bgImg || '';
      return `
      <button class="tool-card reveal-card" data-path="${c.path}" style="background:${c.bg};border-color:${lineColor};color:${inkColor};--tc-accent:${c.accent};--tc-ink-soft:${inkSoft};--tc-line:${lineColor}">
        <span class="card-sheen" style="background:${bgOverlay}"></span>
        <div class="tc-head">
          <span class="tc-icon" style="${glyphStyle}">${iconSVG(c.icon)}</span>
          <span class="tc-kbd" style="border-color:${lineColor};color:${inkSoft};background:rgba(0,0,0,.12)">⌘${c.shortcut}</span>
        </div>
        <div class="tc-body">
          <span class="tc-eyebrow">${c.eyebrow}</span>
          <h3 class="tc-name">${c.label}</h3>
          <p class="tc-desc">${c.desc}</p>
        </div>
        <div class="tc-foot">
          <span class="tc-enter">OPEN WORKSPACE <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>
        </div>
        <span class="tc-divider" style="background:${lineColor}"></span>
      </button>`;
    }).join('');
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
