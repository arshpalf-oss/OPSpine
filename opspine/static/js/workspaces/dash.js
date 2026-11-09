/* ==========================================================================
   Dash — a command table where every entry performs a real action.
   ========================================================================== */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;
  const shell = window.OPS.shell;
  const boot = shell.state.boot;

  const root = document.querySelector('[data-dash]');
  if (!root) return;

  const dom = {
    rows: document.getElementById('dash-rows'),
    search: document.getElementById('dash-search'),
    filters: document.getElementById('dash-filters'),
    counters: document.getElementById('dash-counters'),
    recent: document.getElementById('dash-recent'),
    toolsState: document.getElementById('dash-tools-state'),
    modeCopy: document.getElementById('dash-mode-copy'),
    modeToggle: document.getElementById('dash-mode-toggle'),
  };

  const state = {
    category: 'all',
    query: '',
    counts: boot.counts,
    activity: [],
    providers: boot.providers,
    settings: boot.settings,
  };

  const mod = shell.modLabel;

  /* ------------------------------------------------------------------ */
  /* Command catalogue — each run() is a real action                    */
  /* ------------------------------------------------------------------ */
  function commands() {
    const list = [
      /* Navigate */
      {
        cat: 'navigate',
        name: 'Open Dashboard',
        desc: 'Return to the launcher',
        keys: [mod, '0'],
        run: () => { window.location.href = '/dashboard'; },
      },
      {
        cat: 'navigate',
        name: 'Open Abyss',
        desc: 'Conversations and local text tools',
        keys: [mod, '1'],
        run: () => { window.location.href = '/abyss'; },
      },
      {
        cat: 'navigate',
        name: 'Open Scout',
        desc: 'Research sessions and notes',
        keys: [mod, '2'],
        run: () => { window.location.href = '/scout'; },
      },
      {
        cat: 'navigate',
        name: 'Open Forge',
        desc: 'Generate a document',
        keys: [mod, '3'],
        run: () => { window.location.href = '/forge'; },
      },
      {
        cat: 'navigate',
        name: 'Open Quill',
        desc: 'Write and autosave a draft',
        keys: [mod, '4'],
        run: () => { window.location.href = '/quill'; },
      },
      {
        cat: 'navigate',
        name: 'Open Kronos',
        desc: 'Calendar and planning',
        keys: [mod, '5'],
        run: () => { window.location.href = '/kronos'; },
      },
      {
        cat: 'navigate',
        name: 'Open Whiteboard',
        desc: 'Visual thinking canvas',
        keys: [mod, '6'],
        run: () => { window.location.href = '/whiteboard'; },
      },
      {
        cat: 'navigate',
        name: 'Open Working Board',
        desc: 'Tasks and progress',
        keys: [mod, '8'],
        run: () => { window.location.href = '/working-board'; },
      },
      {
        cat: 'navigate',
        name: 'Open Library',
        desc: 'Files and saved work',
        keys: [],
        run: () => { window.location.href = '/library'; },
      },
      {
        cat: 'navigate',
        name: 'Open Settings',
        desc: 'Providers, motion, backups',
        keys: [],
        run: () => { window.location.href = '/settings'; },
      },

      /* Create */
      {
        cat: 'create',
        name: 'Start a conversation',
        desc: 'New thread in Abyss',
        keys: [],
        run: () => { window.location.href = '/abyss?new=1'; },
      },
      {
        cat: 'create',
        name: 'Start a draft',
        desc: 'Blank document in Quill',
        keys: [],
        run: () => { window.location.href = '/quill?new=1'; },
      },
      {
        cat: 'create',
        name: 'Generate a document',
        desc: 'PPTX, DOCX, XLSX, PDF, Markdown or PNG',
        keys: [],
        run: () => { window.location.href = '/forge'; },
      },
      {
        cat: 'create',
        name: 'Start a research session',
        desc: 'Ask Scout a question',
        keys: [],
        run: () => { window.location.href = '/scout'; },
      },
      {
        cat: 'create',
        name: 'Create an event',
        desc: 'Opens the Kronos event editor',
        keys: [],
        run: () => { window.location.href = '/kronos'; },
      },
      {
        cat: 'create',
        name: 'Create a task',
        desc: 'Add work to the Working Board',
        keys: [],
        run: () => { window.location.href = '/working-board?new=1'; },
      },

      /* Actions that run right here */
      {
        cat: 'create',
        name: 'Create an event for tomorrow 9am',
        desc: 'Writes a real event to Kronos immediately',
        keys: [],
        run: async () => {
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);
          const end = new Date(start.getTime() + 3600 * 1000);
          try {
            await api.post('/api/kronos/events', {
              title: 'New event',
              start_at: Math.floor(start.getTime() / 1000),
              end_at: Math.floor(end.getTime() / 1000),
              notes: 'Created from Dash',
              all_day: false,
              done: false,
            });
            U.success('Event created for tomorrow at 09:00. Open Kronos to edit it.');
            await refresh();
          } catch (err) {
            U.error(err.message);
          }
        },
      },
      {
        cat: 'create',
        name: 'Create a task from text',
        desc: 'Prompts for a title, then saves it',
        keys: [],
        run: async () => {
          const title = window.prompt('Task title');
          if (!title || !title.trim()) return;
          try {
            await api.post('/api/tasks/', {
              title: title.trim(),
              status: 'todo',
              priority: 'normal',
            });
            U.success('Task added to the Working Board.');
            await refresh();
          } catch (err) {
            U.error(err.message);
          }
        },
      },

      /* System */
      {
        cat: 'system',
        name: 'Toggle local-only mode',
        desc: () => (state.settings.local_only
          ? 'Currently on — blocks all outbound requests'
          : 'Currently off — configured providers may be called'),
        keys: [],
        run: async () => {
          const next = !state.settings.local_only;
          try {
            await api.post('/api/settings', { local_only: next });
            state.settings.local_only = next;
            U.success(next ? 'Local-only mode is on.' : 'Network access enabled.');
            setTimeout(() => window.location.reload(), 600);
          } catch (err) {
            U.error(err.message);
          }
        },
      },
      {
        cat: 'system',
        name: 'Download a data backup',
        desc: 'JSON of your local records, excluding API keys',
        keys: [],
        run: async () => {
          try {
            const name = await api.download('/api/backup', 'opspine-backup.json');
            U.success(`Saved ${name}.`);
          } catch (err) {
            U.error(err.message);
          }
        },
      },
      {
        cat: 'system',
        name: 'Clear activity history',
        desc: 'Removes the records shown in this panel',
        keys: [],
        run: async () => {
          const ok = await U.confirm({
            title: 'Clear activity history?',
            message: 'This removes the recent-activity log. Your documents, drafts and events are untouched.',
            confirmLabel: 'Clear history',
          });
          if (!ok) return;
          try {
            await api.post('/api/activity/clear', {});
            U.success('Activity history cleared.');
            await refresh();
            shell.refreshActivity();
          } catch (err) {
            U.error(err.message);
          }
        },
      },
      {
        cat: 'system',
        name: 'Show keyboard shortcuts',
        desc: 'Opens the shared shortcut sheet',
        keys: ['?'],
        run: () => shell.openHelp(),
      },
      {
        cat: 'system',
        name: 'Open the command palette',
        desc: 'Search everything in one field',
        keys: [mod, 'K'],
        run: () => shell.openPalette(),
      },
      {
        cat: 'system',
        name: 'Toggle navigation',
        desc: 'Collapse or expand the sidebar',
        keys: [mod, '\\'],
        run: () => shell.toggleSidebar(),
      },
    ];

    return list.map((command, index) => ({
      ...command,
      id: `cmd-${index}`,
      desc: typeof command.desc === 'function' ? command.desc() : command.desc,
    }));
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */
  function renderCounters() {
    const items = [
      { label: 'Commands', value: commands().length, note: 'all executable' },
      { label: 'Actions today', value: state.counts.actions_today },
      { label: 'Actions total', value: state.counts.actions_total },
      { label: 'Files generated', value: state.counts.documents },
      { label: 'Open tasks', value: state.counts.tasks },
    ];

    U.clear(dom.counters);
    items.forEach((item) => {
      dom.counters.appendChild(
        U.el('div', {
          class: `counter${item.value === 0 ? ' counter--zero' : ''}`,
          title: item.note || '',
        }, [
          U.el('span', { class: 'counter__value', text: String(item.value) }),
          U.el('span', { class: 'counter__label', text: item.label }),
        ])
      );
    });
  }

  function renderTable() {
    const term = state.query.trim().toLowerCase();
    const all = commands();
    const visible = all.filter((command) => {
      if (state.category !== 'all' && command.cat !== state.category) return false;
      if (!term) return true;
      return `${command.name} ${command.desc} ${command.cat}`.toLowerCase().includes(term);
    });

    U.clear(dom.rows);
    if (!visible.length) {
      dom.rows.appendChild(
        U.el('div', { class: 'cmdtable__empty' }, [
          `No command matches “${state.query}”. Clear the filter to see all ${all.length}.`,
        ])
      );
      return;
    }

    visible.forEach((command) => {
      const row = U.el('div', { class: 'cmdrow', role: 'row' }, [
        U.el('div', { class: 'cmdrow__main', role: 'cell' }, [
          U.el('span', { class: 'cmdrow__name', text: command.name }),
          U.el('span', { class: 'cmdrow__desc', text: command.desc }),
        ]),
        U.el('span', {
          class: 'cmdrow__cat',
          dataset: { cat: command.cat },
          text: command.cat,
          role: 'cell',
        }),
        U.el('div', { class: 'cmdrow__key', role: 'cell' }, command.keys.length
          ? command.keys.map((key) => U.el('kbd', { text: key }))
          : [U.el('span', { text: '—' })]),
        U.el('div', { class: 'cmdrow__run', role: 'cell' }, [
          U.el('button', {
            class: 'runbtn',
            type: 'button',
            onClick: async (event) => {
              const button = event.currentTarget;
              button.disabled = true;
              button.textContent = 'run';
              try {
                await command.run();
              } finally {
                button.disabled = false;
                button.textContent = 'run';
              }
            },
          }, 'run'),
        ]),
      ]);
      dom.rows.appendChild(row);
    });
  }

  function renderRecent() {
    U.clear(dom.recent);
    if (!state.activity.length) {
      dom.recent.appendChild(
        U.el('li', { class: 'dashrecent__empty' }, [
          'No actions recorded yet. Run any command and it will appear here — with its real timestamp.',
        ])
      );
      return;
    }
    state.activity.forEach((item) => {
      dom.recent.appendChild(U.el('li', {}, [
        U.el('span', { class: 'dashrecent__ws', text: item.workspace_label }),
        U.el('span', { class: 'dashrecent__label', text: item.label }),
        U.el('span', { class: 'dashrecent__time', text: U.relativeTime(item.created_at) }),
      ]));
    });
  }

  function renderToolsState() {
    const p = state.providers;
    U.clear(dom.toolsState);
    [
      ['Local-only', p.local_only ? 'on' : 'off'],
      ['AI provider', p.ai_available ? p.ai_provider : 'none'],
      ['Search provider', p.search_available ? p.search_provider : 'none'],
      ['Database', 'local'],
    ].forEach(([label, value]) => {
      dom.toolsState.appendChild(U.el('div', {}, [
        U.el('dt', { text: label }),
        U.el('dd', { text: value }),
      ]));
    });

    dom.modeCopy.textContent = p.local_only
      ? 'Local-only mode is on. The server refuses every outbound provider request.'
      : 'Network access is enabled. Only configured providers will be contacted.';
    dom.modeToggle.textContent = p.local_only ? 'Enable network' : 'Enable local-only';
  }

  /* ------------------------------------------------------------------ */
  /* Refresh                                                            */
  /* ------------------------------------------------------------------ */
  async function refresh() {
    try {
      const data = await api.get('/api/activity?limit=8');
      state.counts = data.counts;
      state.activity = data.activity;
      renderCounters();
      renderRecent();
      renderTable();
    } catch (err) {
      U.error(`Could not refresh Dash: ${err.message}`);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                             */
  /* ------------------------------------------------------------------ */
  dom.search.addEventListener('input', U.debounce(() => {
    state.query = dom.search.value;
    renderTable();
  }, 140));

  dom.filters.addEventListener('click', (event) => {
    const button = event.target.closest('.cmdfilter');
    if (!button) return;
    state.category = button.dataset.cat;
    U.$$('.cmdfilter', dom.filters).forEach((node) => {
      node.classList.toggle('is-active', node === button);
    });
    renderTable();
  });

  dom.modeToggle.addEventListener('click', async () => {
    const next = !state.settings.local_only;
    try {
      await api.post('/api/settings', { local_only: next });
      state.settings.local_only = next;
      state.providers = (await api.get('/api/providers')).providers;
      U.success(next ? 'Local-only mode is on.' : 'Network access enabled.');
      renderToolsState();
      renderTable();
    } catch (err) {
      U.error(err.message);
    }
  });

  shell.registerPrimary('Run first command', () => {
    const first = dom.rows.querySelector('.runbtn');
    if (first) first.click();
  });

  /* ------------------------------------------------------------------ */
  /* Startup                                                            */
  /* ------------------------------------------------------------------ */
  renderCounters();
  renderTable();
  renderRecent();
  renderToolsState();
  refresh();
})();
