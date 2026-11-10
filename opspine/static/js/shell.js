/* ==========================================================================
   OPSpine shell
   Owns the chrome: sidebar and tools collapse, command palette, keyboard
   shortcuts, and the confirm dialog wiring. Workspaces register a
   primary action through OPS.shell.registerPrimary().
   ========================================================================== */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;

  const boot = JSON.parse(document.getElementById('opspine-boot').textContent);
  // The launcher has no app chrome; every chrome helper must no-op there.
  const shell = document.getElementById('app-shell') || document.getElementById('launcher');
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const modLabel = isMac ? 'Cmd' : 'Ctrl';

  const state = {
    boot,
    workspace: boot.workspace,
    primaryAction: null,
    paletteIndex: 0,
    paletteItems: [],
    lastFocus: null,
  };

  /* ------------------------------------------------------------------ */
  /* Persisted chrome state                                             */
  /* ------------------------------------------------------------------ */
  function saveChrome(patch) {
    api.post('/api/settings', patch).catch(() => {
      /* Chrome state is cosmetic; a failure here should not interrupt work. */
    });
  }

  function setSidebarCollapsed(collapsed, persist = true) {
    if (!document.getElementById('app-shell')) return;
    shell.dataset.sidebarCollapsed = collapsed ? 'true' : 'false';
    const toggle = document.querySelector('.topbar__menu');
    if (toggle) toggle.setAttribute('aria-expanded', String(!collapsed));
    const restore = document.getElementById('sidebar-restore');
    if (restore) {
      const isPhone = window.matchMedia('(max-width: 760px)').matches;
      restore.hidden = !(collapsed && !isPhone);
    }
    if (persist) saveChrome({ sidebar_collapsed: collapsed ? 1 : 0 });
  }

  /* Apply settings returned by the server after a settings change, so the
     shell reflects what was actually stored rather than what was requested. */
  function applyChrome(settings) {
    if (!settings) return;
    if ('sidebar_collapsed' in settings) {
      setSidebarCollapsed(Boolean(Number(settings.sidebar_collapsed)), false);
    }
    if (settings.motion) {
      document.documentElement.dataset.motion = settings.motion;
    }
  }

  function isPhone() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  function toggleSidebar() {
    if (!document.getElementById('app-shell')) return;
    const collapsed = shell.dataset.sidebarCollapsed === 'true';
    setSidebarCollapsed(!collapsed);
  }

  /* ------------------------------------------------------------------ */
  /* Overlays                                                           */
  /* ------------------------------------------------------------------ */
  function openOverlay(node) {
    state.lastFocus = document.activeElement;
    node.hidden = false;
    node.dataset.open = 'true';
    const field = node.querySelector('input, button');
    if (field) setTimeout(() => field.focus(), 20);
  }

  function closeOverlay(node) {
    if (!node || node.hidden) return;
    node.hidden = true;
    delete node.dataset.open;
    if (state.lastFocus && typeof state.lastFocus.focus === 'function') {
      state.lastFocus.focus();
      state.lastFocus = null;
    }
  }

  function anyOverlayOpen() {
    return U.$$('.overlay').some((node) => !node.hidden);
  }

  /* ------------------------------------------------------------------ */
  /* Command palette                                                    */
  /* ------------------------------------------------------------------ */
  const palette = document.getElementById('palette');
  const paletteInput = document.getElementById('palette-input');
  const paletteResults = document.getElementById('palette-results');
  let paletteRecords = { drafts: [], documents: [], events: [], tasks: [], conversations: [] };

  function navItems() {
    return state.boot.workspaces.map((w) => ({
      group: 'Workspaces',
      title: w.name,
      subtitle: w.tagline,
      hint: w.shortcut ? `${modLabel} ${w.shortcut}` : '',
      run: () => { window.location.href = w.path; },
    }));
  }

  function recordItems() {
    const items = [];
    paletteRecords.conversations.forEach((c) => {
      items.push({
        group: 'Conversations',
        title: c.title,
        subtitle: `Abyss · ${c.message_count} message${c.message_count === 1 ? '' : 's'}`,
        run: () => { window.location.href = `/abyss?conversation=${c.id}`; },
      });
    });
    paletteRecords.drafts.forEach((d) => {
      items.push({
        group: 'Drafts',
        title: d.title,
        subtitle: `Quill · ${d.words} words`,
        run: () => { window.location.href = `/quill?draft=${d.id}`; },
      });
    });
    paletteRecords.documents.forEach((d) => {
      items.push({
        group: 'Files',
        title: d.title,
        subtitle: `Forge · ${d.format.toUpperCase()} · ${U.filesize(d.bytes)}`,
        run: () => { window.location.href = '/library'; },
      });
    });
    paletteRecords.events.forEach((e) => {
      items.push({
        group: 'Events',
        title: e.title,
        subtitle: `Kronos · ${U.formatDateTime(e.start_at)}`,
        run: () => { window.location.href = '/kronos'; },
      });
    });
    paletteRecords.tasks.forEach((t) => {
      items.push({
        group: 'Tasks',
        title: t.title,
        subtitle: `Working Board · ${t.status.replace('_', ' ')}`,
        run: () => { window.location.href = `/working-board?task=${t.id}`; },
      });
    });
    return items;
  }

  async function loadPaletteRecords() {
    try {
      const [conversations, drafts, documents, tasks, events] = await Promise.all([
        api.get('/api/abyss/conversations').catch(() => null),
        api.get('/api/quill/drafts').catch(() => null),
        api.get('/api/forge/documents').catch(() => null),
        api.get('/api/tasks/').catch(() => null),
        api.get('/api/kronos/events').catch(() => null),
      ]);
      paletteRecords = {
        conversations: (conversations && conversations.conversations) || [],
        drafts: (drafts && drafts.drafts) || [],
        documents: (documents && documents.documents) || [],
        tasks: (tasks && tasks.tasks) || [],
        events: (events && events.events) || [],
      };
    } catch (err) {
      paletteRecords = { drafts: [], documents: [], events: [], tasks: [], conversations: [] };
    }
  }

  function commandItems() {
    return [
      {
        group: 'Actions',
        title: 'New conversation in Abyss',
        subtitle: 'Start a fresh assistant thread',
        run: () => { window.location.href = '/abyss?new=1'; },
      },
      {
        group: 'Actions',
        title: 'Create a document in Forge',
        subtitle: 'PPTX, DOCX, XLSX, PDF, Markdown, PNG',
        run: () => { window.location.href = '/forge'; },
      },
      {
        group: 'Actions',
        title: 'Start a draft in Quill',
        subtitle: 'Open a blank writing surface',
        run: () => { window.location.href = '/quill?new=1'; },
      },
      {
        group: 'Actions',
        title: 'Toggle local-only mode',
        subtitle: 'Blocks or allows outbound provider requests',
        run: async () => {
          const current = state.boot.settings.local_only;
          try {
            await api.post('/api/settings', { local_only: !current });
            U.success(current ? 'Network access enabled.' : 'Local-only mode on.');
            setTimeout(() => window.location.reload(), 500);
          } catch (err) {
            U.error(err.message);
          }
        },
      },
      {
        group: 'Actions',
        title: 'Export a backup',
        subtitle: 'JSON of your local data, without API keys',
        run: async () => {
          try {
            await api.download('/api/backup', 'opspine-backup.json');
            U.success('Backup downloaded.');
          } catch (err) {
            U.error(err.message);
          }
        },
      },
      {
        group: 'Help',
        title: 'Keyboard shortcuts',
        subtitle: 'See every shortcut OPSpine supports',
        run: () => openHelp(),
      },
    ];
  }

  function renderPalette(query) {
    const term = query.trim().toLowerCase();
    let items = navItems().concat(commandItems()).concat(recordItems());
    if (term) {
      items = items.filter((item) =>
        `${item.title} ${item.subtitle} ${item.group}`.toLowerCase().includes(term)
      );
    }

    state.paletteItems = items.slice(0, 40);
    state.paletteIndex = 0;

    U.clear(paletteResults);
    if (!state.paletteItems.length) {
      paletteResults.appendChild(
        U.el('p', {
          class: 'palette__empty',
          text: `Nothing matches “${query}”. Try a workspace name, a draft title, or an action.`,
        })
      );
      return;
    }

    let group = '';
    state.paletteItems.forEach((item, index) => {
      if (item.group !== group) {
        group = item.group;
        paletteResults.appendChild(U.el('p', { class: 'palette__group', text: group }));
      }
      const row = U.el('button', {
        class: `palette__item${index === 0 ? ' is-active' : ''}`,
        type: 'button',
        role: 'option',
        dataset: { index: String(index) },
        onClick: () => runPaletteItem(index),
      }, [
        U.el('span', { class: 'palette__item-body' }, [
          U.el('span', { class: 'palette__item-title', text: item.title }),
          U.el('span', { class: 'palette__item-sub', text: item.subtitle || '' }),
        ]),
        item.hint ? U.el('kbd', { text: item.hint }) : null,
      ]);
      paletteResults.appendChild(row);
    });
  }

  function highlight(index) {
    const rows = U.$$('.palette__item', paletteResults);
    if (!rows.length) return;
    state.paletteIndex = (index + rows.length) % rows.length;
    rows.forEach((row, i) => row.classList.toggle('is-active', i === state.paletteIndex));
    rows[state.paletteIndex].scrollIntoView({ block: 'nearest' });
  }

  function runPaletteItem(index) {
    const item = state.paletteItems[index];
    if (!item) return;
    closeOverlay(palette);
    item.run();
  }

  function openPalette() {
    if (!palette.hidden) {
      closeOverlay(palette);
      return;
    }
    openOverlay(palette);
    paletteInput.value = '';
    renderPalette('');
    loadPaletteRecords().then(() => renderPalette(paletteInput.value));
    setTimeout(() => paletteInput.focus(), 30);
  }

  /* ------------------------------------------------------------------ */
  /* Shortcut help                                                      */
  /* ------------------------------------------------------------------ */
  const help = document.getElementById('help');

  function openHelp() {
    openOverlay(help);
  }

  /* ------------------------------------------------------------------ */
  /* Primary action                                                     */
  /* ------------------------------------------------------------------ */
  function registerPrimary(label, handler) {
    state.primaryAction = handler;
    const hint = document.querySelector('[data-shortcut-hint]');
    if (hint && label) hint.textContent = label;
  }

  function runPrimary() {
    if (typeof state.primaryAction !== 'function') {
      U.toast('This workspace has no primary action on this screen.');
      return;
    }
    state.primaryAction();
  }

  /* ------------------------------------------------------------------ */
  /* Keyboard                                                           */
  /* ------------------------------------------------------------------ */
  function isTyping(target) {
    if (!target) return false;
    const tag = target.tagName;
    return (
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
      target.isContentEditable
    );
  }

  function navigateToShortcut(digit) {
    const target = state.boot.workspaces.find((w) => w.shortcut === digit);
    if (target) {
      window.location.href = target.path;
      return true;
    }
    return false;
  }

  document.addEventListener('keydown', (event) => {
    const meta = event.metaKey || event.ctrlKey;
    const openNow = anyOverlayOpen();

    /* Escape closes whatever is open. */
    if (event.key === 'Escape') {
      const prompt = document.getElementById('prompt');
      if (prompt && !prompt.hidden) {
        U.closePrompt(null);
        event.preventDefault();
        return;
      }
      if (!document.getElementById('confirm').hidden) {
        U.closeConfirm(false);
        event.preventDefault();
        return;
      }
      if (!palette.hidden) {
        closeOverlay(palette);
        event.preventDefault();
        return;
      }
      if (!help.hidden) {
        closeOverlay(help);
        event.preventDefault();
      }
      return;
    }

    /* Focus trap inside the top overlay. */
    if (event.key === 'Tab' && openNow) {
      const overlay = U.$$('.overlay').find((node) => !node.hidden);
      if (overlay) {
        U.trapFocus(overlay.querySelector('.palette, .sheet, .confirm'), event);
      }
      return;
    }

    /* Ctrl/Cmd + K toggles the palette. */
    if (meta && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault();
      openPalette();
      return;
    }

    /* Palette navigation. */
    if (!palette.hidden) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        highlight(state.paletteIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        highlight(state.paletteIndex - 1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runPaletteItem(state.paletteIndex);
      }
      return;
    }

    /* Ctrl/Cmd + digit jumps between workspaces. */
    if (meta && /^[0-8]$/.test(event.key)) {
      if (navigateToShortcut(event.key)) {
        event.preventDefault();
      }
      return;
    }

    /* Ctrl/Cmd + Enter runs the current primary action. */
    if (meta && event.key === 'Enter') {
      event.preventDefault();
      runPrimary();
      return;
    }

    /* Ctrl + backslash toggles the sidebar. */
    if (meta && event.key === '\\') {
      event.preventDefault();
      toggleSidebar();
      return;
    }

    /* "?" opens shortcut help when not typing. */
    if (event.key === '?' && !isTyping(event.target)) {
      event.preventDefault();
      openHelp();
    }
  });

  /* Palette input handling. */
  paletteInput.addEventListener('input', () => renderPalette(paletteInput.value));

  /* ------------------------------------------------------------------ */
  /* Action delegation                                                  */
  /* ------------------------------------------------------------------ */
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    switch (action) {
      case 'toggle-sidebar':
        event.preventDefault();
        toggleSidebar();
        break;
      case 'toggle-theme':
        event.preventDefault();
        toggleTheme();
        break;
      case 'open-palette':
        event.preventDefault();
        openPalette();
        break;
      case 'close-palette':
        closeOverlay(palette);
        break;
      case 'open-help':
        event.preventDefault();
        openHelp();
        break;
      case 'close-help':
        closeOverlay(help);
        break;
      case 'close-confirm':
        U.closeConfirm(false);
        break;
      case 'close-prompt':
        U.closePrompt(null);
        break;
      default:
        break;
    }
  });

  document.getElementById('confirm-accept').addEventListener('click', () => {
    U.closeConfirm(true);
  });

  /* Every styled switch renders its real checkbox as a visually hidden
     sibling. Label forwarding handles the common case, but this makes the
     track itself an explicit control so the switch works even where label
     activation is not forwarded. preventDefault stops a double toggle. */
  document.addEventListener('click', (event) => {
    const track = event.target.closest('.switch__track');
    if (!track || !track.parentElement) return;
    const input = track.parentElement.querySelector('input[type="checkbox"]');
    if (!input || input.disabled) return;
    event.preventDefault();
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const promptForm = document.getElementById('prompt-form');
  if (promptForm) {
    promptForm.addEventListener('submit', (event) => {
      event.preventDefault();
      U.closePrompt(document.getElementById('prompt-input').value);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Responsive reset                                                   */
  /* ------------------------------------------------------------------ */
  let wasPhone = isPhone();

  window.addEventListener('resize', U.debounce(() => {
    const nowPhone = isPhone();
    if (nowPhone !== wasPhone) {
      wasPhone = nowPhone;
      const restore = document.getElementById('sidebar-restore');
      if (restore) restore.hidden = true;
      if (nowPhone && shell && shell.dataset.sidebarCollapsed === 'false') {
        shell.dataset.sidebarCollapsed = 'true';
      }
    }
    const restore = document.getElementById('sidebar-restore');
    if (restore && !isPhone() && shell) {
      restore.hidden = shell.dataset.sidebarCollapsed !== 'true';
    }
  }, 160));

  /* Close phone drawers after navigating. */
  U.$$('.nav__item').forEach((link) => {
    link.addEventListener('click', () => {
      if (isPhone() && shell) {
        shell.dataset.sidebarCollapsed = 'true';
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /* Theme                                                              */
  /* ------------------------------------------------------------------ */
  function currentTheme() {
    return document.documentElement.dataset.theme || 'light';
  }

  /* A workspace that has not been converted to the light palette pins itself
     to dark server-side. The toggle must respect that pin, otherwise clicking
     it repaints the page light and the room's light-on-dark text disappears. */
  function themeReady() {
    return document.documentElement.dataset.themeReady === 'true';
  }

  function setTheme(theme, persist = true) {
    const next = theme === 'dark' ? 'dark' : 'light';
    if (!themeReady() && next === 'light') {
      U.toast(
        'This workspace is still dark-only. It gains the light theme with its '
        + 'next redesign — your saved theme is unchanged.',
        'info',
        5000
      );
      return;
    }
    document.documentElement.dataset.theme = next;
    document.dispatchEvent(new CustomEvent('opspine:theme', { detail: { theme: next } }));
    if (persist) saveChrome({ theme: next });
  }

  function toggleTheme() {
    if (!themeReady()) {
      setTheme('light'); // explains why nothing changed
      return;
    }
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }

  /* ------------------------------------------------------------------ */
  /* Startup                                                            */
  /* ------------------------------------------------------------------ */
  function init() {
    if (isPhone() && shell) {
      shell.dataset.sidebarCollapsed = 'true';
    }
    const restore = document.getElementById('sidebar-restore');
    if (restore) restore.hidden = true;

    /* Show the platform-correct modifier on static markup. */
    U.$$('kbd').forEach((node) => {
      if (/^Ctrl|Ctrl /.test(node.textContent)) {
        node.textContent = node.textContent.replace(/Ctrl/g, modLabel);
      }
    });
    document.querySelectorAll('[data-mod]').forEach((node) => {
      node.textContent = node.textContent.replace(/Ctrl/g, modLabel);
    });

    /* Keyboard theme switch, alongside the toolbar button. */
    document.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      if (event.key !== 't' && event.key !== 'T') return;
      event.preventDefault();
      toggleTheme();
    });

    window.OPS.shell.ready = true;
    document.dispatchEvent(new CustomEvent('opspine:ready'));
  }

  window.OPS.shell = {
    state,
    registerPrimary,
    runPrimary,
    openPalette,
    openHelp,
    toggleSidebar,
    setSidebarCollapsed,
    applyChrome,
    setTheme,
    toggleTheme,
    currentTheme,
    themeReady,
    isMac,
    modLabel,
    ready: false,
    refreshActivity: async function () {
      try {
        const data = await api.get('/api/activity?limit=6');
        const host = document.getElementById('tools-recent');
        if (!host) return;
        U.clear(host);
        if (!data.activity.length) {
          host.appendChild(
            U.el('li', {
              class: 'tools__empty',
              text: 'No activity yet. Anything you create will show up here.',
            })
          );
          return;
        }
        data.activity.forEach((item) => {
          host.appendChild(U.el('li', {}, [
            U.el('a', { href: item.target || `/${item.workspace}` }, [
              U.el('span', { class: 'tools__recent-ws', text: item.workspace_label }),
              U.el('span', { class: 'tools__recent-label', text: item.label }),
              U.el('time', { text: U.relativeTime(item.created_at) }),
            ]),
          ]));
        });
      } catch (err) {
        /* Non-critical panel. */
      }
    },
  };

  init();
})();
