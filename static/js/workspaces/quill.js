/**
 * Quill — Writing & drafting (cyan→blue gradient, white paper card)
 */
(function() {
  function mount() {
    const el = document.createElement('div');
    el.className = 'quill-panel scroll-area';
    el.innerHTML = `
      <div class="quill-gradient"></div>
      
      <div class="quill-hero">
        <div class="quill-paper glass-surface">
          <div class="quill-paper-head">
            <div class="quill-chips">
              <button class="quill-chip active" data-tool="write">
                <strong>Write</strong>
              </button>
              <button class="quill-chip" data-tool="improve">Improve</button>
              <button class="quill-chip" data-tool="formal">Formal</button>
              <button class="quill-chip" data-tool="casual">Casual</button>
              <button class="quill-chip" data-tool="concise">Concise</button>
              <button class="quill-chip" data-tool="expand">Expand</button>
              <button class="quill-chip" data-tool="summarize">Summarize</button>
              <button class="quill-chip" data-tool="bullets">Bullets</button>
              <button class="quill-chip" data-tool="headline">Headlines</button>
            </div>
          </div>
          <textarea id="quill-editor" class="quill-editor" placeholder="Start writing… Your words appear on this white paper card. Select a tool above to transform your text."></textarea>
          <div class="quill-paper-foot">
            <span class="small" id="quill-count">0 words</span>
            <div class="quill-actions">
              <button class="glass-btn" id="quill-new">New Draft</button>
              <button class="glass-btn" id="quill-save" style="background:#2563eb;color:#fff;border-color:transparent">Save</button>
              <button class="glass-btn" id="quill-send-forge" title="Send to Forge">→ Forge</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="quill-drafts-section">
        <h3 style="margin-bottom:var(--sp-4)">Saved Drafts</h3>
        <div class="quill-drafts-list" id="quill-drafts"></div>
      </div>
    `;
    setTimeout(() => populate(el), 0);
    return el;
  }
  
  function populate(el) {
    const editor = el.querySelector('#quill-editor');
    const countEl = el.querySelector('#quill-count');
    let currentTool = 'write';
    let currentDraftId = null;
    
    el.querySelectorAll('.quill-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        const tool = chip.dataset.tool;
        if (tool === 'write') {
          el.querySelectorAll('.quill-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          currentTool = 'write';
          editor.focus();
          return;
        }
        
        const text = editor.value.trim();
        if (!text) { Shell.toast('Enter some text first'); return; }
        
        chip.classList.add('loading');
        try {
          const result = await API.quillTransform(text, tool);
          const before = editor.value;
          editor.value = result.text;
          updateCount();
          Shell.toast(`Text ${tool}ed (${result.provider}${result.fallback ? ' local' : ''})`, {
            undo: () => { editor.value = before; updateCount(); }
          });
        } catch(err) {
          Shell.toast(err.message, { type: 'error' });
        }
        chip.classList.remove('loading');
      });
    });
    
    function updateCount() {
      const words = editor.value.trim().split(/\s+/).filter(Boolean).length;
      countEl.textContent = `${words} words · ${editor.value.length} chars`;
    }
    editor.addEventListener('input', updateCount);
    
    el.querySelector('#quill-save').addEventListener('click', async () => {
      const content = editor.value;
      if (!content.trim()) { Shell.toast('Nothing to save'); return; }
      const title = content.slice(0,60).replace(/\n/g,' ') || 'Untitled Draft';
      try {
        if (currentDraftId) {
          await API.updateDraft(currentDraftId, { title, content });
          Shell.toast('Draft updated');
        } else {
          const d = await API.createDraft(title, content);
          currentDraftId = d.id;
          Shell.toast('Draft saved');
        }
        loadDrafts(el);
      } catch(err) { Shell.toast(err.message, {type:'error'}); }
    });
    
    el.querySelector('#quill-new').addEventListener('click', () => {
      editor.value = ''; currentDraftId = null; updateCount();
      editor.focus();
    });
    
    el.querySelector('#quill-send-forge').addEventListener('click', () => {
      if (editor.value.trim()) {
        localStorage.setItem('forge.pending', editor.value.slice(0,200));
        Shell.navigate('/forge');
      } else {
        Shell.toast('Write something first');
      }
    });
    
    loadDrafts(el);
    updateCount();
  }
  
  async function loadDrafts(el) {
    const list = el.querySelector('#quill-drafts');
    try {
      const data = await API.drafts();
      if (!data.drafts || data.drafts.length === 0) {
        list.innerHTML = '<div class="small" style="opacity:.4">No saved drafts yet.</div>';
        return;
      }
      list.innerHTML = data.drafts.slice(0,10).map(d => `
        <div class="draft-card glass-card" data-id="${d.id}">
          <div class="draft-title">${d.title}</div>
          <div class="draft-preview small">${(d.content||'').slice(0,100)}${(d.content||'').length>100?'…':''}</div>
          <div class="draft-meta small">${new Date(d.updated_at*1000).toLocaleDateString()}</div>
          <button class="draft-del" data-id="${d.id}">✕</button>
        </div>
      `).join('');
      list.querySelectorAll('.draft-card').forEach(card => {
        card.addEventListener('click', async e => {
          if (e.target.classList.contains('draft-del')) return;
          const d = await API.getDraft(card.dataset.id);
          const editor = el.querySelector('#quill-editor');
          editor.value = d.content;
          editor.focus();
          el.querySelector('#quill-count').dispatchEvent(new Event('input'));
          currentDraftId = d.id;
          Shell.toast('Draft loaded');
        });
      });
      list.querySelectorAll('.draft-del').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          await API.deleteDraft(btn.dataset.id);
          loadDrafts(el);
          Shell.toast('Draft deleted', { undo: () => {} });
        });
      });
    } catch(e) {}
  }
  
  Workspace.register('draft', mount);
})();
