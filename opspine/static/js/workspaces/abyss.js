/* ==========================================================================
   Abyss — a chat application

   Owns its own chrome: a conversation-history rail on the left and a toolbox
   on the right. Both collapse independently. Nothing here depends on the
   global workspace sidebar, which this page does not render.

   Honesty rules that must not regress:
   - replies are labelled with what produced them (provider / local tool / notice)
   - with no provider, the UI says so instead of inventing an answer
   ========================================================================== */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;
  const shellState = window.OPS.shell.state;

  const root = document.getElementById('chat');
  if (!root) return;

  const dom = {
    convs: document.getElementById('abyss-convs'),
    messages: document.getElementById('abyss-messages'),
    thread: document.getElementById('abyss-thread'),
    form: document.getElementById('abyss-form'),
    input: document.getElementById('abyss-input'),
    send: document.getElementById('abyss-send'),
    status: document.getElementById('abyss-status'),
    search: document.getElementById('abyss-search'),
    useAi: document.getElementById('abyss-use-ai'),
    hint: document.getElementById('abyss-hint'),
    title: document.getElementById('abyss-title'),
    subtitle: document.getElementById('abyss-subtitle'),
    modeLabel: document.getElementById('abyss-mode-label'),
    provCard: document.getElementById('abyss-prov-card'),
    slashMenu: document.getElementById('slash-menu'),
    slashList: document.getElementById('slash-list'),
    slashLabel: document.getElementById('slash-label'),
    apps: document.getElementById('abyss-apps'),
    navCollapse: document.getElementById('nav-collapse'),
    navOpen: document.getElementById('nav-open'),
    toolsToggle: document.getElementById('tools-toggle'),
    scrim: document.getElementById('chat-scrim'),
    toolsCollapse: document.getElementById('tools-collapse'),
  };

  const state = {
    conversations: [],
    current: null,
    providers: shellState.boot.providers,
    busy: false,
    /* Slash-command menu state. */
    slashMatches: [],
    slashIndex: 0,
  };

  /* ------------------------------------------------------------------ */
  /* Sidebars                                                           */
  /* ------------------------------------------------------------------ */
  function navIsExpanded() {
    return root.dataset.nav !== 'collapsed';
  }

  function setNav(expanded, persist = true) {
    root.dataset.nav = expanded ? 'expanded' : 'collapsed';
    if (dom.navOpen) dom.navOpen.setAttribute('aria-expanded', String(expanded));
    if (persist) {
      api.post('/api/settings', { abyss_nav: expanded ? 'expanded' : 'collapsed' })
        .catch(() => { /* chrome state is cosmetic */ });
    }
  }

  function toolsAreOpen() {
    return root.dataset.tools === '0';
  }

  function setTools(open, persist = true) {
    root.dataset.tools = open ? '0' : '1';
    if (dom.toolsToggle) dom.toolsToggle.setAttribute('aria-expanded', String(open));
    if (persist) {
      api.post('/api/settings', { tools_collapsed: open ? 0 : 1 })
        .catch(() => { /* chrome state is cosmetic */ });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Provider status                                                    */
  /* ------------------------------------------------------------------ */
  function renderStatus() {
    const p = state.providers;
    U.clear(dom.status);

    const chips = [];
    chips.push(
      p.local_only
        ? { text: 'Local-only mode', cls: 'chip--good' }
        : { text: 'Network enabled', cls: 'chip--warn' }
    );
    chips.push(
      p.ai_available
        ? { text: `Provider · ${p.ai_provider}`, cls: 'chip--accent' }
        : { text: 'No AI provider configured', cls: '' }
    );

    chips.forEach((chip) => {
      dom.status.appendChild(
        U.el('span', { class: `chip ${chip.cls}`.trim(), text: chip.text })
      );
    });

    dom.useAi.checked = Boolean(p.ai_available);
    dom.useAi.disabled = !p.ai_available;
    dom.useAi.closest('.chat-switch').title = p.ai_available
      ? 'Send messages to the configured provider'
      : 'Configure a provider in Settings to enable this';

    if (dom.modeLabel) {
      dom.modeLabel.textContent = p.local_only ? 'Local-only' : 'Network on';
    }

    dom.hint.textContent = p.ai_available
      ? `Messages go to ${p.ai_provider} while “Use provider” is on. Turn it off to stay local.`
      : p.local_only
        ? 'Local-only mode is on. Local tools run offline — no request leaves this machine.'
        : 'No provider configured. Use the local tools, or add a key in Settings.';

    U.clear(dom.provCard);
    [
      ['Mode', p.local_only ? 'Local-only' : 'Network enabled'],
      ['AI provider', p.ai_available ? p.ai_provider : 'Not configured'],
      ['Research provider', p.search_available ? p.search_provider : 'Not configured'],
    ].forEach(([label, value]) => {
      dom.provCard.appendChild(
        U.el('div', { class: 'prov-card__row' }, [
          U.el('span', { text: label }),
          U.el('span', { text: value }),
        ])
      );
    });
  }

  /* ------------------------------------------------------------------ */
  /* Conversation list                                                  */
  /* ------------------------------------------------------------------ */
  async function loadConversations(query = '') {
    try {
      const data = await api.get(
        `/api/abyss/conversations${query ? `?q=${encodeURIComponent(query)}` : ''}`
      );
      state.conversations = data.conversations;
      renderConversations();
    } catch (err) {
      U.clear(dom.convs);
      dom.convs.appendChild(U.el('li', { class: 'chat-list__empty', text: err.message }));
    }
  }

  function renderConversations() {
    U.clear(dom.convs);

    if (!state.conversations.length) {
      dom.convs.appendChild(
        U.el('li', {
          class: 'chat-list__empty',
          text: dom.search.value
            ? 'No conversations match that search.'
            : 'No conversations yet. Send a message to begin one.',
        })
      );
      return;
    }

    /* Group by recency the way ChatGPT does: Today / Previous 7 days / Older. */
    const groups = new Map([
      ['Today', []],
      ['Previous 7 days', []],
      ['Older', []],
    ]);
    const dayMs = 86400000;
    const now = Date.now();

    state.conversations.forEach((conversation) => {
      const age = now - conversation.updated_at * 1000;
      const bucket = age < dayMs ? 'Today' : age < dayMs * 7 ? 'Previous 7 days' : 'Older';
      groups.get(bucket).push(conversation);
    });

    groups.forEach((items, label) => {
      if (!items.length) return;
      dom.convs.appendChild(U.el('li', { class: 'chat-list__group', text: label }));
      items.forEach((conversation) => {
        dom.convs.appendChild(conversationRow(conversation));
      });
    });
  }

  function conversationRow(conversation) {
    const active = state.current && state.current.id === conversation.id;
    return U.el('li', {}, [
      U.el('div', { class: `conv${active ? ' is-active' : ''}` }, [
        U.el('button', {
          class: 'conv__open',
          type: 'button',
          onClick: () => selectConversation(conversation.id),
        }, [
          U.el('span', { class: 'conv__title', text: conversation.title }),
        ]),
        U.el('span', { class: 'conv__actions' }, [
          U.el('button', {
            class: 'conv__btn',
            type: 'button',
            'aria-label': `Rename ${conversation.title}`,
            title: 'Rename',
            html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M16 4l4 4L8 20H4v-4z"/></svg>',
            onClick: (event) => {
              event.stopPropagation();
              renameConversation(conversation);
            },
          }),
          U.el('button', {
            class: 'conv__btn',
            type: 'button',
            'aria-label': `Delete ${conversation.title}`,
            title: 'Delete',
            html: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"/></svg>',
            onClick: (event) => {
              event.stopPropagation();
              deleteConversation(conversation);
            },
          }),
        ]),
      ]),
    ]);
  }

  async function renameConversation(conversation) {
    const next = window.prompt('Rename conversation', conversation.title);
    if (next === null) return;
    const title = next.trim();
    if (!title) {
      U.error('A conversation needs a title.');
      return;
    }
    try {
      await api.patch(`/api/abyss/conversations/${conversation.id}`, { title });
      await loadConversations(dom.search.value);
      if (state.current && state.current.id === conversation.id) {
        state.current.title = title;
        dom.title.textContent = title;
      }
      U.success('Conversation renamed.');
    } catch (err) {
      U.error(err.message);
    }
  }

  async function deleteConversation(conversation) {
    const confirmed = await U.confirm({
      title: 'Delete conversation?',
      message: `“${conversation.title}” and its messages will be removed from this machine. This cannot be undone.`,
      confirmLabel: 'Delete conversation',
    });
    if (!confirmed) return;

    try {
      await api.del(`/api/abyss/conversations/${conversation.id}`);
      if (state.current && state.current.id === conversation.id) {
        state.current = null;
      }
      await loadConversations(dom.search.value);
      renderThread();
      dom.title.textContent = 'New chat';
      dom.subtitle.textContent = 'Abyss';
      U.success('Conversation deleted.');
    } catch (err) {
      U.error(err.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Thread                                                             */
  /* ------------------------------------------------------------------ */
  function sourceLabel(source) {
    if (!source) return { text: 'unknown', cls: '' };
    if (source === 'user') return { text: 'You', cls: '' };
    if (source.startsWith('provider:')) {
      return { text: `via ${source.split(':')[1]}`, cls: 'is-provider' };
    }
    if (source.startsWith('local-tool:')) {
      return { text: `local tool · ${source.split(':')[1]}`, cls: '' };
    }
    if (source === 'system-notice') return { text: 'from OPSpine', cls: '' };
    return { text: source, cls: '' };
  }

  function messageNode(message) {
    const meta = sourceLabel(message.source);
    const isAssistant = message.role === 'assistant';
    const isNotice = message.source === 'system-notice';

    return U.el('article', {
      class: `msg msg--${isAssistant ? 'assistant' : 'user'}${isNotice ? ' msg--notice' : ''}`,
    }, [
      U.el('div', { class: 'msg__who' }, [
        U.el('span', { text: isAssistant ? 'Abyss' : 'You' }),
        isAssistant || isNotice
          ? U.el('span', { class: `msg__source ${meta.cls}`.trim(), text: meta.text })
          : null,
        U.el('time', { class: 'msg__time', text: U.relativeTime(message.created_at) }),
      ]),
      U.el('div', { class: 'msg__body', text: message.content }),
    ]);
  }

  function welcomeNode() {
    /* Suggestions are local tools, which genuinely work offline. */
    const suggestions = [
      'Count the words in this paragraph',
      'Summarise these notes offline',
      'Turn this list into bullets',
    ];

    const node = U.el('div', { class: 'welcome' }, [
      U.el('div', {
        class: 'welcome__orb',
        html: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke-linecap="round"/></svg>',
      }),
      U.el('h2', { text: 'How can I help?' }),
      U.el('p', {
        text: state.providers.ai_available
          ? `A configured provider (${state.providers.ai_provider}) is ready. Messages are sent there only while “Use provider” is on.`
          : 'No language model is connected, and OPSpine will not pretend otherwise. The local tools in the toolbox run offline right now; a provider can be added in Settings.',
      }),
    ]);

    const chips = U.el('div', { class: 'welcome__examples' });
    suggestions.forEach((text) => {
      chips.appendChild(U.el('button', {
        class: 'welcome__chip',
        type: 'button',
        onClick: () => {
          dom.input.value = text;
          dom.input.focus();
          autoGrow();
        },
      }, text));
    });
    node.appendChild(chips);
    return node;
  }

  function renderThread() {
    U.clear(dom.messages);
    if (!state.current || !state.current.messages.length) {
      dom.messages.appendChild(welcomeNode());
      return;
    }
    state.current.messages.forEach((message) => {
      dom.messages.appendChild(messageNode(message));
    });
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      dom.thread.scrollTop = dom.thread.scrollHeight;
    });
  }

  async function selectConversation(id) {
    try {
      const data = await api.get(`/api/abyss/conversations/${id}`);
      state.current = data.conversation;
      state.providers = data.providers || state.providers;
      dom.title.textContent = state.current.title;
      dom.subtitle.textContent = `${state.current.messages.length} message${
        state.current.messages.length === 1 ? '' : 's'
      }`;
      renderStatus();
      renderThread();
      renderConversations();
      if (window.matchMedia('(max-width: 780px)').matches) setNav(false, false);
      dom.input.focus();
    } catch (err) {
      U.error(err.message);
    }
  }

  async function createConversation(firstMessage) {
    const title = firstMessage ? firstMessage.slice(0, 70) : 'New chat';
    const data = await api.post('/api/abyss/conversations', { title });
    state.current = data.conversation;
    state.current.messages = state.current.messages || [];
    dom.title.textContent = state.current.title;
    dom.subtitle.textContent = 'Abyss';
    renderThread();
    return state.current;
  }

  /* ------------------------------------------------------------------ */
  /* Sending                                                            */
  /* ------------------------------------------------------------------ */
  async function send() {
    const content = dom.input.value.trim();
    if (!content || state.busy) return;

    state.busy = true;
    dom.send.disabled = true;
    dom.input.value = '';
    autoGrow();

    let pending = null;
    try {
      if (!state.current) {
        await createConversation(content);
      }

      const optimistic = {
        id: `tmp-${Date.now()}`,
        role: 'user',
        content,
        source: 'user',
        created_at: Date.now() / 1000,
      };
      state.current.messages.push(optimistic);
      U.clear(dom.messages);
      state.current.messages.forEach((m) => dom.messages.appendChild(messageNode(m)));
      scrollToBottom();

      pending = U.el('article', { class: 'msg msg--assistant' }, [
        U.el('div', { class: 'msg__body' }, [U.el('span', { class: 'spinner' })]),
      ]);
      dom.messages.appendChild(pending);
      scrollToBottom();

      const data = await api.post(
        `/api/abyss/conversations/${state.current.id}/messages`,
        { content, use_ai: dom.useAi.checked && !dom.useAi.disabled }
      );

      state.providers = data.status || state.providers;
      await selectConversation(state.current.id);
      await loadConversations(dom.search.value);
      renderStatus();

      if (data.mode === 'provider') {
        U.success(`Reply received from ${data.provider}.`);
      } else if (data.mode === 'local-tool') {
        U.toast('That request maps to a local tool — run it from the toolbox.');
      }
      window.OPS.shell.refreshActivity();
    } catch (err) {
      if (pending) pending.remove();
      U.error(err.message);
      dom.input.value = content;
      autoGrow();
      if (state.current) selectConversation(state.current.id);
    } finally {
      state.busy = false;
      dom.send.disabled = false;
    }
  }

  function autoGrow() {
    dom.input.style.height = 'auto';
    dom.input.style.height = `${Math.min(dom.input.scrollHeight, 170)}px`;
  }

  /* ------------------------------------------------------------------ */
  /* Slash commands — the offline text tools, inline in the composer    */
  /* ------------------------------------------------------------------ */
  /* Each entry runs a deterministic local tool against whatever is in the
     composer. They used to live in the right-hand toolbox; acting on the
     draft in place is the point, so they belong in the composer. */
  const SLASH_COMMANDS = [
    { cmd: 'sort',      tool: 'sort_lines',    hint: 'Sort the lines in the draft' },
    { cmd: 'dedupe',    tool: 'dedupe_lines',  hint: 'Remove duplicate lines' },
    { cmd: 'count',     tool: 'stats',         hint: 'Word, character and sentence counts' },
    { cmd: 'bullets',   tool: 'bullets',       hint: 'Turn the draft into bullet points' },
    { cmd: 'summary',   tool: 'summary',       hint: 'Extractive summary of the draft' },
    { cmd: 'terms',     tool: 'key_terms',     hint: 'Pull out key terms' },
    { cmd: 'slug',      tool: 'slug',          hint: 'URL slug from the draft' },
    { cmd: 'upper',     tool: 'uppercase',     hint: 'Uppercase the draft' },
    { cmd: 'lower',     tool: 'lowercase',     hint: 'Lowercase the draft' },
    { cmd: 'title',     tool: 'title_case',    hint: 'Title-case the draft' },
    { cmd: 'sentence',  tool: 'sentence_case', hint: 'Sentence-case the draft' },
    { cmd: 'strip',     tool: 'strip_blank',   hint: 'Collapse blank lines' },
  ];

  const SLASH_ACTIONS = [
    { cmd: 'help', hint: 'List every slash command', action: 'help' },
    { cmd: 'clear', hint: 'Clear the composer', action: 'clear' },
  ];

  const ALL_SLASH = SLASH_COMMANDS.concat(SLASH_ACTIONS);

  function renderApps() {
    if (!dom.apps) return;
    const apps = (shellState.boot.workspaces || []).filter(
      (item) => item.key !== 'abyss' && item.chrome !== 'launcher'
    );
    U.clear(dom.apps);
    apps.forEach((item) => {
      dom.apps.appendChild(U.el('li', {}, [
        U.el('a', { class: 'app-link', href: item.path }, [
          U.el('span', { class: 'app-link__name', text: item.name }),
          U.el('span', { class: 'app-link__tag', text: item.tagline }),
        ]),
      ]));
    });
  }

  /* A draft that opens with "/word" is a command; everything after it is the
     text it works on. Ordinary prose containing "/" never triggers the menu. */
  function slashQuery() {
    const match = /^\s*\/([a-z]*)/.exec(dom.input.value);
    return match ? match[1] : null;
  }

  function closeSlash() {
    dom.slashMenu.hidden = true;
    state.slashIndex = 0;
    state.slashMatches = [];
  }

  function renderSlash() {
    const query = slashQuery();
    if (query === null) {
      closeSlash();
      return;
    }
    const term = query.toLowerCase();
    const matches = ALL_SLASH.filter((entry) => entry.cmd.startsWith(term));
    state.slashMatches = matches;

    if (!matches.length) {
      U.clear(dom.slashList);
      dom.slashList.appendChild(
        U.el('li', { class: 'slash__empty', text: `No command starts with “${term}”.` })
      );
      dom.slashMenu.hidden = false;
      return;
    }

    if (state.slashIndex >= matches.length) state.slashIndex = 0;
    U.clear(dom.slashList);
    matches.forEach((entry, index) => {
      dom.slashList.appendChild(U.el('li', { role: 'presentation' }, [
        U.el('button', {
          class: `slash__item${index === state.slashIndex ? ' is-active' : ''}`,
          type: 'button',
          role: 'option',
          'aria-selected': String(index === state.slashIndex),
          onClick: () => runSlash(entry),
        }, [
          U.el('span', { class: 'slash__cmd', text: `/${entry.cmd}` }),
          U.el('span', { class: 'slash__hint', text: entry.hint }),
        ]),
      ]));
    });
    dom.slashMenu.hidden = false;
  }

  /* The draft without its /command token: the command is syntax, not text,
     so it must never end up inside the sorted/counted output. */
  function slashDraft() {
    return dom.input.value.replace(/^\s*\/[a-z]+\s*/, '');
  }

  /* The result replaces the whole draft, so what you see is exactly the text
     you can now send, copy or keep editing. */
  function setDraft(text) {
    dom.input.value = text;
    const position = text.length;
    dom.input.setSelectionRange(position, position);
    autoGrow();
  }

  async function runSlash(entry) {
    closeSlash();

    /* A command with no text would replace the draft with an empty result, so
       say what is missing and keep whatever you typed. */
    if (entry.action !== 'clear' && entry.action !== 'help' && !slashDraft().trim()) {
      U.error(`/${entry.cmd} needs some text — type or paste a draft, then run it.`);
      dom.input.focus();
      return;
    }

    if (entry.action === 'clear') {
      setDraft('');
      dom.input.focus();
      return;
    }
    if (entry.action === 'help') {
      const lines = SLASH_COMMANDS.map((item) => `/${item.cmd.padEnd(9)} ${item.hint}`);
      setDraft(lines.join('\n'));
      U.toast('Slash commands listed in the composer.');
      dom.input.focus();
      return;
    }

    const draft = slashDraft().trim();
    if (!draft) {
      U.error('Nothing to work on yet — write a line, then use the command.');
      dom.input.focus();
      return;
    }

    try {
      const data = await api.post('/api/abyss/tools/run', {
        tool: entry.tool, text: draft,
      });
      const result = data.result;
      let text;
      if (result.kind === 'stats') {
        text = Object.entries(result.result)
          .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
          .join('\n');
      } else if (result.kind === 'terms') {
        text = result.result.join(', ');
      } else {
        text = String(result.result);
      }
      setDraft(text);
      U.success(`/${entry.cmd} ran offline on your draft.`);
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    }
    dom.input.focus();
  }

  function moveSlash(delta) {
    if (!state.slashMatches.length) return;
    state.slashIndex = (state.slashIndex + delta + state.slashMatches.length)
      % state.slashMatches.length;
    renderSlash();
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                             */
  /* ------------------------------------------------------------------ */
  dom.form.addEventListener('submit', (event) => {
    event.preventDefault();
    send();
  });

  dom.input.addEventListener('input', autoGrow);
  dom.input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    /* The slash menu owns Enter while it has matches. */
    if (!dom.slashMenu.hidden) return;
    event.preventDefault();
    send();
  });

  dom.search.addEventListener('input', U.debounce(() => {
    loadConversations(dom.search.value.trim());
  }, 220));

  document.getElementById('abyss-new').addEventListener('click', () => {
    state.current = null;
    dom.title.textContent = 'New chat';
    dom.subtitle.textContent = 'Abyss';
    renderThread();
    renderConversations();
    dom.input.focus();
  });

  dom.navCollapse.addEventListener('click', () => setNav(false));
  dom.navOpen.addEventListener('click', () => setNav(!navIsExpanded()));
  if (dom.scrim) dom.scrim.addEventListener('click', () => setTools(false));
  dom.toolsCollapse.addEventListener('click', () => setTools(false));
  dom.toolsToggle.addEventListener('click', () => setTools(!toolsAreOpen()));

  /* When the rail is an icon strip, its buttons expand the panel and scroll
     to the matching section. */
  root.querySelectorAll('[data-tool-section]').forEach((button) => {
    button.addEventListener('click', () => {
      setTools(true);
      const target = document.getElementById(`tool-section-${button.dataset.toolSection}`);
      if (!target) return;
      window.setTimeout(() => {
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 220);
    });
  });

  /* Escape closes the drawers on small screens. */
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (window.matchMedia('(max-width: 1020px)').matches && toolsAreOpen()) {
      setTools(false);
      return;
    }
    if (window.matchMedia('(max-width: 780px)').matches && navIsExpanded()) {
      setNav(false);
    }
  });

  /* The slash menu follows the composer. Arrow keys move through it, Enter
     runs the highlighted command instead of sending, Escape dismisses it. */
  dom.input.addEventListener('input', renderSlash);
  dom.input.addEventListener('click', renderSlash);
  dom.input.addEventListener('blur', () => {
    /* A click on a menu item must land before the menu closes. */
    window.setTimeout(closeSlash, 140);
  });

  dom.input.addEventListener('keydown', (event) => {
    if (dom.slashMenu.hidden) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSlash(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSlash(-1);
    } else if (event.key === 'Enter' && !event.shiftKey && state.slashMatches.length) {
      event.preventDefault();
      const entry = state.slashMatches[state.slashIndex] || state.slashMatches[0];
      runSlash(entry);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeSlash();
    }
  });

  dom.useAi.addEventListener('change', () => {
    if (dom.useAi.checked && !state.providers.ai_available) {
      dom.useAi.checked = false;
      U.error('No provider is configured yet. Add a key in Settings first.');
    }
  });

  window.OPS.shell.registerPrimary('Send message', () => send());

  /* ------------------------------------------------------------------ */
  /* Startup                                                            */
  /* ------------------------------------------------------------------ */
  /* A saved "expanded" is a desktop preference. On a narrow screen both
     sidebars are drawers, so they must start closed or they cover the
     thread on first paint. Done before the first await so it is applied
     in the same frame as the initial render. */
  function normaliseDrawers() {
    if (window.matchMedia('(max-width: 1020px)').matches && toolsAreOpen()) {
      setTools(false, false);
    }
    if (window.matchMedia('(max-width: 780px)').matches && navIsExpanded()) {
      setNav(false, false);
    }
  }

  async function init() {
    normaliseDrawers();
    renderStatus();
    renderApps();

    const params = new URLSearchParams(window.location.search);
    await loadConversations();

    const requested = Number(params.get('conversation'));
    if (params.get('new') === '1') {
      renderThread();
    } else if (requested) {
      await selectConversation(requested);
    } else if (state.conversations.length) {
      await selectConversation(state.conversations[0].id);
    } else {
      renderThread();
    }

    normaliseDrawers();
    dom.input.focus();
    autoGrow();
  }

  init();
})();
