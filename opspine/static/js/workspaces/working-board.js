/* ==========================================================================
   Working Board — tasks grouped by status, with a detail panel.
   ========================================================================== */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;

  const root = document.querySelector('[data-wboard]');
  if (!root) return;

  const dom = {
    list: { todo: document.getElementById('col-todo'),
            in_progress: document.getElementById('col-in_progress'),
            done: document.getElementById('col-done') },
    counts: document.getElementById('wboard-counts'),
    stats: document.getElementById('wboard-stats'),
    search: document.getElementById('wboard-search'),
    add: document.getElementById('wboard-add'),
    detailEmpty: document.getElementById('wboard-detail-empty'),
    form: document.getElementById('wboard-form'),
    badge: document.getElementById('wboard-form-badge'),
    close: document.getElementById('wboard-close'),
    title: document.getElementById('wboard-title'),
    desc: document.getElementById('wboard-desc'),
    status: document.getElementById('wboard-status'),
    priority: document.getElementById('wboard-priority'),
    due: document.getElementById('wboard-due'),
    error: document.getElementById('wboard-error'),
    cancel: document.getElementById('wboard-cancel'),
    del: document.getElementById('wboard-delete'),
    save: document.getElementById('wboard-save'),
    move: document.getElementById('wboard-move'),
    statusLine: document.getElementById('wboard-status-line'),
    dirty: document.getElementById('wboard-dirty'),
  };

  const state = {
    tasks: [],
    counts: { todo: 0, in_progress: 0, done: 0, total: 0 },
    selectedId: null,
    query: '',
    saving: false,
    /* What the open form looked like when it was loaded, so the panel can
       say whether there is anything unsaved. */
    pristine: '',
  };

  const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

  /* ------------------------------------------------------------------ */
  /* Loading                                                            */
  /* ------------------------------------------------------------------ */
  async function load(query) {
    try {
      const url = `/api/tasks/${query ? `?q=${encodeURIComponent(query)}` : ''}`;
      const data = await api.get(url);
      state.tasks = data.tasks;
      state.counts = data.counts;
      render();
    } catch (err) {
      U.error(err.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */
  function render() {
    Object.entries(dom.list).forEach(([status, host]) => {
      U.clear(host);
      const grouped = state.tasks.filter((task) => task.status === status);
      if (!grouped.length) return;
      grouped.forEach((task) => host.appendChild(taskCard(task)));
    });

    ['todo', 'in_progress', 'done'].forEach((status) => {
      const counter = root.querySelector(`[data-count="${status}"]`);
      if (counter) counter.textContent = String(state.counts[status] || 0);
    });

    renderCounts();
    renderStats();
  }

  function dueInfo(task) {
    if (!task.due_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${task.due_date}T00:00:00`);
    const dayMs = 86400000;
    const diff = Math.round((due - today) / dayMs);
    if (Number.isNaN(diff)) return null;
    if (diff === 0) return { text: 'Due today', cls: 'is-today' };
    if (diff < 0) return { text: `Overdue ${Math.abs(diff)}d`, cls: 'is-overdue' };
    if (diff === 1) return { text: 'Due tomorrow', cls: '' };
    return {
      text: `Due ${due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
      cls: '',
    };
  }

  function taskCard(task) {
    const card = U.el('li', {});
    const button = U.el('button', {
      type: 'button',
      class: `tcard${task.status === 'done' ? ' tcard--done' : ''}${state.selectedId === task.id ? ' is-active' : ''}`,
      onClick: () => openTask(task.id),
    });

    const top = U.el('div', { class: 'tcard__top' }, [
      U.el('span', { class: 'tcard__title', text: task.title }),
      U.el('span', {
        class: 'tcard__priority',
        dataset: { p: task.priority },
        text: task.priority,
      }),
    ]);
    button.appendChild(top);

    if (task.description) {
      button.appendChild(
        U.el('span', { class: 'tcard__desc', text: task.description })
      );
    }

    /* A card is a button, so the move controls live beside it in the list
       item rather than inside it — nested buttons are invalid. */
    card.dataset.taskId = String(task.id);

    const foot = U.el('div', { class: 'tcard__foot' });
    const due = dueInfo(task);
    if (due) {
      foot.appendChild(
        U.el('span', { class: `tcard__due ${due.cls}`.trim(), text: due.text })
      );
    }
    foot.appendChild(
      U.el('span', {
        class: 'tcard__toggle',
        role: 'button',
        tabindex: '0',
        text: task.status === 'done' ? 'Reopen' : 'Complete',
        'aria-label': task.status === 'done'
          ? `Reopen ${task.title}`
          : `Mark ${task.title} complete`,
        onClick: (event) => {
          event.stopPropagation();
          toggleComplete(task);
        },
        onKeydown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            toggleComplete(task);
          }
        },
      })
    );
    button.appendChild(foot);
    card.appendChild(button);

    const moves = U.el('div', { class: 'tcard__moves' });
    const targets = [
      ['todo', 'To do'],
      ['in_progress', 'In progress'],
      ['done', 'Done'],
    ].filter(([value]) => value !== task.status);
    targets.forEach(([value, label]) => {
      moves.appendChild(U.el('button', {
        type: 'button',
        class: 'tcard__move',
        text: label,
        'aria-label': `Move ${task.title} to ${label}`,
        onClick: (event) => {
          event.stopPropagation();
          moveTask(task, value);
        },
      }));
    });
    card.appendChild(moves);
    return card;
  }

  function renderCounts() {
    const highOpen = state.tasks.filter(
      (task) => task.priority === 'high' && task.status !== 'done'
    ).length;

    U.clear(dom.counts);
    const items = [
      { label: 'All', value: state.counts.total },
      { label: 'To do', value: state.counts.todo },
      { label: 'In progress', value: state.counts.in_progress },
      { label: 'Done', value: state.counts.done },
      { label: 'High priority open', value: highOpen, high: highOpen > 0 },
    ];
    items.forEach((item) => {
      dom.counts.appendChild(
        U.el('span', { class: `wcount${item.high ? ' wcount--high' : ''}` }, [
          U.el('strong', { text: String(item.value) }),
          item.label,
        ])
      );
    });
  }

  function renderStats() {
    U.clear(dom.stats);
    [
      ['Total', state.counts.total],
      ['To do', state.counts.todo],
      ['In progress', state.counts.in_progress],
      ['Done', state.counts.done],
    ].forEach(([label, value]) => {
      dom.stats.appendChild(U.el('div', {}, [
        U.el('dt', { text: label }),
        U.el('dd', { text: String(value) }),
      ]));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Detail panel                                                       */
  /* ------------------------------------------------------------------ */
  function formSignature() {
    return [dom.title.value, dom.desc.value, dom.status.value,
      dom.priority.value, dom.due.value].join('\u0000');
  }

  function markPristine() {
    state.pristine = formSignature();
    syncDirty();
  }

  function syncDirty() {
    if (dom.form.hidden) {
      dom.dirty.hidden = true;
      return;
    }
    const dirty = formSignature() !== state.pristine;
    dom.dirty.hidden = !dirty;
  }

  /* Moving between columns is the core board action, so it is one click
     from the card and one keystroke from the keyboard. */
  async function moveTask(task, status) {
    const previous = task.status;
    if (previous === status) return;
    const reverse = { status: previous };
    try {
      await api.put(`/api/tasks/${task.id}`, { status });
      await load(state.query);
      if (state.selectedId === task.id) openTask(task.id);
      announce(`Moved “${task.title}” to ${STATUS_LABEL[status]}.`);
      U.toast({
        message: `Moved “${task.title}” to ${STATUS_LABEL[status]}.`,
        kind: 'success',
        action: {
          label: 'Undo',
          onClick: () => {
            api.put(`/api/tasks/${task.id}`, reverse).then(() => {
              load(state.query).then(() => {
                if (state.selectedId === task.id) openTask(task.id);
              });
              U.toast('Move undone.');
            }).catch((err) => U.error(err.message));
          },
        },
      });
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    }
  }

  function announce(text) {
    if (dom.statusLine) dom.statusLine.textContent = text;
  }
  const drawer = document.getElementById('wboard-detail');

  function showForm() {
    dom.move.disabled = false;
    dom.detailEmpty.hidden = true;
    dom.form.hidden = false;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
  }

  function hideForm() {
    dom.form.hidden = true;
    dom.dirty.hidden = true;
    dom.move.disabled = true;
    dom.detailEmpty.hidden = false;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    state.selectedId = null;
    render();
  }

  function openTask(id) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    state.selectedId = id;
    dom.badge.textContent = STATUS_LABEL[task.status] || 'Task';
    dom.title.value = task.title;
    dom.desc.value = task.description || '';
    dom.status.value = task.status;
    dom.priority.value = task.priority;
    dom.due.value = task.due_date || '';
    dom.del.hidden = false;
    dom.error.hidden = true;
    showForm();
    markPristine();
    render();
    dom.title.focus();
  }

  function openNew() {
    state.selectedId = null;
    dom.badge.textContent = 'New task';
    dom.title.value = '';
    dom.desc.value = '';
    dom.status.value = 'todo';
    dom.priority.value = 'normal';
    dom.due.value = '';
    dom.del.hidden = true;
    dom.error.hidden = true;
    showForm();
    markPristine();
    render();
    dom.title.focus();
  }

  function showError(message) {
    dom.error.textContent = message;
    dom.error.hidden = false;
  }

  async function save(event) {
    if (event) event.preventDefault();
    if (state.saving) return;

    const title = dom.title.value.trim();
    if (!title) {
      showError('A task needs a title.');
      dom.title.focus();
      return;
    }

    const payload = {
      title,
      description: dom.desc.value.trim(),
      status: dom.status.value,
      priority: dom.priority.value,
      due_date: dom.due.value || null,
    };

    state.saving = true;
    dom.save.disabled = true;
    dom.error.hidden = true;
    try {
      const created = !state.selectedId;
      if (created) {
        const data = await api.post('/api/tasks/', payload);
        state.selectedId = data.task.id;
        U.success('Task created.');
      } else {
        await api.put(`/api/tasks/${state.selectedId}`, payload);
        U.success('Task saved.');
      }
      await load(state.query);
      // A new task closes the drawer so the toolbar is never covered; an edit
      // keeps it open on the record that was just saved.
      if (!created && state.tasks.some((t) => t.id === state.selectedId)) {
        openTask(state.selectedId);
      } else {
        hideForm();
      }
      window.OPS.shell.refreshActivity();
    } catch (err) {
      showError(err.message);
    } finally {
      state.saving = false;
      dom.save.disabled = false;
    }
  }

  async function toggleComplete(task) {
    const next = task.status === 'done' ? 'todo' : 'done';
    try {
      await api.put(`/api/tasks/${task.id}`, { status: next });
      await load(state.query);
      if (state.selectedId === task.id) openTask(task.id);
      U.success(next === 'done' ? 'Task completed.' : 'Task reopened.');
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    }
  }

  async function remove() {
    // Capture the id before awaiting: the drawer may close while the
    // confirmation dialog is open.
    const id = state.selectedId;
    if (!id) return;
    const task = state.tasks.find((item) => item.id === id);
    const ok = await U.confirm({
      title: 'Delete task?',
      message: `“${task ? task.title : 'This task'}” will be permanently removed from the board.`,
      confirmLabel: 'Delete task',
    });
    if (!ok) return;
    try {
      await api.del(`/api/tasks/${id}`);
      hideForm();
      await load(state.query);
      U.success('Task deleted.');
      window.OPS.shell.refreshActivity();
    } catch (err) {
      showError(err.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                             */
  /* ------------------------------------------------------------------ */
  dom.move.addEventListener('click', async () => {
    const task = state.tasks.find((item) => item.id === state.selectedId);
    if (!task) return;
    const next = task.status === 'todo' ? 'in_progress'
      : task.status === 'in_progress' ? 'done' : 'todo';
    await moveTask(task, next);
  });

  ['input', 'change'].forEach((type) => {
    [dom.title, dom.desc, dom.status, dom.priority, dom.due].forEach((field) => {
      field.addEventListener(type, syncDirty);
    });
  });

  dom.form.addEventListener('submit', save);
  dom.add.addEventListener('click', openNew);
  dom.cancel.addEventListener('click', hideForm);
  dom.close.addEventListener('click', hideForm);
  dom.del.addEventListener('click', remove);

  dom.search.addEventListener('input', U.debounce(() => {
    state.query = dom.search.value.trim();
    load(state.query);
  }, 240));

  document.addEventListener('pointerdown', (event) => {
    if (!drawer.classList.contains('is-open')) return;
    if (drawer.contains(event.target)) return;
    // Never dismiss while a dialog or toast is on top of the drawer.
    if (event.target.closest('.overlay, .toasts, [role="dialog"]')) return;
    if (event.target.closest('[data-status], .tcard, #wboard-add')) return;
    hideForm();
  });

  document.addEventListener('keydown', (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
      event.target.isContentEditable;
    const mod = event.metaKey || event.ctrlKey;

    if (mod && (event.key === 's' || event.key === 'S') && !dom.form.hidden) {
      event.preventDefault();
      save();
      return;
    }
    if (event.key === 'Escape' && !dom.form.hidden) {
      event.preventDefault();
      if (!dom.dirty.hidden) {
        U.confirm({
          title: 'Discard changes?',
          message: 'This task has unsaved edits. Close the panel and lose them?',
          confirmLabel: 'Discard',
        }).then((okd) => { if (okd) hideForm(); });
        return;
      }
      hideForm();
      return;
    }
    if (typing || mod) return;
    if (event.key === 'n' || event.key === 'N') {
      event.preventDefault();
      openNew();
    } else if (event.key === '/') {
      event.preventDefault();
      dom.search.focus();
      dom.search.select();
    }
  });

  window.OPS.shell.registerPrimary('New task', () => {
    if (!dom.form.hidden) save();
    else openNew();
  });

  /* ------------------------------------------------------------------ */
  /* Startup                                                            */
  /* ------------------------------------------------------------------ */
  const params = new URLSearchParams(window.location.search);
  load().then(() => {
    if (params.get('new') === '1') {
      openNew();
    } else if (params.get('task')) {
      const id = Number(params.get('task'));
      if (state.tasks.some((task) => task.id === id)) openTask(id);
    }
  });
})();
