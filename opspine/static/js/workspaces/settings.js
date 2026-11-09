/* ==========================================================================
   Settings — local-only switch, providers, motion, backup, data removal.
   ========================================================================== */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;
  const shell = window.OPS.shell;

  const root = document.querySelector('[data-settings]');
  if (!root) return;

  const dom = {
    localToggle: document.getElementById('set-local-toggle'),
    localBadge: document.getElementById('set-local-badge'),
    localCopy: document.getElementById('set-local-copy'),
    localStatus: document.getElementById('set-local-status'),
    providerAi: document.getElementById('set-provider-ai'),
    providerSearch: document.getElementById('set-provider-search'),
    motionGrid: document.getElementById('set-motion-grid'),
    capability: document.getElementById('set-capability'),
    exportBtn: document.getElementById('set-export'),
    importFile: document.getElementById('set-import-file'),
    importPreview: document.getElementById('set-import-preview'),
    importCounts: document.getElementById('set-import-counts'),
    importWarning: document.getElementById('set-import-warning'),
    importCancel: document.getElementById('set-import-cancel'),
    importConfirm: document.getElementById('set-import-confirm'),
    resetBtn: document.getElementById('set-reset'),
    pathDb: document.getElementById('set-path-db'),
  };

  const state = { settings: null, providers: null, pending: null };

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */
  function renderLocalOnly() {
    const on = state.settings.local_only;
    dom.localToggle.checked = on;
    dom.localBadge.textContent = on ? 'on' : 'off';
    dom.localBadge.classList.toggle('is-on', on);
    dom.localBadge.classList.toggle('is-off', !on);
    dom.localCopy.textContent = on
      ? 'AI and research providers are unreachable. Local tools still work.'
      : 'Outbound requests are allowed, but only to the providers you configure below.';
  }

  function renderStatus() {
    const p = state.providers;
    U.clear(dom.localStatus);

    const ai = p.configured_ai && p.configured_ai !== 'none' ? p.configured_ai : null;
    const srch = p.configured_search && p.configured_search !== 'none'
      ? p.configured_search
      : null;

    const chips = [
      {
        label: 'Local-only',
        value: p.local_only ? 'enforced' : 'off',
        kind: p.local_only ? 'good' : 'warn',
      },
      {
        label: 'AI provider',
        value: ai
          ? (p.ai_available ? `${ai} active` : `${ai} configured, blocked`)
          : 'none',
        kind: p.ai_available ? 'good' : '',
      },
      {
        label: 'Research provider',
        value: srch
          ? (p.search_available ? `${srch} active` : `${srch} configured, blocked`)
          : 'none',
        kind: p.search_available ? 'good' : '',
      },
    ];

    chips.forEach((chip) => {
      dom.localStatus.appendChild(U.el('span', {
        class: chip.kind ? `statuschip statuschip--${chip.kind}` : 'statuschip',
      }, [
        `${chip.label}: `,
        U.el('strong', { text: chip.value }),
      ]));
    });

    U.clear(dom.capability);
    [
      ['Local-only', p.local_only ? 'on' : 'off'],
      ['AI', p.ai_available ? p.ai_provider : 'none'],
      ['Search', p.search_available ? p.search_provider : 'none'],
    ].forEach(([label, value]) => {
      dom.capability.appendChild(U.el('div', {}, [
        U.el('dt', { text: label }),
        U.el('dd', { text: value }),
      ]));
    });
  }

  function renderSecrets() {
    const secrets = state.settings.secrets || {};
    Object.entries(secrets).forEach(([key, isSet]) => {
      const stateNode = root.querySelector(`[data-key-state="${key}"]`);
      if (stateNode) {
        stateNode.textContent = isSet ? 'stored' : 'not set';
        stateNode.classList.toggle('is-set', Boolean(isSet));
      }
      const provider = key.replace(/^key_/, '');
      const clearBtn = root.querySelector(`[data-key-clear="${provider}"]`);
      if (clearBtn) clearBtn.hidden = !isSet;
      const input = document.getElementById(`key-${provider}`);
      if (input) {
        input.value = '';
        input.placeholder = isSet ? '•••• stored — paste to replace' : 'Paste API key';
      }
    });
  }

  function renderMotion() {
    U.$$('.motioncard', dom.motionGrid).forEach((card) => {
      const active = card.dataset.motion === state.settings.motion;
      card.setAttribute('aria-checked', String(active));
    });
  }

  function renderAll() {
    dom.providerAi.value = state.settings.provider_ai || 'none';
    dom.providerSearch.value = state.settings.provider_search || 'none';
    renderLocalOnly();
    renderStatus();
    renderSecrets();
    renderMotion();
  }

  /* ------------------------------------------------------------------ */
  /* Loading                                                            */
  /* ------------------------------------------------------------------ */
  async function load() {
    try {
      const data = await api.get('/api/bootstrap');
      state.settings = data.settings;
      state.providers = data.providers;
      renderAll();
      const health = await api.get('/api/health').catch(() => null);
      if (health && health.data_path) {
        dom.pathDb.textContent = health.data_path;
      }
    } catch (err) {
      U.error(`Could not load settings: ${err.message}`);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Saving                                                             */
  /* ------------------------------------------------------------------ */
  async function save(payload, successMessage) {
    try {
      const data = await api.post('/api/settings', payload);
      state.settings = data.settings;
      state.providers = data.providers;
      renderAll();
      shell.applyChrome(state.settings);
      if (successMessage) U.success(successMessage);
      return true;
    } catch (err) {
      U.error(err.message);
      renderAll();
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                             */
  /* ------------------------------------------------------------------ */
  dom.localToggle.addEventListener('change', async () => {
    const next = dom.localToggle.checked;
    dom.localToggle.disabled = true;
    const ok = await save(
      { local_only: next },
      next
        ? 'Local-only mode is on. Outbound requests are now blocked.'
        : 'Local-only mode is off. Configured providers may now be contacted.'
    );
    if (!ok) dom.localToggle.checked = !next;
    dom.localToggle.disabled = false;
  });

  dom.providerAi.addEventListener('change', () => {
    save({ provider_ai: dom.providerAi.value }, 'AI provider preference saved.');
  });

  dom.providerSearch.addEventListener('change', () => {
    save({ provider_search: dom.providerSearch.value }, 'Research provider preference saved.');
  });

  dom.motionGrid.addEventListener('click', (event) => {
    const card = event.target.closest('.motioncard');
    if (!card) return;
    save({ motion: card.dataset.motion }, `Motion set to ${card.dataset.motion}.`);
  });

  dom.motionGrid.addEventListener('keydown', (event) => {
    const cards = U.$$('.motioncard', dom.motionGrid);
    const index = cards.indexOf(document.activeElement);
    if (index === -1) return;
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = cards[(index + 1) % cards.length];
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = cards[(index - 1 + cards.length) % cards.length];
    }
    if (next) {
      event.preventDefault();
      next.focus();
      next.click();
    }
  });

  /* API keys ------------------------------------------------------- */
  root.querySelectorAll('[data-key-save]').forEach((button) => {
    button.addEventListener('click', async () => {
      const provider = button.dataset.keySave;
      const input = document.getElementById(`key-${provider}`);
      const value = input.value.trim();
      if (!value) {
        U.error('Paste a key before saving.');
        input.focus();
        return;
      }
      const ok = await save({ [`key_${provider}`]: value }, 'Key stored on this machine.');
      if (ok) input.value = '';
    });
  });

  root.querySelectorAll('[data-key-clear]').forEach((button) => {
    button.addEventListener('click', async () => {
      const provider = button.dataset.keyClear;
      const ok = await U.confirm({
        title: 'Remove this key?',
        message: `The stored ${provider} API key will be deleted from the local database.`,
        confirmLabel: 'Remove key',
      });
      if (!ok) return;
      await save({ [`clear_key_${provider}`]: true }, 'Key removed.');
    });
  });

  /* Backup --------------------------------------------------------- */
  dom.exportBtn.addEventListener('click', async () => {
    dom.exportBtn.disabled = true;
    try {
      const name = await api.download('/api/backup', 'opspine-backup.json');
      U.success(`Backup saved as ${name}.`);
    } catch (err) {
      U.error(err.message);
    } finally {
      dom.exportBtn.disabled = false;
    }
  });

  dom.importFile.addEventListener('change', async () => {
    const file = dom.importFile.files[0];
    if (!file) return;
    dom.importPreview.hidden = true;
    try {
      const text = await file.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('That file is not valid JSON.');
      }
      const data = await api.post('/api/backup/inspect', payload);
      state.pending = payload;
      showPreview(data.summary, file.name);
    } catch (err) {
      U.error(err.message);
      dom.importFile.value = '';
    }
  });

  function showPreview(summary, filename) {
    U.clear(dom.importCounts);
    const counts = summary.counts || {};
    const labels = [
      ['conversations', 'Conversations'],
      ['drafts', 'Drafts'],
      ['events', 'Events'],
      ['tasks', 'Tasks'],
      ['boards', 'Boards'],
      ['research', 'Research'],
      ['documents', 'File records'],
    ];
    let total = 0;
    labels.forEach(([key, label]) => {
      const value = counts[key] || 0;
      total += value;
      dom.importCounts.appendChild(U.el('div', {}, [
        U.el('dt', { text: label }),
        U.el('dd', { text: String(value) }),
      ]));
    });

    dom.importWarning.textContent =
      `Restoring “${filename}” replaces everything currently stored in OPSpine` +
      ` (${total} records in this file). Existing data cannot be recovered unless ` +
      'you exported it first. API keys in the backup are ignored.';

    dom.importPreview.hidden = false;
    dom.importConfirm.focus();
  }

  dom.importCancel.addEventListener('click', () => {
    dom.importPreview.hidden = true;
    state.pending = null;
    dom.importFile.value = '';
  });

  dom.importConfirm.addEventListener('click', async () => {
    if (!state.pending) return;
    const ok = await U.confirm({
      title: 'Replace all data?',
      message: 'Every current conversation, draft, event, task, board and research session will be replaced by the backup.',
      confirmLabel: 'Replace everything',
      danger: true,
    });
    if (!ok) return;
    dom.importConfirm.disabled = true;
    try {
      const data = await api.post('/api/backup/restore?mode=replace', state.pending);
      U.success(data.message || 'Backup restored.');
      dom.importPreview.hidden = true;
      state.pending = null;
      dom.importFile.value = '';
      await load();
      shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    } finally {
      dom.importConfirm.disabled = false;
    }
  });

  /* Danger zone ---------------------------------------------------- */
  dom.resetBtn.addEventListener('click', async () => {
    const ok = await U.confirm({
      title: 'Delete all local data?',
      message: 'This removes every conversation, draft, event, task, board, research session, file record and generated file. It cannot be undone.',
      confirmLabel: 'Delete everything',
      danger: true,
    });
    if (!ok) return;
    const typed = window.prompt('Type DELETE to confirm permanent removal of all data.');
    if (typed !== 'DELETE') {
      if (typed !== null) U.error('Confirmation text did not match. Nothing was deleted.');
      return;
    }
    try {
      const data = await api.post('/api/danger/reset', { confirm: 'DELETE' });
      U.success(data.message || 'All local data deleted.');
      await load();
      shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    }
  });

  shell.registerPrimary('Save provider settings', () => {
    save({
      provider_ai: dom.providerAi.value,
      provider_search: dom.providerSearch.value,
    }, 'Provider settings saved.');
  });

  load();
})();
