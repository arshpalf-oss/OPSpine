/* ==========================================================================
   Scout — sessions, provider results, and user notes kept strictly separate.
   ========================================================================== */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;

  const root = document.querySelector('[data-scout]');
  if (!root) return;

  const dom = {
    form: document.getElementById('scout-form'),
    question: document.getElementById('scout-question'),
    go: document.getElementById('scout-go'),
    capability: document.getElementById('scout-capability'),
    search: document.getElementById('scout-search'),
    sessions: document.getElementById('scout-sessions'),
    detail: document.getElementById('scout-detail'),
  };

  const state = {
    sessions: [],
    current: null,
    capability: null,
    busy: false,
    noteKind: 'note',
  };

  /* ------------------------------------------------------------------ */
  /* Capability banner                                                  */
  /* ------------------------------------------------------------------ */
  function renderCapability() {
    const cap = state.capability;
    if (!cap) return;
    U.clear(dom.capability);
    dom.capability.innerHTML = '';
    const strong = U.el('strong', {
      text: cap.search_available ? `Live search via ${cap.provider}.` : 'Live search unavailable.',
    });
    dom.capability.appendChild(strong);
    dom.capability.appendChild(
      document.createTextNode(' ' + cap.message)
    );

  }

  /* ------------------------------------------------------------------ */
  /* Session list                                                       */
  /* ------------------------------------------------------------------ */
  async function loadSessions(query = '') {
    try {
      const data = await api.get(
        `/api/scout/sessions${query ? `?q=${encodeURIComponent(query)}` : ''}`
      );
      state.sessions = data.sessions;
      state.capability = data.capability;
      renderSessions();
      renderCapability();
    } catch (err) {
      U.clear(dom.sessions);
      dom.sessions.appendChild(
        U.el('li', { class: 'sessions__empty', text: err.message })
      );
    }
  }

  function statusLabel(session) {
    if (session.status === 'searched') return `${session.result_count} source${session.result_count === 1 ? '' : 's'}`;
    if (session.status === 'no_results') return 'no sources found';
    return 'not searched';
  }

  function renderSessions() {
    const count = document.getElementById('scout-count');
    const query = dom.search.value.trim();
    if (count) {
      if (!state.sessions.length) {
        count.textContent = query ? `No matches for “${query}”` : '';
      } else {
        count.textContent = query
          ? `${state.sessions.length} match${state.sessions.length === 1 ? '' : 'es'} for “${query}”`
          : `${state.sessions.length} session${state.sessions.length === 1 ? '' : 's'}`;
      }
    }
    U.clear(dom.sessions);
    if (!state.sessions.length) {
      dom.sessions.appendChild(
        U.el('li', {
          class: 'sessions__empty',
          text: dom.search.value
            ? 'No sessions match that search.'
            : 'No sessions yet. Ask a question above to begin one.',
        })
      );
      return;
    }

    state.sessions.forEach((session) => {
      const active = state.current && state.current.id === session.id;
      dom.sessions.appendChild(
        U.el('li', { class: `session session--row${active ? ' is-active' : ''}` }, [
          U.el('button', {
            class: 'session__open',
            type: 'button',
            onClick: () => openSession(session.id),
          }, [
            U.el('span', { class: 'session__q', text: session.question }),
            U.el('span', {
              class: 'session__meta',
              text: `${statusLabel(session)} · ${session.note_count} note${session.note_count === 1 ? '' : 's'}`,
            }),
          ]),
          U.el('button', {
            class: 'session__del',
            type: 'button',
            'aria-label': `Delete session: ${session.question}`,
            html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"/></svg>',
            onClick: (event) => {
              event.stopPropagation();
              deleteSession(session);
            },
          }),
        ])
      );
    });
  }

  async function deleteSession(session) {
    const ok = await U.confirm({
      title: 'Delete research session?',
      message: `“${session.question}” and its saved sources and notes will be removed.`,
      confirmLabel: 'Delete session',
    });
    if (!ok) return;
    try {
      await api.del(`/api/scout/sessions/${session.id}`);
      if (state.current && state.current.id === session.id) state.current = null;
      await loadSessions(dom.search.value);
      renderDetail();
      U.success('Session deleted.');
    } catch (err) {
      U.error(err.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Detail view                                                        */
  /* ------------------------------------------------------------------ */
  async function openSession(id) {
    try {
      const data = await api.get(`/api/scout/sessions/${id}`);
      state.current = data.session;
      state.capability = data.capability;
      state.noteKind = 'note';
      renderSessions();
      renderCapability();
      renderDetail();
    } catch (err) {
      U.error(err.message);
    }
  }

  function renderDetail() {
    U.clear(dom.detail);
    if (!state.current) {
      dom.detail.appendChild(
        U.el('div', { class: 'detail__empty' }, [
          U.el('h4', { text: 'No session selected' }),
          U.el('p', {
            text: 'Ask a question above. Scout will search if a provider is configured, and record what came back — including when nothing did.',
          }),
        ])
      );
      return;
    }

    const session = state.current;
    const cap = state.capability || {};

    const head = U.el('div', { class: 'detail__head' }, [
      U.el('p', { class: 'detail__question', text: session.question }),
      U.el('div', { class: 'detail__badges' }, [
        session.status === 'searched'
          ? U.el('span', { class: 'badge badge--searched', text: `${session.results.length} sources found` })
          : U.el('span', { class: 'badge badge--none', text: statusLabel(session) }),
        U.el('span', { class: 'badge', text: `${session.notes.length} notes` }),
        session.results.length
          ? U.el('span', { class: 'badge', text: `provider: ${session.results[0].provider}` })
          : null,
      ]),
    ]);

    const resultsEmpty = U.el('div', { class: 'results__empty' }, [
      document.createTextNode(
        cap.search_available
          ? 'This session has not been searched yet. Press “Run live search”.'
          : 'Live research is unavailable. '
      ),
      cap.search_available
        ? null
        : U.el('span', {
            text: cap.local_only
              ? 'Local-only mode blocks outbound requests. You can still record notes below.'
              : 'Add a Brave or Tavily key in Settings. Notes below still work.',
          }),
    ]);

    const resultsSection = U.el('div', { class: 'detail__section' }, [
      U.el('h4', {}, [
        'Sources',
        U.el('span', { text: 'from provider' }),
      ]),
      session.results.length
        ? U.el('div', { class: 'results' }, session.results.map((result, index) => (
            U.el('div', { class: 'result', role: 'group',
              'aria-label': `Source ${index + 1}` }, [
              U.el('a', {
                class: 'result__link',
                href: result.url,
                target: '_blank',
                rel: 'noopener noreferrer',
              }, [
                U.el('p', { class: 'result__title', text: result.title || result.url }),
                result.snippet ? U.el('p', { class: 'result__snippet', text: result.snippet }) : null,
                U.el('p', { class: 'result__foot' }, [
                  U.el('span', { class: 'result__url', text: result.url }),
                  U.el('span', { class: 'result__prov', text: result.provider }),
                ]),
              ]),
              U.el('div', { class: 'result__tools' }, [
                U.el('button', {
                  class: 'result__btn', type: 'button',
                  text: 'Copy link',
                  'aria-label': `Copy link to ${result.title || result.url}`,
                  onClick: () => U.copy(result.url, 'Link copied.'),
                }),
                U.el('button', {
                  class: 'result__btn', type: 'button',
                  text: 'Copy citation',
                  'aria-label': `Copy citation for ${result.title || result.url}`,
                  onClick: () => U.copy(
                    `${result.title || result.url} — ${result.url} (${result.provider})`,
                    'Citation copied.'
                  ),
                }),
              ]),
            ])
          )))
        : resultsEmpty,
    ]);

    const notesSection = U.el('div', { class: 'detail__section' }, [
      U.el('h4', {}, [
        'Notes',
        U.el('span', { text: 'written by you' }),
      ]),
      session.notes.length
        ? U.el('div', { class: 'notes' }, session.notes.map(noteNode))
        : U.el('p', { class: 'notes__empty', text: 'No notes yet. Saved notes are yours — Scout never generates them.' }),
      noteForm(),
    ]);

    dom.detail.appendChild(head);
    dom.detail.appendChild(
      U.el('div', { class: 'detail__body' }, [resultsSection, notesSection])
    );
    dom.detail.appendChild(
      U.el('div', { class: 'detail__actions' }, [
        U.el('button', {
          class: 'btn btn--primary btn--sm',
          type: 'button',
          disabled: !cap.search_available,
          title: cap.search_available ? 'Search with the configured provider' : 'No research provider available',
          onClick: runSearch,
        }, 'Run live search'),
        U.el('button', {
          class: 'btn btn--sm',
          type: 'button',
          onClick: () => {
            const input = document.getElementById('note-body');
            if (input) input.focus();
          },
        }, 'Add a note'),
      ])
    );
  }

  function noteNode(note) {
    return U.el('div', { class: 'note' }, [
      U.el('span', { class: 'note__kind', text: note.kind === 'link' ? 'link' : 'note' }),
      U.el('div', { class: 'note__body' }, [
        document.createTextNode(note.body),
        note.url
          ? U.el('a', {
              class: 'note__url',
              href: note.url,
              target: '_blank',
              rel: 'noopener noreferrer',
              text: note.url,
            })
          : null,
      ]),
      U.el('button', {
        class: 'note__del',
        type: 'button',
        'aria-label': 'Delete note',
        html: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"/></svg>',
        onClick: () => deleteNote(note),
      }),
    ]);
  }

  function noteForm() {
    const form = U.el('form', { class: 'note-form' });
    form.appendChild(
      U.el('textarea', {
        id: 'note-body',
        placeholder: 'What did you learn, or what do you want to check?',
        'aria-label': 'Note text',
        rows: '2',
      })
    );
    const urlInput = U.el('input', {
      type: 'url',
      id: 'note-url',
      placeholder: 'https://… (optional link)',
      'aria-label': 'Link URL',
    });
    urlInput.hidden = true;

    const segNote = U.el('button', {
      type: 'button',
      class: 'is-active',
      onClick: () => setKind('note'),
    }, 'Note');
    const segLink = U.el('button', {
      type: 'button',
      onClick: () => setKind('link'),
    }, 'Link');

    function setKind(kind) {
      state.noteKind = kind;
      segNote.classList.toggle('is-active', kind === 'note');
      segLink.classList.toggle('is-active', kind === 'link');
      urlInput.hidden = kind !== 'link';
      if (kind === 'link') urlInput.focus();
    }

    form.appendChild(
      U.el('div', { class: 'note-form__row' }, [
        U.el('div', { class: 'note-form__seg' }, [segNote, segLink]),
      ])
    );
    form.appendChild(urlInput);
    form.appendChild(
      U.el('div', { class: 'note-form__row' }, [
        U.el('button', { class: 'btn btn--sm', type: 'submit' }, 'Save'),
        U.el('span', { class: 'note-form__hint',
          text: `${U.mod()} ↵ to save` }),
      ])
    );

    [form.querySelector('#note-body'), urlInput].forEach((field) => {
      field.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          form.requestSubmit
            ? form.requestSubmit()
            : form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!state.current) return;
      const body = form.querySelector('#note-body').value.trim();
      const url = form.querySelector('#note-url').value.trim();
      if (!body) {
        U.error('Write something before saving.');
        return;
      }
      if (state.noteKind === 'link' && !url) {
        U.error('A saved link needs a URL.');
        return;
      }
      try {
        await api.post(`/api/scout/sessions/${state.current.id}/notes`, {
          body,
          kind: state.noteKind,
          url: state.noteKind === 'link' ? url : '',
        });
        await loadSessions(dom.search.value);
        await openSession(state.current.id);
        U.success('Note saved.');
        window.OPS.shell.refreshActivity();
      } catch (err) {
        U.error(err.message);
      }
    });

    return form;
  }

  async function deleteNote(note) {
    try {
      await api.del(`/api/scout/notes/${note.id}`);
      await openSession(state.current.id);
      await loadSessions(dom.search.value);
      U.success('Note deleted.');
    } catch (err) {
      U.error(err.message);
    }
  }

  async function runSearch() {
    if (!state.current) return;
    if (!state.capability || !state.capability.search_available) {
      U.error('No research provider is available. Configure one in Settings, or keep notes locally.');
      return;
    }
    try {
      const data = await api.post(`/api/scout/sessions/${state.current.id}/search`, {});
      state.current = data.session;
      state.capability = data.capability;
      renderDetail();
      renderSessions();
      const found = data.session.results.length;
      U.success(
        found ? `${found} source${found === 1 ? '' : 's'} saved from ${data.session.results[0].provider}.`
              : 'The provider returned no sources for that question.'
      );
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
      renderDetail();
    }
  }

  /* ------------------------------------------------------------------ */
  /* New session                                                        */
  /* ------------------------------------------------------------------ */
  dom.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = dom.question.value.trim();
    if (!question) {
      U.error('Enter a research question first.');
      dom.question.focus();
      return;
    }
    if (state.busy) return;
    state.busy = true;
    dom.go.disabled = true;

    try {
      const data = await api.post('/api/scout/sessions', { question });
      dom.question.value = '';
      state.current = data.session;
      state.capability = data.capability;
      await loadSessions();
      renderDetail();
      window.OPS.shell.refreshActivity();

      /* Search automatically only when it can actually succeed. */
      if (state.capability.search_available) {
        await runSearch();
      } else {
        U.toast('Session saved. Live search is unavailable — notes still work.');
      }
    } catch (err) {
      U.error(err.message);
    } finally {
      state.busy = false;
      dom.go.disabled = false;
    }
  });

  dom.question.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      dom.form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  dom.search.addEventListener('input', U.debounce(() => {
    loadSessions(dom.search.value.trim());
  }, 220));

  dom.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      dom.search.value = '';
      loadSessions('');
      dom.search.blur();
    }
  });

  window.OPS.shell.registerPrimary('New research session', () => {
    dom.question.focus();
  });

  (async function init() {
    await loadSessions();
    renderDetail();
    const params = new URLSearchParams(window.location.search);
    const wanted = Number(params.get('session'));
    if (wanted) {
      await openSession(wanted);
    } else if (state.sessions.length) {
      await openSession(state.sessions[0].id);
    }
  })();
})();
