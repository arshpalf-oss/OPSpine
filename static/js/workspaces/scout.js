/**
 * Scout — Research & verification (sky/serif newsletter grammar)
 */
(function() {
  function mount() {
    const el = document.createElement('div');
    el.className = 'scout-panel scroll-area';
    el.innerHTML = `
      <div class="scout-hero">
        <div class="scout-floating-rock"></div>
        <h1 class="scout-wordmark"><em>Scout</em></h1>
        <p class="scout-hero-sub">Research · Verify · Cite</p>
        
        <div class="scout-input-wrap glass-surface">
          <input type="text" id="scout-query" class="scout-input" placeholder="Paste a claim or ask a question…" autocomplete="off">
          <div class="scout-mode-row">
            <div class="tabs">
              <button class="tab active" data-mode="quick">Quick</button>
              <button class="tab" data-mode="deep">Deep Research</button>
            </div>
            <button class="glass-btn scout-go" data-primary-action id="scout-go">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Scout
            </button>
          </div>
        </div>
      </div>
      
      <div class="scout-results" id="scout-results">
        <div class="scout-empty">
          <div class="empty-state">
            <div class="empty-icon">☁</div>
            <p>Enter a claim or question above. Scout will research, verify, and cite sources.</p>
            <div class="scout-examples">
              <button class="chip" data-example="Is climate change caused by human activity?">Try a climate question</button>
              <button class="chip" data-example="What is the current population of India?">Verify a fact</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="scout-history" id="scout-history" style="margin-top:var(--sp-8)"></div>
    `;
    setTimeout(() => populate(el), 0);
    return el;
  }
  
  function populate(el) {
    let currentMode = 'quick';
    
    el.querySelectorAll('[data-mode]').forEach(t => {
      t.addEventListener('click', () => {
        el.querySelectorAll('[data-mode]').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        currentMode = t.dataset.mode;
      });
    });
    
    const query = el.querySelector('#scout-query');
    const go = el.querySelector('#scout-go');
    const results = el.querySelector('#scout-results');
    
    async function doScout() {
      const text = query.value.trim();
      if (!text) return;
      
      Shell.showSpinner();
      results.innerHTML = '<div class="scout-loading"><div class="spinner spinner-lg"></div><p>Scout is researching…</p></div>';
      
      try {
        const brief = await API.createBrief(text, currentMode);
        renderBrief(brief, results);
        loadHistory(el);
      } catch (err) {
        results.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p><button class="glass-btn" onclick="this.closest('.scout-panel').querySelector('#scout-query').focus()">Try again</button></div>`;
      }
      Shell.hideSpinner();
    }
    
    go.addEventListener('click', doScout);
    query.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) doScout(); });
    
    el.querySelectorAll('[data-example]').forEach(b => {
      b.addEventListener('click', () => {
        query.value = b.dataset.example;
        doScout();
      });
    });
    
    loadHistory(el);
  }
  
  function renderBrief(brief, container) {
    const verdictColors = {
      verified: '#22c55e',
      partially_verified: '#f59e0b',
      disputed: '#ef4444',
      unverified: '#6b7280',
      false: '#ef4444',
    };
    const verdictLabels = {
      verified: 'Verified',
      partially_verified: 'Partially Verified',
      disputed: 'Disputed',
      unverified: 'Unverified',
      false: 'False',
    };
    const v = brief.verification || {};
    const vc = verdictColors[brief.verdict] || '#6b7280';
    const vl = verdictLabels[brief.verdict] || 'Unverified';
    
    container.innerHTML = `
      <div class="brief-result glass-surface">
        <div class="brief-header">
          <div class="brief-verdict" style="background:${vc}20;color:${vc};border-color:${vc}40">
            <span class="verdict-badge"></span>${vl}
            <span class="confidence" style="opacity:.6">${Math.round((brief.confidence||0.5)*100)}% confidence</span>
          </div>
          <span class="eyebrow">${brief.mode === 'deep' ? 'Deep Research' : 'Quick Look'} · ${new Date(brief.created_at*1000).toLocaleString()}</span>
        </div>
        <h2 class="brief-query">${brief.query}</h2>
        <div class="brief-summary">${(brief.summary||'').replace(/\n/g,'<br>')}</div>
        ${v.reasoning ? `<div class="brief-reasoning"><strong>Reasoning:</strong> ${v.reasoning}</div>` : ''}
        ${v.disclaimer ? `<div class="brief-disclaimer">${v.disclaimer}</div>` : ''}
        ${brief.search_results && brief.search_results.length ? `
          <div class="brief-sources">
            <h4>Sources found (${brief.search_results.length})</h4>
            ${brief.search_results.map(r => `
              <div class="source-item">
                <div class="source-title">${r.title || 'Source'}</div>
                <div class="source-snippet small">${(r.content||'').slice(0,200)}${(r.content||'').length>200?'…':''}</div>
                ${r.source ? `<span class="source-meta small">${r.source}</span>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }
  
  async function loadHistory(el) {
    const hist = el.querySelector('#scout-history');
    if (!hist) return;
    try {
      const data = await API.briefs();
      if (!data.briefs || data.briefs.length === 0) return;
      hist.innerHTML = `
        <h3 style="font-family:var(--serif);font-size:var(--fs-lg);margin-bottom:var(--sp-4)"><em>Previous Briefs</em></h3>
        <div class="scout-briefs-list">
          ${data.briefs.slice(0, 8).map(b => `
            <div class="brief-card glass-card" data-id="${b.id}">
              <div class="pill" style="background:${b.verdict==='verified'?'#22c55e20':b.verdict==='false'?'#ef444420':'#f59e0b20'};color:${b.verdict==='verified'?'#22c55e':b.verdict==='false'?'#ef4444':'#f59e0b'}">${b.verdict || 'unverified'}</div>
              <div class="brief-card-title">${b.title}</div>
              <div class="small" style="opacity:.4">${new Date(b.created_at*1000).toLocaleDateString()}</div>
            </div>
          `).join('')}
        </div>
      `;
      hist.querySelectorAll('.brief-card').forEach(card => {
        card.addEventListener('click', async () => {
          const brief = await API.getBrief(card.dataset.id);
          renderBrief(brief, el.querySelector('#scout-results'));
        });
      });
      Motion.initSheenTilt(hist.querySelectorAll('.glass-card'));
    } catch(e) {}
  }
  
  Workspace.register('verify', mount);
})();
