/**
 * Library — Files & documents
 */
(function() {
  function mount() {
    const el = document.createElement('div');
    el.className = 'library-panel scroll-area';
    el.innerHTML = `
      <div class="workspace-header">
        <div class="workspace-title">
          <span class="eyebrow">◈ LIBRARY</span>
          <h1>Files & Library</h1>
        </div>
      </div>
      <div class="lib-tabs tabs">
        <button class="tab active" data-tab="documents">Documents</button>
        <button class="tab" data-tab="briefs">Briefs</button>
        <button class="tab" data-tab="drafts">Drafts</button>
        <button class="tab" data-tab="knowledge">Knowledge</button>
      </div>
      <div id="lib-content"></div>
    `;
    setTimeout(() => populate(el), 0);
    return el;
  }
  
  function populate(el) {
    function show(tab) {
      el.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      const content = el.querySelector('#lib-content');
      content.innerHTML = '<div class="skeleton" style="height:40px;margin:8px 0"></div><div class="skeleton" style="height:40px;margin:8px 0"></div>';
      
      if (tab === 'documents') {
        API.documents().then(d => {
          if (!d.documents || d.documents.length === 0) {
            content.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><p>No documents yet. Create files in Forge.</p></div>';
            return;
          }
          content.innerHTML = `<div class="lib-grid">${d.documents.map(doc => `
            <div class="lib-card glass-card" data-id="${doc.id}">
              <div class="lib-icon">${iconFor(doc.type)}</div>
              <div class="lib-name">${doc.title.slice(0,60)}</div>
              <div class="lib-meta small">${doc.type.toUpperCase()} · ${(doc.size/1024).toFixed(1)} KB · ${new Date(doc.created_at*1000).toLocaleDateString()}</div>
              <div class="lib-actions">
                <a href="${API.documentUrl(doc.filename)}" class="glass-btn" download style="font-size:var(--fs-xs);padding:5px 12px">Download</a>
              </div>
            </div>
          `).join('')}</div>`;
        });
      } else if (tab === 'briefs') {
        API.briefs().then(d => {
          if (!d.briefs || d.briefs.length === 0) {
            content.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>No briefs yet. Research claims in Scout.</p></div>';
            return;
          }
          content.innerHTML = `<div class="lib-list">${d.briefs.map(b => `
            <div class="lib-row glass-card">
              <span class="pill" style="background:${vColor(b.verdict)}20;color:${vColor(b.verdict)}">${b.verdict}</span>
              <div class="lib-row-title">${b.title}</div>
              <span class="small" style="opacity:.4">${new Date(b.created_at*1000).toLocaleDateString()}</span>
            </div>
          `).join('')}</div>`;
        });
      } else if (tab === 'drafts') {
        API.drafts().then(d => {
          if (!d.drafts || d.drafts.length === 0) {
            content.innerHTML = '<div class="empty-state"><div class="empty-icon">✎</div><p>No drafts yet. Write in Quill.</p></div>';
            return;
          }
          content.innerHTML = `<div class="lib-list">${d.drafts.map(dr => `
            <div class="lib-row glass-card">
              <div class="lib-row-title">${dr.title}</div>
              <div class="lib-preview small">${(dr.content||'').slice(0,100)}…</div>
              <span class="small" style="opacity:.4">${new Date(dr.updated_at*1000).toLocaleDateString()}</span>
            </div>
          `).join('')}</div>`;
        });
      } else if (tab === 'knowledge') {
        API.knowledge().then(d => {
          content.innerHTML = `<div class="lib-list">${d.knowledge.map(k => `
            <div class="lib-row glass-card">
              <div class="lib-row-title">${k.title}</div>
              <div class="lib-preview small">${k.content.slice(0,150)}</div>
            </div>
          `).join('')}</div>`;
        });
      }
    }
    
    el.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.tab)));
    show('documents');
  }
  
  function iconFor(type) {
    return { pptx:'📊', docx:'📝', xlsx:'📈', pdf:'📄', md:'📋', png:'🖼', image:'🖼', presentation:'📊', document:'📝', spreadsheet:'📈', markdown:'📋' }[type] || '📄';
  }
  function vColor(v) { return { verified:'#22c55e', false:'#ef4444', disputed:'#f59e0b', partially_verified:'#f59e0b', unverified:'#6b7280' }[v] || '#6b7280'; }
  
  Workspace.register('vault', mount);
})();
