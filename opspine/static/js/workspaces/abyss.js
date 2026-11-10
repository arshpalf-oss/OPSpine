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
    toolSelect: document.getElementById('tool-select'),
    toolInput: document.getElementById('tool-input'),
    toolRun: document.getElementById('tool-run'),
    toolOutput: document.getElementById('tool-output'),
    toolOutLabel: document.getElementById('tool-out-label'),
    toolOutBody: document.getElementById('tool-out-body'),
    toolCopy: document.getElementById('tool-copy'),
    toolNote: document.getElementById('tool-note'),
    toolList: document.getElementById('abyss-tool-list'),
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
    tools: [],
    busy: false,
    lastToolResult: '',
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
  /* Local tools                                                        */
  /* ------------------------------------------------------------------ */
  async function loadTools() {
    try {
      const data = await api.get('/api/abyss/tools');
      state.tools = data.tools;
      U.clear(dom.toolSelect);
      data.tools.forEach((tool) => {
        dom.toolSelect.appendChild(U.el('option', { value: tool.id, text: tool.label }));
      });
      dom.toolNote.textContent = data.note;
      U.clear(dom.toolList);
      data.tools.slice(0, 6).forEach((tool) => {
        dom.toolList.appendChild(U.el('li', {}, [
          U.el('span', { text: tool.label }),
          U.el('kbd', { text: 'offline' }),
        ]));
      });
    } catch (err) {
      dom.toolNote.textContent = `Local tools unavailable: ${err.message}`;
    }
  }

  async function runTool() {
    const tool = dom.toolSelect.value;
    const text = dom.toolInput.value;
    if (!text.trim()) {
      U.error('Paste some text first.');
      dom.toolInput.focus();
      return;
    }

    dom.toolRun.disabled = true;
    dom.toolRun.textContent = 'Running…';
    try {
      const data = await api.post('/api/abyss/tools/run', { tool, text });
      const label = (state.tools.find((t) => t.id === tool) || {}).label || tool;
      dom.toolOutLabel.textContent = `Local tool · ${label}`;
      dom.toolOutput.hidden = false;

      if (data.result.kind === 'stats') {
        const lines = Object.entries(data.result.result)
          .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
          .join('\n');
        dom.toolOutBody.textContent = lines;
        state.lastToolResult = lines;
      } else if (data.result.kind === 'terms') {
        const terms = data.result.result.join(', ');
        dom.toolOutBody.textContent = terms;
        state.lastToolResult = terms;
      } else {
        dom.toolOutBody.textContent = data.result.result;
        state.lastToolResult = data.result.result;
      }
      window.OPS.shell.refreshActivity();
    } catch (err) {
      dom.toolOutput.hidden = true;
      U.error(err.message);
    } finally {
      dom.toolRun.disabled = false;
      dom.toolRun.textContent = 'Run tool';
    }
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
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
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

  dom.toolRun.addEventListener('click', runTool);
  dom.toolCopy.addEventListener('click', () => {
    if (state.lastToolResult) U.copy(state.lastToolResult);
  });

  dom.useAi.addEventListener('change', () => {
    if (dom.useAi.checked && !state.providers.ai_available) {
      dom.useAi.checked = false;
      U.error('No provider is configured yet. Add a key in Settings first.');
    }
  });

  window.OPS.shell.registerPrimary('Send message', () => {
    if (document.activeElement === dom.toolInput) {
      runTool();
      return;
    }
    send();
  });

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
    await loadTools();

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
