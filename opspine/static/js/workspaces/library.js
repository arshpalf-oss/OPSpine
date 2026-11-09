/* ==========================================================================
   Library — lists files, drafts, research and conversations that exist.
   ========================================================================== */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;

  const root = document.querySelector('[data-library]');
  if (!root) return;

  const dom = {
    panel: document.getElementById('library-panel'),
    search: document.getElementById('library-search'),
    tabs: U.$$('.libtab'),
    notice: document.getElementById('library-notice'),
    stats: document.getElementById('library-stats'),
  };

  const state = {
    tab: 'documents',
    query: '',
    data: { documents: [], drafts: [], research: [], conversations: [], counts: {} },
  };

  /* ------------------------------------------------------------------ */
  /* Loading                                                            */
  /* ------------------------------------------------------------------ */
  async function load(query = '') {
    try {
      const data = await api.get(
        `/api/library/${query ? `?q=${encodeURIComponent(query)}` : ''}`
      );
      state.data = data;
      render();
      renderStats();
    } catch (err) {
      U.clear(dom.panel);
      dom.panel.appendChild(
        U.state({
          title: 'Library could not load',
          body: err.message,
          variant: 'error',
          actionLabel: 'Try again',
          onAction: () => load(state.query),
        })
      );
    }
  }

  function renderStats() {
    U.clear(dom.stats);
    [
      ['Files', state.data.documents.length],
      ['Drafts', state.data.drafts.length],
      ['Research', state.data.research.length],
      ['Chats', state.data.conversations.length],
    ].forEach(([label, value]) => {
      dom.stats.appendChild(U.el('div', {}, [
        U.el('dt', { text: label }),
        U.el('dd', { text: String(value) }),
      ]));
    });

    U.$$('[data-tab-count]').forEach((node) => {
      const key = node.dataset.tabCount;
      const value = (state.data[key] || []).length;
      node.textContent = String(value);
    });

    const missing = state.data.documents.filter((doc) => doc.missing).length;
    if (missing) {
      dom.notice.hidden = false;
      dom.notice.textContent =
        `${missing} file${missing === 1 ? '' : 's'} listed here no longer exist on disk. ` +
        'The records stay so you can see what was made, but downloads are disabled.';
    } else {
      dom.notice.hidden = true;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Renderers                                                          */
  /* ------------------------------------------------------------------ */
  function render() {
    U.clear(dom.panel);
    if (state.tab === 'documents') renderDocuments();
    else if (state.tab === 'drafts') renderDrafts();
    else if (state.tab === 'research') renderResearch();
    else renderConversations();
  }

  function emptyState(title, body, actionLabel, onAction) {
    return U.el('div', { class: 'library__empty' }, [
      U.el('h3', { text: title }),
      U.el('p', { text: body }),
      actionLabel
        ? U.el('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: onAction }, actionLabel)
        : null,
    ]);
  }

  function renderDocuments() {
    const docs = state.data.documents;
    if (!docs.length) {
      dom.panel.appendChild(
        emptyState(
          state.query ? 'No files match that search' : 'No files yet',
          state.query
            ? 'Try a different term, or clear the search box.'
            : 'Forge writes PPTX, DOCX, XLSX, PDF, Markdown and PNG files. Generate one and it will appear here.',
          state.query ? null : 'Open Forge',
          () => { window.location.href = '/forge'; }
        )
      );
      return;
    }

    const list = U.el('div', { class: 'files' });
    docs.forEach((doc) => {
      const row = U.el('div', { class: 'file' }, [
        U.el('span', { class: 'file__type', text: doc.format.toUpperCase() }),
        U.el('div', { class: 'file__main' }, [
          U.el('span', { class: 'file__title', text: doc.title, title: doc.title }),
          U.el('span', {
            class: 'file__meta',
            text: `${U.filesize(doc.bytes)} · ${U.relativeTime(doc.created_at)} · ${doc.filename}`,
          }),
        ]),
      ]);

      if (doc.missing) {
        row.appendChild(U.el('span', { class: 'file__missing', text: 'missing' }));
      } else {
        row.appendChild(U.el('span'));
      }

      row.appendChild(
        U.el('div', { class: 'file__actions' }, [
          U.el('button', {
            class: 'file__btn',
            type: 'button',
            'aria-label': `Download ${doc.title}`,
            title: doc.missing ? 'File is missing on disk' : 'Download',
            disabled: doc.missing,
            html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M8 11l4 4 4-4M5 19h14"/></svg>',
            onClick: () => download(doc),
          }),
          U.el('button', {
            class: 'file__btn file__btn--danger',
            type: 'button',
            'aria-label': `Delete ${doc.title}`,
            title: 'Delete',
            html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"/></svg>',
            onClick: () => removeDocument(doc),
          }),
        ])
      );

      list.appendChild(row);
    });
    dom.panel.appendChild(list);
  }

  function renderDrafts() {
    if (!state.data.drafts.length) {
      dom.panel.appendChild(
        emptyState(
          state.query ? 'No drafts match that search' : 'No drafts yet',
          state.query
            ? 'Try a different term.'
            : 'Quill saves drafts to this machine. Start writing and they will be listed here.',
          state.query ? null : 'Open Quill',
          () => { window.location.href = '/quill?new=1'; }
        )
      );
      return;
    }

    const list = U.el('div', { class: 'records' });
    state.data.drafts.forEach((draft) => {
      list.appendChild(
        U.el('div', { class: 'record' }, [
          U.el('div', { class: 'record__main' }, [
            U.el('p', { class: 'record__title', text: draft.title || 'Untitled draft' }),
            draft.excerpt
              ? U.el('p', { class: 'record__excerpt', text: draft.excerpt })
              : null,
            U.el('div', { class: 'record__meta' }, [
              U.el('span', { text: `${draft.words} words` }),
              U.el('span', { text: `edited ${U.relativeTime(draft.updated_at)}` }),
            ]),
          ]),
          U.el('a', { class: 'record__open', href: `/quill?draft=${draft.id}` }, 'Open →'),
        ])
      );
    });
    dom.panel.appendChild(list);
  }

  function renderResearch() {
    if (!state.data.research.length) {
      dom.panel.appendChild(
        emptyState(
          state.query ? 'No research matches that search' : 'No research sessions yet',
          'Scout records questions, provider sources and your own notes.',
          'Open Scout',
          () => { window.location.href = '/scout'; }
        )
      );
      return;
    }

    const list = U.el('div', { class: 'records' });
    state.data.research.forEach((session) => {
      const status = session.status === 'searched'
        ? `${session.result_count} source${session.result_count === 1 ? '' : 's'}`
        : session.status === 'no_results' ? 'no sources found' : 'not searched';
      list.appendChild(
        U.el('div', { class: 'record' }, [
          U.el('div', { class: 'record__main' }, [
            U.el('p', { class: 'record__title', text: session.question }),
            U.el('div', { class: 'record__meta' }, [
              U.el('span', { text: status }),
              U.el('span', { text: `${session.note_count} note${session.note_count === 1 ? '' : 's'}` }),
              U.el('span', { text: U.relativeTime(session.updated_at) }),
            ]),
          ]),
          U.el('a', { class: 'record__open', href: `/scout?session=${session.id}` }, 'Open →'),
        ])
      );
    });
    dom.panel.appendChild(list);
  }

  function renderConversations() {
    if (!state.data.conversations.length) {
      dom.panel.appendChild(
        emptyState(
          state.query ? 'No conversations match that search' : 'No conversations yet',
          'Abyss keeps every conversation on this machine, along with what produced each reply.',
          'Open Abyss',
          () => { window.location.href = '/abyss'; }
        )
      );
      return;
    }

    const list = U.el('div', { class: 'records' });
    state.data.conversations.forEach((conversation) => {
      list.appendChild(
        U.el('div', { class: 'record' }, [
          U.el('div', { class: 'record__main' }, [
            U.el('p', { class: 'record__title', text: conversation.title }),
            U.el('div', { class: 'record__meta' }, [
              U.el('span', { text: `${conversation.message_count} message${conversation.message_count === 1 ? '' : 's'}` }),
              U.el('span', { text: U.relativeTime(conversation.updated_at) }),
            ]),
          ]),
          U.el('a', {
            class: 'record__open',
            href: `/abyss?conversation=${conversation.id}`,
          }, 'Open →'),
        ])
      );
    });
    dom.panel.appendChild(list);
  }

  /* ------------------------------------------------------------------ */
  /* Actions                                                            */
  /* ------------------------------------------------------------------ */
  async function download(doc) {
    try {
      await api.download(
        `/api/library/documents/${doc.id}/file`,
        `${doc.title}.${doc.format}`
      );
    } catch (err) {
      U.error(err.message);
      load(state.query);
    }
  }

  async function removeDocument(doc) {
    const ok = await U.confirm({
      title: 'Delete this file?',
      message: doc.missing
        ? `“${doc.title}” is already missing on disk. Remove its record from the library?`
        : `“${doc.title}” will be deleted from disk and removed from the library.`,
      confirmLabel: 'Delete file',
    });
    if (!ok) return;
    try {
      await api.del(`/api/library/documents/${doc.id}`);
      U.success('File deleted.');
      await load(state.query);
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                             */
  /* ------------------------------------------------------------------ */
  dom.search.addEventListener('input', U.debounce(() => {
    state.query = dom.search.value.trim();
    load(state.query);
  }, 240));

  dom.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.tab = tab.dataset.tab;
      dom.tabs.forEach((node) => {
        const active = node === tab;
        node.classList.toggle('is-active', active);
        node.setAttribute('aria-selected', String(active));
      });
      render();
    });
  });

  window.OPS.shell.registerPrimary('Search library', () => dom.search.focus());

  (async function init() {
    await load();
    const params = new URLSearchParams(window.location.search);
    if (params.get('highlight')) {
      state.tab = 'documents';
      dom.tabs.forEach((node) => {
        const active = node.dataset.tab === 'documents';
        node.classList.toggle('is-active', active);
        node.setAttribute('aria-selected', String(active));
      });
      render();
    }
  })();
})();
