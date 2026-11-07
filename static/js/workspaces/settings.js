/**
 * Settings
 */
(function() {
  function mount() {
    const el = document.createElement('div');
    el.className = 'settings-panel scroll-area';
    el.innerHTML = `
      <div class="workspace-header">
        <div class="workspace-title">
          <span class="eyebrow">⚙ SETTINGS</span>
          <h1>Settings</h1>
        </div>
      </div>
      
      <div class="settings-grid" id="settings-grid">
        <div class="settings-card glass-card">
          <h3>Identity</h3>
          <div class="setting-row">
            <label>Your name</label>
            <input type="text" id="set-name" class="input-field" placeholder="Operator">
          </div>
          <div class="setting-row">
            <label>Timezone</label>
            <select id="set-tz" class="input-field"></select>
          </div>
        </div>
        
        <div class="settings-card glass-card">
          <h3>Motion & Material</h3>
          <div class="setting-row">
            <label>Motion preset</label>
            <div class="motion-presets" id="set-motion"></div>
          </div>
          <div class="setting-row">
            <label>Navigation</label>
            <select id="set-nav" class="input-field">
              <option value="expanded">Expanded</option>
              <option value="collapsed">Collapsed</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
        </div>
        
        <div class="settings-card glass-card">
          <h3>AI Providers</h3>
          <p class="small" style="opacity:.5;margin-bottom:var(--sp-3)">OPSpine runs fully locally with deterministic engines. Add API keys to enable cloud AI providers.</p>
          <div class="setting-row">
            <label><input type="checkbox" id="set-local-only"> Local-only mode (disable all external calls)</label>
          </div>
          <div class="setting-row"><label>Gemini API key</label><input type="password" id="set-gemini" class="input-field" placeholder="AIza..."></div>
          <div class="setting-row"><label>Groq API key</label><input type="password" id="set-groq" class="input-field" placeholder="gsk_..."></div>
          <div class="setting-row"><label>OpenRouter API key</label><input type="password" id="set-openrouter" class="input-field" placeholder="sk-or-..."></div>
          <div class="setting-row"><label>Brave Search key</label><input type="password" id="set-brave" class="input-field"></div>
          <div class="setting-row"><label>Tavily key</label><input type="password" id="set-tavily" class="input-field"></div>
          <div class="setting-row"><label>Exa key</label><input type="password" id="set-exa" class="input-field"></div>
          <div id="ai-provider-status" style="margin-top:var(--sp-3)"></div>
        </div>
        
        <div class="settings-card glass-card">
          <h3>Data</h3>
          <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap">
            <button class="glass-btn" id="set-backup">⬇ Download Backup</button>
            <label class="glass-btn" style="cursor:pointer">⬆ Restore<input type="file" id="set-restore" accept=".json" hidden></label>
            <button class="glass-btn" id="set-clear" style="background:rgba(239,68,68,.2);color:#ef4444;border-color:transparent">Clear Sample Data</button>
          </div>
          <p class="small" style="opacity:.4;margin-top:var(--sp-3)">Backups include all your briefs, documents, drafts, events, tasks, boards, and settings. Data is stored locally only.</p>
        </div>
        
        <div class="settings-card glass-card">
          <h3>About</h3>
          <p style="font-size:var(--fs-sm);line-height:1.6;opacity:.8">OPSpine v1.0 — Local-first operating spine for knowledge work.<br>Eight specialist rooms. One AI core. Zero cloud dependency.<br><br>All data is stored in <code>data/opspine.db</code>. No telemetry, no accounts.</p>
        </div>
      </div>
      
      <div style="position:sticky;bottom:var(--sp-4);display:flex;justify-content:flex-end;margin-top:var(--sp-8)">
        <button class="glass-btn" id="set-save" style="background:var(--ws-accent);color:#fff;border-color:transparent;padding:12px 24px;font-weight:600">Save Settings</button>
      </div>
    `;
    setTimeout(() => populate(el), 0);
    return el;
  }
  
  function populate(el) {
    // Timezones
    const tzSel = el.querySelector('#set-tz');
    const tzs = ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'];
    tzSel.innerHTML = tzs.map(t => `<option value="${t}">${t}</option>`).join('');
    
    // Motion presets
    const mp = el.querySelector('#set-motion');
    mp.innerHTML = ['liquid','calm','cinematic','still'].map(p => `
      <button class="motion-preset ${p===OPS.state.motionPreset?'active':''}" data-p="${p}">${p.charAt(0).toUpperCase()+p.slice(1)}</button>
    `).join('');
    mp.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
      mp.querySelectorAll('[data-p]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    }));
    
    // Load settings
    API.getSettings().then(s => {
      el.querySelector('#set-name').value = s.user_name || '';
      el.querySelector('#set-tz').value = s.timezone || 'UTC';
      el.querySelector('#set-local-only').checked = s.local_only === true || s.local_only === 'true';
      el.querySelector('#set-nav').value = OPS.state.navMode;
      el.querySelector('#set-gemini').value = '';
      el.querySelector('#set-groq').value = '';
      el.querySelector('#set-openrouter').value = '';
      el.querySelector('#set-brave').value = '';
      el.querySelector('#set-tavily').value = '';
      el.querySelector('#set-exa').value = '';
      
      // Provider status
      const prov = s._provider_status || {};
      el.querySelector('#ai-provider-status').innerHTML = Object.entries(prov).map(([k,v]) => 
        `<div class="small" style="display:flex;align-items:center;gap:var(--sp-2);padding:2px 0">
          <span style="width:6px;height:6px;border-radius:50%;background:${v?'#4ade80':'#6b7280'}"></span>
          ${k.replace(/_/g,' ')}: ${v?'Configured':'Not configured'}
        </div>`).join('');
    });
    
    el.querySelector('#set-save').addEventListener('click', async () => {
      const data = {
        user_name: el.querySelector('#set-name').value,
        timezone: el.querySelector('#set-tz').value,
        local_only: el.querySelector('#set-local-only').checked ? 'true' : 'false',
      };
      const gemini = el.querySelector('#set-gemini').value;
      const groq = el.querySelector('#set-groq').value;
      const openrouter = el.querySelector('#set-openrouter').value;
      const brave = el.querySelector('#set-brave').value;
      const tavily = el.querySelector('#set-tavily').value;
      const exaKey = el.querySelector('#set-exa').value;
      if (gemini) data.ai_gemini_key = gemini;
      if (groq) data.ai_groq_key = groq;
      if (openrouter) data.ai_openrouter_key = openrouter;
      if (brave) data.ai_brave_key = brave;
      if (tavily) data.ai_tavily_key = tavily;
      if (exaKey) data.ai_exa_key = exaKey;
      
      await API.saveSettings(data);
      OPS.setNavMode(el.querySelector('#set-nav').value);
      
      const activeMotion = el.querySelector('.motion-preset.active');
      if (activeMotion) OPS.setMotionPreset(activeMotion.dataset.p);
      
      Shell.toast('Settings saved');
      API.aiStatus().then(s => { OPS.state.aiStatus = s; });
    });
    
    el.querySelector('#set-backup').addEventListener('click', async () => {
      const data = await API.backup();
      const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `opspine-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click(); URL.revokeObjectURL(url);
      Shell.toast('Backup downloaded');
    });
    
    el.querySelector('#set-restore').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        await API.restore(data);
        Shell.toast('Data restored. Refreshing…', {type:'success'});
        setTimeout(() => location.reload(), 1500);
      } catch(err) { Shell.toast('Invalid backup file', {type:'error'}); }
    });
    
    el.querySelector('#set-clear').addEventListener('click', async () => {
      if (!confirm('Clear all sample data and activity? Settings will be preserved.')) return;
      await API.clearSamples();
      Shell.toast('Data cleared');
      setTimeout(() => location.reload(), 800);
    });
  }
  
  Workspace.register('settings', mount);
})();
