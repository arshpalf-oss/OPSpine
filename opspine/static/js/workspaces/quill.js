/* ==========================================================================
   Quill — drafts with autosave, word counts, and offline text tools.
   ========================================================================== */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;
  const boot = window.OPS.shell.state.boot;

  const root = document.querySelector('[data-quill]');
  if (!root) return;

  const dom = {
    list: document.getElementById('quill-list'),
    search: document.getElementById('quill-search'),
    newBtn: document.getElementById('quill-new'),
    start: document.getElementById('quill-start'),
    title: document.getElementById('quill-title'),
    editor: document.getElementById('quill-editor'),
    empty: document.getElementById('quill-empty'),
    saveState: document.getElementById('quill-save-state'),
    stats: document.getElementById('quill-stats'),
    save: document.getElementById('quill-save'),
    del: document.getElementById('quill-delete'),
    ai: document.getElementById('quill-ai'),
    prov: document.getElementById('quill-prov'),
    toolout: document.getElementById('quill-toolout'),
    tooloutLabel: document.getElementById('quill-toolout-label'),
    tooloutBody: document.getElementById('quill-toolout-body'),
    copy: document.getElementById('quill-copy'),
    closeOut: document.getElementById('quill-close-out'),
    insert: document.getElementById('quill-insert'),
    append: document.getElementById('quill-append'),
    count: document.getElementById('quill-count'),
    exportTxt: document.getElementById('quill-export-txt'),
    exportMd: document.getElementById('quill-export-md'),
  };

  const state = {
    drafts: [],
    current: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
    timer: null,
    lastResult: '',
    resultKind: 'text',
    providers: boot.providers,
  };

  /* ------------------------------------------------------------------ */
  /* Counts                                                             */
  /* ------------------------------------------------------------------ */
  function countWords(text) {
    const matches = String(text || '').match(/[A-Za-z0-9'’-]+/g);
    return matches ? matches.length : 0;
  }

  function updateStats() {
    const text = dom.editor.value;
    const words = countWords(text);
    const reading = Math.max(0, Math.round((words / 200) * 10) / 10);
    dom.stats.textContent = `${words} word${words === 1 ? '' : 's'} · ${text.length} character${text.length === 1 ? '' : 's'}` +
      (words ? ` · ~${reading} min read` : '');
  }

  function setSaveState(text, cls) {
    dom.saveState.textContent = text;
    dom.saveState.className = `save-state${cls ? ` ${cls}` : ''}`;
  }

  /* ------------------------------------------------------------------ */
  /* Draft list                                                         */
  /* ------------------------------------------------------------------ */
  async function loadDrafts(query = '') {
    try {
      const data = await api.get(
        `/api/quill/drafts${query ? `?q=${encodeURIComponent(query)}` : ''}`
      );
      state.drafts = data.drafts;
      renderDrafts();
    } catch (err) {
      U.clear(dom.list);
      dom.list.appendChild(U.el('li', { class: 'drafts__empty', text: err.message }));
    }
  }

  function renderDrafts() {
    const query = dom.search.value.trim();
    if (dom.count) {
      dom.count.textContent = state.drafts.length
        ? (query
          ? `${state.drafts.length} match${state.drafts.length === 1 ? '' : 'es'} for “${query}”`
          : `${state.drafts.length} draft${state.drafts.length === 1 ? '' : 's'}`)
        : (query ? `No matches for “${query}”` : '');
    }
    U.clear(dom.list);
    if (!state.drafts.length) {
      dom.list.appendChild(
        U.el('li', {
          class: 'drafts__empty',
          text: dom.search.value
            ? 'No drafts match that search.'
            : 'No drafts yet. Create one to begin writing.',
        })
      );
      return;
    }
    state.drafts.forEach((draft) => {
      const active = state.current && state.current.id === draft.id;
      dom.list.appendChild(
        U.el('li', { class: `draft${active ? ' is-active' : ''}` }, [
          U.el('button', {
            class: 'draft__open',
            type: 'button',
            onClick: () => openDraft(draft.id),
          }, [
            U.el('span', { class: 'draft__title', text: draft.title || 'Untitled draft' }),
            U.el('span', {
              class: 'draft__meta',
              text: `${draft.words} word${draft.words === 1 ? '' : 's'} · ${U.relativeTime(draft.updated_at)}`,
            }),
          ]),
          U.el('button', {
            class: 'draft__del',
            type: 'button',
            'aria-label': `Delete ${draft.title || 'draft'}`,
            title: 'Delete draft',
            html: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"/></svg>',
            onClick: (event) => {
              event.stopPropagation();
              deleteDraft(draft);
            },
          }),
        ])
      );
    });
  }

  /* ------------------------------------------------------------------ */
  /* Opening and saving                                                 */
  /* ------------------------------------------------------------------ */
  async function openDraft(id) {
    if (state.dirty) {
      const ok = await U.confirm({
        title: 'Unsaved changes',
        message: 'This draft has changes that have not been saved yet. Open another draft and lose them?',
        confirmLabel: 'Discard changes',
      });
      if (!ok) return;
    }

    try {
      const data = await api.get(`/api/quill/drafts/${id}`);
      state.current = data.draft;
      state.dirty = false;
      state.timer && clearTimeout(state.timer);

      dom.title.value = data.draft.title || '';
      dom.editor.value = data.draft.content || '';
      dom.title.disabled = false;
      dom.editor.disabled = false;
      dom.editor.hidden = false;
      dom.empty.hidden = true;
      dom.save.disabled = false;
      dom.del.disabled = false;

      setSaveState(`Saved ${U.relativeTime(data.draft.updated_at)}`, 'is-saved');
      updateStats();
      syncExportButtons();
      renderDrafts();
      dom.editor.focus();
    } catch (err) {
      U.error(err.message);
    }
  }

  async function saveDraft(options = {}) {
    if (!state.current || state.saving) return;
    if (!state.dirty && !options.force) return;

    state.saving = true;
    dom.save.disabled = true;
    setSaveState('Saving…', '');

    try {
      const data = await api.put(`/api/quill/drafts/${state.current.id}`, {
        title: dom.title.value.trim() || 'Untitled draft',
        content: dom.editor.value,
      });
      state.current = data.draft;
      state.dirty = false;
      state.lastSavedAt = Date.now();
      setSaveState('Saved just now', 'is-saved');
      await loadDrafts(dom.search.value);
    } catch (err) {
      setSaveState(`Not saved — ${err.message}`, 'is-error');
      U.error(err.message);
    } finally {
      state.saving = false;
      dom.save.disabled = false;
    }
  }

  function markDirty() {
    state.dirty = true;
    setSaveState('Unsaved changes', 'is-dirty');
    updateStats();
    clearTimeout(state.timer);
    state.timer = setTimeout(() => saveDraft(), 900);
  }

  function clearEditor() {
    state.current = null;
    state.dirty = false;
    dom.title.value = '';
    dom.editor.value = '';
    dom.title.disabled = true;
    dom.editor.disabled = true;
    dom.editor.hidden = true;
    dom.empty.hidden = false;
    dom.save.disabled = true;
    dom.del.disabled = true;
    setSaveState('No draft open', '');
    updateStats();
    syncExportButtons();
    renderDrafts();
  }

  async function createDraft() {
    if (state.dirty) await saveDraft({ force: true });
    try {
      const data = await api.post('/api/quill/drafts', { title: 'Untitled draft' });
      await loadDrafts();
      await openDraft(data.draft.id);
      /* openDraft focuses the body; a brand-new draft wants its title. */
      dom.title.focus();
      dom.title.select();
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    }
  }

  async function deleteDraft(draft) {
    const unsaved = state.dirty && state.current && state.current.id === draft.id;
    const ok = await U.confirm({
      title: 'Delete draft?',
      message: `“${draft.title || 'Untitled draft'}” will be permanently removed from this machine.`
        + (unsaved ? ' The unsaved changes in the editor will be lost too.' : ''),
      confirmLabel: 'Delete draft',
    });
    if (!ok) return;

    try {
      await api.del(`/api/quill/drafts/${draft.id}`);
      if (state.current && state.current.id === draft.id) clearEditor();
      await loadDrafts(dom.search.value);
      U.success('Draft deleted.');
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Export                                                             */
  /* ------------------------------------------------------------------ */
  function safeName(title) {
    const base = (title || 'untitled').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return base || 'untitled';
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = U.el('a', { href: url, download: name });
    document.body.appendChild(link);
    link.click();
    link.remove();
    /* Revoke on a later tick so the download has already started. */
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    U.success(`${name} downloaded.`);
  }

  function exportDraft(format) {
    if (!state.current) return;
    const title = dom.title.value.trim() || 'Untitled draft';
    const body = dom.editor.value.trim();
    if (format === 'md') {
      download(`${safeName(title)}.md`, `# ${title}\n\n${body}\n`, 'text/markdown;charset=utf-8');
    } else {
      download(`${safeName(title)}.txt`,
        `${title}\n${'='.repeat(title.length)}\n\n${body}\n`,
        'text/plain;charset=utf-8');
    }
  }

  function syncExportButtons() {
    const open = Boolean(state.current);
    dom.exportTxt.disabled = !open;
    dom.exportMd.disabled = !open;
  }

  /* ------------------------------------------------------------------ */
  /* Offline tools                                                      */
  /* ------------------------------------------------------------------ */
  function showResult(label, body, kind) {
    dom.toolout.hidden = false;
    dom.tooloutLabel.textContent = label;
    dom.tooloutBody.textContent = body;
    state.lastResult = body;
    state.resultKind = kind;
    const canReplace = kind === 'text';
    dom.insert.disabled = !canReplace;
    dom.append.disabled = !canReplace;
  }

  async function runTool(tool, label) {
    const text = dom.editor.value;
    if (!text.trim()) {
      U.error('Write something in the editor first.');
      dom.editor.focus();
      return;
    }
    try {
      const data = await api.post('/api/abyss/tools/run', { tool, text });
      const result = data.result;
      if (result.kind === 'stats') {
        const lines = Object.entries(result.result)
          .map(([key, value]) => `${key.replace(/_/g, ' ').padEnd(22, ' ')} ${value}`)
          .join('\n');
        showResult(`Local tool · ${label}`, lines, 'stats');
      } else if (result.kind === 'terms') {
        showResult(`Local tool · ${label}`, result.result.join('\n'), 'stats');
      } else {
        showResult(`Local tool · ${label}`, result.result, 'text');
      }
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    }
  }

  async function rewriteWithProvider() {
    const text = dom.editor.value.trim();
    if (!text) {
      U.error('There is no text to rewrite.');
      return;
    }
    if (!state.providers.ai_available) {
      U.error('No AI provider configured. Use the offline tools, or add a key in Settings.');
      return;
    }
    dom.ai.disabled = true;
    const original = dom.ai.textContent;
    dom.ai.textContent = 'Rewriting…';
    try {
      /* The provider path goes through Abyss's message pipeline with an
         explicit conversation so the result is stored and attributable. */
      const created = await api.post('/api/abyss/conversations', {
        title: `Quill rewrite · ${(dom.title.value || 'draft').slice(0, 40)}`,
      });
      const prompt = `Rewrite the following text more clearly while keeping its meaning:\n\n${text}`;
      const data = await api.post(
        `/api/abyss/conversations/${created.conversation.id}/messages`,
        { content: prompt, use_ai: true }
      );
      if (data.mode !== 'provider') {
        U.error('The provider did not return text. Nothing was changed.');
        return;
      }
      showResult(`Provider · ${data.provider}`, data.reply.content, 'provider');
      U.success(`Rewrite returned by ${data.provider}. Review before replacing.`);
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    } finally {
      dom.ai.disabled = false;
      dom.ai.textContent = original;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Provider panel                                                     */
  /* ------------------------------------------------------------------ */
  function renderProviders() {
    const p = state.providers;
    U.clear(dom.prov);
    [
      ['Mode', p.local_only ? 'Local-only' : 'Network enabled'],
      ['AI provider', p.ai_available ? p.ai_provider : 'Not configured'],
    ].forEach(([label, value]) => {
      dom.prov.appendChild(U.el('div', { class: 'prov-card__row' }, [
        U.el('span', { text: label }),
        U.el('span', { text: value }),
      ]));
    });

    dom.ai.disabled = !p.ai_available;
    dom.ai.title = p.ai_available
      ? `Send this draft to ${p.ai_provider} for a rewrite`
      : 'Requires a configured AI provider in Settings';
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                             */
  /* ------------------------------------------------------------------ */
  dom.editor.addEventListener('input', markDirty);
  dom.title.addEventListener('input', markDirty);

  dom.save.addEventListener('click', () => saveDraft({ force: true }));

  dom.del.addEventListener('click', () => {
    if (state.current) deleteDraft(state.current);
  });

  dom.newBtn.addEventListener('click', createDraft);
  dom.start.addEventListener('click', createDraft);

  dom.search.addEventListener('input', U.debounce(() => {
    loadDrafts(dom.search.value.trim());
  }, 220));

  U.$$('[data-tool]', root).forEach((button) => {
    button.addEventListener('click', () => {
      runTool(button.dataset.tool, button.textContent.trim());
    });
  });

  dom.ai.addEventListener('click', rewriteWithProvider);

  dom.copy.addEventListener('click', () => {
    if (state.lastResult) U.copy(state.lastResult);
  });

  dom.closeOut.addEventListener('click', () => {
    dom.toolout.hidden = true;
  });

  dom.exportTxt.addEventListener('click', () => exportDraft('txt'));
  dom.exportMd.addEventListener('click', () => exportDraft('md'));

  /* Ctrl/Cmd+S saves; Escape closes the result drawer. Both stand down while
     the confirm dialog is open so they cannot fight the dialog. */
  document.addEventListener('keydown', (event) => {
    if (document.querySelector('#confirm[data-open]')) return;
    if ((event.metaKey || event.ctrlKey) && (event.key === 's' || event.key === 'S')) {
      event.preventDefault();
      if (state.current) saveDraft({ force: true });
      return;
    }
    if (event.key === 'Escape' && !dom.toolout.hidden) {
      dom.toolout.hidden = true;
      dom.closeOut.focus();
    }
  });

  dom.insert.addEventListener('click', () => {
    if (state.resultKind !== 'text') return;
    dom.editor.value = state.lastResult;
    markDirty();
    dom.toolout.hidden = true;
    U.success('Editor text replaced. Save to keep it.');
  });

  dom.append.addEventListener('click', () => {
    if (state.resultKind !== 'text') return;
    dom.editor.value = `${dom.editor.value}\n\n${state.lastResult}`.trim();
    markDirty();
    dom.toolout.hidden = true;
    U.success('Result appended to the draft.');
  });

  /* Warn before leaving with unsaved work. */
  window.addEventListener('beforeunload', (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  /* Flush a pending save when the tab is hidden. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.dirty) {
      saveDraft({ force: true });
    }
  });

  window.OPS.shell.registerPrimary('New draft', () => {
    if (document.activeElement === dom.editor && state.dirty) {
      saveDraft({ force: true });
    } else {
      createDraft();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Startup                                                            */
  /* ------------------------------------------------------------------ */
  (async function init() {
    renderProviders();
    syncExportButtons();
    clearEditor();
    await loadDrafts();

    const params = new URLSearchParams(window.location.search);
    const wanted = Number(params.get('draft'));
    if (wanted) {
      await openDraft(wanted);
    } else if (params.get('new') === '1') {
      await createDraft();
    } else if (state.drafts.length) {
      await openDraft(state.drafts[0].id);
    }
  })();
})();
