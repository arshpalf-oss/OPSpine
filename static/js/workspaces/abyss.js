/**
 * Abyss — Central AI router with holographic identity.
 */
(function() {
  function mount() {
    const el = document.createElement('div');
    el.className = 'abyss-panel scroll-area';
    el.innerHTML = `
      <div class="abyss-core">
        <div class="abyss-holo">
          <div class="holo-ring holo-ring-1"></div>
          <div class="holo-ring holo-ring-2"></div>
          <div class="holo-ring holo-ring-3"></div>
          <div class="holo-core">◈</div>
        </div>
        <h1 class="abyss-wordmark">ABYSS</h1>
        <p class="abyss-tag">Central AI router · One prompt, the right engine</p>
        
        <div class="abyss-prompt-wrap">
          <input type="text" id="abyss-input" class="abyss-input" placeholder="What do you need to do?" autocomplete="off">
          <button class="glass-btn abyss-send" data-primary-action id="abyss-send">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Route
          </button>
        </div>
        
        <div class="abyss-quick">
          <button class="chip" data-quick="Research the latest on quantum computing">Research something</button>
          <button class="chip" data-quick="Write a professional follow-up email">Write an email</button>
          <button class="chip" data-quick="Draft a project proposal outline">Create a proposal</button>
          <button class="chip" data-quick="Schedule a team meeting tomorrow afternoon">Schedule something</button>
        </div>
      </div>
      
      <div class="abyss-grid">
        <div class="abyss-card">
          <h3>Today's Runway</h3>
          <div class="runway-stats" id="abyss-stats"></div>
        </div>
        <div class="abyss-card">
          <h3>Quick Actions</h3>
          <div class="abyss-actions">
            <button class="abyss-action" data-path="/scout"><span>◈</span>Verify a claim</button>
            <button class="abyss-action" data-path="/forge"><span>◈</span>Generate a document</button>
            <button class="abyss-action" data-path="/quill"><span>◈</span>Start writing</button>
            <button class="abyss-action" data-path="/working-board"><span>◈</span>Plan a project</button>
          </div>
        </div>
        <div class="abyss-card">
          <h3>AI Status</h3>
          <div class="ai-status-list" id="abyss-ai-status"></div>
        </div>
        <div class="abyss-card abyss-convo-card">
          <h3>Recent</h3>
          <div id="abyss-recent" class="abyss-recent"></div>
        </div>
      </div>
    `;
    
    setTimeout(() => populate(el), 0);
    return el;
  }
  
  function populate(el) {
    const input = el.querySelector('#abyss-input');
    const send = el.querySelector('#abyss-send');
    
    function doRoute() {
      const text = input.value.trim();
      if (!text) return;
      Shell.showSpinner();
      API.aiRoute(text).then(result => {
        Shell.hideSpinner();
        const path = OPS.pathFromKey(result.route);
        if (path && path !== '/dashboard') {
          Shell.toast(result.message);
          setTimeout(() => Shell.navigate(path), 400);
        } else {
          // Handle in Abyss - just show a response
          API.aiComplete(text, { module: 'abyss' }).then(r => {
            Shell.toast(r.text.slice(0, 120) + (r.text.length > 120 ? '…' : ''), { duration: 6000 });
          });
        }
      }).catch(err => {
        Shell.hideSpinner();
        Shell.toast(err.message, { type: 'error' });
      });
    }
    
    send.addEventListener('click', doRoute);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doRoute(); });
    
    el.querySelectorAll('[data-quick]').forEach(b => {
      b.addEventListener('click', () => {
        input.value = b.dataset.quick;
        input.focus();
      });
    });
    
    el.querySelectorAll('[data-path]').forEach(b => {
      b.addEventListener('click', () => Shell.navigate(b.dataset.path));
    });
    
    // Stats
    API.dashboard().then(d => {
      const stats = el.querySelector('#abyss-stats');
      if (stats && d.stats) {
        stats.innerHTML = `
          <div class="runway-item"><span class="runway-num">${d.stats.briefs}</span><span>Briefs</span></div>
          <div class="runway-item"><span class="runway-num">${d.stats.documents}</span><span>Documents</span></div>
          <div class="runway-item"><span class="runway-num">${d.stats.pending_tasks}</span><span>Open tasks</span></div>
        `;
      }
    }).catch(() => {});
    
    // AI status
    API.aiStatus().then(s => {
      OPS.state.aiStatus = s;
      const el2 = el.querySelector('#abyss-ai-status');
      if (el2) {
        const providers = Object.entries(s.providers || {});
        el2.innerHTML = providers.map(([name, ok]) => `
          <div class="ai-status-row">
            <span class="ai-status-dot" style="background:${ok ? '#4ade80' : '#6b7280'}"></span>
            <span>${name.replace('_', ' ')}</span>
            <span class="small" style="margin-left:auto;opacity:.4">${ok ? 'Ready' : 'Not configured'}</span>
          </div>
        `).join('');
      }
    }).catch(() => {});
    
    // Recent
    API.activity(5).then(d => {
      const r = el.querySelector('#abyss-recent');
      if (r) {
        if (!d.activity || d.activity.length === 0) {
          r.innerHTML = '<p class="small" style="opacity:.4">No recent activity.</p>';
        } else {
          r.innerHTML = d.activity.slice(0, 5).map(a => `
            <div class="recent-row">
              <span>${a.action.replace('_',' ')}</span>
              <span class="small" style="opacity:.4">${new Date(a.created_at*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
            </div>
          `).join('');
        }
      }
    }).catch(() => {});
  }
  
  Workspace.register('home', mount);
})();
