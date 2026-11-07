/**
 * Scout — Research & verification. Sky-glass newsletter capsule aesthetic.
 */
(function() {
  function mount() {
    const el = document.createElement('div');
    el.className = 'scout-panel scroll-area';
    el.innerHTML = `
      <!-- Decorative asteroids -->
      <div class="scout-asteroid" style="width:90px;height:110px;top:6%;left:4%;transform:rotate(-20deg)"></div>
      <div class="scout-asteroid" style="width:60px;height:72px;top:12%;left:22%;transform:rotate(35deg);opacity:.9"></div>
      <div class="scout-asteroid" style="width:140px;height:180px;top:-3%;right:2%;transform:rotate(15deg)"></div>
      <div class="scout-asteroid" style="width:70px;height:85px;top:25%;right:12%;transform:rotate(-10deg);opacity:.85"></div>
      <div class="scout-asteroid" style="width:50px;height:60px;bottom:22%;right:5%;transform:rotate(22deg);opacity:.8"></div>
      <div class="scout-asteroid" style="width:80px;height:100px;bottom:12%;left:3%;transform:rotate(-30deg);opacity:.85"></div>
      <div class="scout-asteroid" style="width:40px;height:48px;top:40%;right:30%;transform:rotate(10deg);opacity:.7"></div>
      <div class="scout-asteroid" style="width:35px;height:42px;top:55%;left:10%;transform:rotate(-18deg);opacity:.6;animation:scout-drift 30s ease-in-out infinite alternate"></div>

      <div class="scout-hero">
        <div class="scout-wordmark">Scout<sup>®</sup></div>
        <div class="scout-capsule">
          <svg class="capsule-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="scout-query" placeholder="Paste a claim or enter a question to verify…" autocomplete="off">
          <button class="capsule-send" id="scout-go" aria-label="Search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
        <p class="scout-tagline">Verify claims. Find sources. Read the evidence. Scout screens the web, surfaces citations, and renders an honest verdict — so you don't have to guess.</p>
        <div class="scout-mode-row" style="margin-top:24px">
          <button class="scout-chip active" data-mode="quick">Quick Look</button>
          <button class="scout-chip" data-mode="deep">Deep Research</button>
          <button class="scout-chip" data-mode="verify">Fact Check</button>
        </div>
      </div>

      <div class="scout-results" id="scout-results">
        <div style="text-align:center;padding:20px 0">
          <button class="scout-cta" id="scout-manifesto">How Scout works</button>
        </div>
        <div class="scout-examples">
          <button class="scout-ex" data-example="Is climate change primarily caused by human activity?">Climate claim</button>
          <button class="scout-ex" data-example="Does vitamin C prevent the common cold?">Health claim</button>
          <button class="scout-ex" data-example="What is the current population of India?">Verify a fact</button>
        </div>
      </div>
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
      results.innerHTML = '<div style="text-align:center;padding:40px 0;color:rgba(255,255,255,.9)"><div class="spinner" style="border-top-color:#fff;margin:0 auto 16px"></div>Scout is researching…</div>';
      try {
        const brief = await API.createBrief(text, currentMode);
        renderBrief(brief, results);
      } catch(err) {
        results.innerHTML = `<div style="text-align:center;padding:30px;color:#fff"><p style="margin-bottom:16px">Error: ${err.message}</p><button class="scout-cta" onclick="this.closest('.scout-panel').querySelector('#scout-query').focus()">Try again</button></div>`;
      }
      Shell.hideSpinner();
    }

    go.addEventListener('click', doScout);
    query.addEventListener('keydown', e => { if (e.key === 'Enter') doScout(); });

    el.querySelectorAll('[data-example]').forEach(b => {
      b.addEventListener('click', () => { query.value = b.dataset.example; doScout(); });
    });
  }

  function renderBrief(brief, container) {
    const verdictColors = {
      verified: '#22c55e', partially_verified: '#fbbf24',
      disputed: '#f97316', unverified: '#94a3b8', false_misleading: '#ef4444',
    };
    const verdictLabels = {
      verified: 'Verified', partially_verified: 'Partially Verified',
      disputed: 'Disputed', unverified: 'Unverified', false_misleading: 'False',
    };
    const vKey = brief.verdict || 'unverified';
    const vc = verdictColors[vKey] || '#94a3b8';
    const vl = verdictLabels[vKey] || 'Unverified';

    container.innerHTML = `
      <div class="scout-brief">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap">
          <span style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:${vc}22;color:${vc};border:1.5px solid ${vc}55;font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase">
            <span style="width:7px;height:7px;border-radius:50%;background:${vc};display:inline-block"></span>${vl}
          </span>
          <span style="font-size:12px;color:#666">${Math.round((brief.confidence||0.5)*100)}% confidence · ${new Date(brief.created_at*1000).toLocaleString()}</span>
        </div>
        <h3>${brief.query}</h3>
        <p>${(brief.summary||'').replace(/\n/g,'<br><br>')}</p>
        ${brief.search_results && brief.search_results.length ? `
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(0,0,0,.1)">
            <h4 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#666;margin-bottom:10px">Sources (${brief.search_results.length})</h4>
            ${brief.search_results.map(r => `
              <div style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:13px">
                <div style="font-weight:600;margin-bottom:4px">${r.title || 'Source'}</div>
                <div style="color:#555;line-height:1.5">${(r.content||'').slice(0,220)}${(r.content||'').length>220?'…':''}</div>
                ${r.source ? `<div style="color:#888;font-size:11px;margin-top:4px">${r.source}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  // Inject drift keyframes
  if (!document.getElementById('scout-keyframes')) {
    const s = document.createElement('style');
    s.id = 'scout-keyframes';
    s.textContent = `
      @keyframes scout-drift {
        0% { transform: translate(0,0) rotate(-18deg); }
        100% { transform: translate(8px,-6px) rotate(-12deg); }
      }
    `;
    document.head.appendChild(s);
  }

  Workspace.register('verify', mount);
})();
