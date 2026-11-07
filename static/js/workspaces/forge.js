/**
 * Forge — Document production (near-black, mono labels, neon pink dotgrid)
 */
(function() {
  const TYPES = [
    { id: 'pptx', label: 'PPTX', desc: 'Presentation' },
    { id: 'docx', label: 'DOCX', desc: 'Word document' },
    { id: 'xlsx', label: 'XLSX', desc: 'Spreadsheet' },
    { id: 'pdf', label: 'PDF', desc: 'PDF document' },
    { id: 'md', label: 'MD', desc: 'Markdown' },
    { id: 'png', label: 'PNG', desc: 'Image' },
  ];
  
  function mount() {
    const el = document.createElement('div');
    el.className = 'forge-panel scroll-area';
    el.innerHTML = `
      <div class="forge-dotgrid dot-grid"></div>
      
      <div class="forge-header">
        <div class="workspace-title">
          <span class="eyebrow" style="color:#ff3d71">● FORGE · DOCUMENT PRODUCTION</span>
          <h1 style="font-family:var(--mono);text-transform:uppercase;letter-spacing:-0.02em">Forge</h1>
        </div>
      </div>
      
      <div class="forge-workspace">
        <div class="forge-left">
          <div class="forge-section">
            <label class="forge-label">DOCUMENT TYPE</label>
            <div class="forge-chips" id="forge-type-chips"></div>
          </div>
          <div class="forge-section">
            <label class="forge-label">PROJECT TITLE</label>
            <input type="text" id="forge-prompt" class="forge-input" placeholder="Describe what you want to create…" value="A 15-slide investor presentation for a SaaS startup">
          </div>
          <div class="forge-section">
            <label class="forge-label">CONTENT</label>
            <textarea id="forge-desc" class="forge-input forge-textarea" placeholder="Additional details about content, tone, audience…"></textarea>
          </div>
          <div class="forge-section">
            <button class="forge-run" data-primary-action id="forge-run">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              GENERATE
            </button>
          </div>
          <div class="forge-section" id="forge-status" style="display:none"></div>
        </div>
        
        <div class="forge-right">
          <div class="forge-preview-label">PREVIEW</div>
          <div class="forge-preview" id="forge-preview">
            <div class="forge-empty-preview">
              <div class="forge-empty-icon">⚙</div>
              <div class="forge-empty-text">Configure and generate to preview</div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="forge-history">
        <div class="forge-section" style="margin-top:var(--sp-8)">
          <label class="forge-label">RECENT PROJECTS</label>
          <div class="forge-recent-list" id="forge-recent"></div>
        </div>
      </div>
    `;
    setTimeout(() => populate(el), 0);
    return el;
  }
  
  function populate(el) {
    let selectedType = 'pptx';
    const chipsEl = el.querySelector('#forge-type-chips');
    chipsEl.innerHTML = TYPES.map(t => `
      <button class="forge-chip ${t.id === selectedType ? 'active' : ''}" data-type="${t.id}">
        <span class="chip-type">${t.label}</span>
        <span class="chip-desc small">${t.desc}</span>
      </button>
    `).join('');
    chipsEl.querySelectorAll('.forge-chip').forEach(c => {
      c.addEventListener('click', () => {
        chipsEl.querySelectorAll('.forge-chip').forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        selectedType = c.dataset.type;
      });
    });
    
    const runBtn = el.querySelector('#forge-run');
    const promptEl = el.querySelector('#forge-prompt');
    const descEl = el.querySelector('#forge-desc');
    const previewEl = el.querySelector('#forge-preview');
    const statusEl = el.querySelector('#forge-status');
    
    async function doGenerate() {
      const prompt = promptEl.value.trim();
      if (!prompt) return;
      runBtn.disabled = true;
      runBtn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-color:rgba(255,61,113,.3);border-top-color:#ff3d71"></div> GENERATING…';
      statusEl.style.display = 'block';
      statusEl.innerHTML = '<div class="forge-status-line">● Engine warm-up…</div>';
      
      const fullPrompt = prompt + (descEl.value ? '\n\n' + descEl.value : '');
      
      try {
        statusEl.innerHTML += '<div class="forge-status-line">● Content generation…</div>';
        await new Promise(r => setTimeout(r, 400));
        statusEl.innerHTML += '<div class="forge-status-line">● File rendering…</div>';
        
        const result = await API.forgeGenerate(selectedType, fullPrompt);
        
        statusEl.innerHTML += '<div class="forge-status-line" style="color:#4ade80">✓ Complete: ' + result.filename + ' (' + (result.size/1024).toFixed(1) + ' KB)</div>';
        
        previewEl.innerHTML = `
          <div class="forge-preview-doc">
            <div class="preview-thumb">${fileIcon(selectedType)}</div>
            <div class="preview-info">
              <div class="preview-name">${result.filename}</div>
              <div class="preview-meta small">${result.type.toUpperCase()} · ${(result.size/1024).toFixed(1)} KB</div>
              <a href="${API.documentUrl(result.filename)}" class="glass-btn" style="margin-top:var(--sp-3);background:#ff3d71;color:#fff;border-color:transparent" download>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </a>
            </div>
          </div>
        `;
        loadRecent(el);
        Shell.toast(`${result.type.toUpperCase()} generated: ${result.filename}`, { type: 'success' });
      } catch(err) {
        statusEl.innerHTML += `<div class="forge-status-line" style="color:#ef4444">✗ Error: ${err.message}</div>`;
        Shell.toast(err.message, { type: 'error' });
      }
      
      runBtn.disabled = false;
      runBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> GENERATE';
    }
    
    runBtn.addEventListener('click', doGenerate);
    
    loadRecent(el);
  }
  
  function fileIcon(type) {
    const icons = { pptx: '📊', docx: '📝', xlsx: '📈', pdf: '📄', md: '📋', png: '🖼' };
    return `<div class="file-icon-big">${icons[type] || '📄'}</div>`;
  }
  
  async function loadRecent(el) {
    const list = el.querySelector('#forge-recent');
    if (!list) return;
    try {
      const data = await API.documents();
      if (!data.documents || data.documents.length === 0) {
        list.innerHTML = '<div class="small" style="opacity:.4;padding:var(--sp-4)">No documents yet.</div>';
        return;
      }
      list.innerHTML = data.documents.slice(0, 12).map(d => `
        <div class="forge-recent-item glass-card" data-id="${d.id}" data-filename="${d.filename}">
          <div class="fr-type">${d.type.toUpperCase()}</div>
          <div class="fr-name">${d.title.slice(0, 50)}</div>
          <div class="fr-meta small">${(d.size/1024).toFixed(1)} KB · ${new Date(d.created_at*1000).toLocaleDateString()}</div>
          <a href="${API.documentUrl(d.filename)}" class="fr-download" download title="Download">↓</a>
        </div>
      `).join('');
      list.querySelectorAll('.fr-download').forEach(a => {
        a.addEventListener('click', e => e.stopPropagation());
      });
    } catch(e) {}
  }
  
  Workspace.register('studio', mount);
})();
