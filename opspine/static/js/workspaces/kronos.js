/* ==========================================================================
   Kronos — month / week / day calendar with confirmed natural-language entry.
   ========================================================================== */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;

  const root = document.querySelector('[data-kronos]');
  if (!root) return;

  const dom = {
    today: document.getElementById('kronos-today'),
    nlForm: document.getElementById('kronos-nl-form'),
    nl: document.getElementById('kronos-nl'),
    nlGo: document.getElementById('kronos-nl-go'),
    parse: document.getElementById('kronos-parse'),
    pTitle: document.getElementById('parse-title'),
    pStart: document.getElementById('parse-start'),
    pEnd: document.getElementById('parse-end'),
    pConf: document.getElementById('parse-confidence'),
    pClash: document.getElementById('parse-clash'),
    pCancel: document.getElementById('parse-cancel'),
    pSave: document.getElementById('parse-save'),
    period: document.getElementById('cal-period'),
    body: document.getElementById('cal-body'),
    prev: document.getElementById('cal-prev'),
    next: document.getElementById('cal-next'),
    todayBtn: document.getElementById('cal-today'),
    editor: document.getElementById('kronos-editor'),
    form: document.getElementById('kronos-form'),
    fTitle: document.getElementById('ke-title'),
    fName: document.getElementById('ke-name'),
    fStart: document.getElementById('ke-start'),
    fEnd: document.getElementById('ke-end'),
    fNotes: document.getElementById('ke-notes'),
    fDone: document.getElementById('ke-done'),
    fClash: document.getElementById('ke-clash'),
    fError: document.getElementById('ke-error'),
    fSave: document.getElementById('ke-save'),
    fDelete: document.getElementById('ke-delete'),
    stats: document.getElementById('kronos-tools-stats'),
  };

  const state = {
    view: 'month',
    cursor: new Date(),
    events: [],
    editingId: null,
    parsed: null,
  };

  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  /* ------------------------------------------------------------------ */
  /* Date helpers                                                       */
  /* ------------------------------------------------------------------ */
  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /* Monday-first week index (0 = Monday). */
  function dowIndex(date) {
    return (date.getDay() + 6) % 7;
  }

  function startOfWeek(date) {
    const d = startOfDay(date);
    d.setDate(d.getDate() - dowIndex(d));
    return d;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function ts(date) {
    return Math.floor(date.getTime() / 1000);
  }

  function fromTs(value) {
    return new Date(Number(value) * 1000);
  }

  function escapeHtml(value) {
    return U.escape(value);
  }

  /* ------------------------------------------------------------------ */
  /* Data                                                               */
  /* ------------------------------------------------------------------ */
  async function loadEvents() {
    const first = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(start.getDate() - 14);
    const end = new Date(first);
    end.setMonth(end.getMonth() + 2);
    end.setDate(end.getDate() + 14);

    try {
      const data = await api.get(
        `/api/kronos/events?start=${ts(start)}&end=${ts(end)}`
      );
      state.events = data.events;
    } catch (err) {
      U.clear(dom.body);
      dom.body.appendChild(U.state({ title: 'Could not load events', body: err.message, variant: 'error' }));
      return;
    }
    render();
    renderStats();
  }

  function eventsOn(date) {
    return state.events
      .filter((event) => sameDay(fromTs(event.start_at), date))
      .sort((a, b) => a.start_at - b.start_at);
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */
  function render() {
    if (state.view === 'month') renderMonth();
    else if (state.view === 'week') renderWeek();
    else renderDay();

    U.$$('.cal__view').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.view === state.view);
    });
  }

  function renderMonth() {
    const year = state.cursor.getFullYear();
    const month = state.cursor.getMonth();
    dom.period.textContent = `${MONTHS[month]} ${year}`;

    const first = new Date(year, month, 1);
    const gridStart = startOfWeek(first);
    const today = new Date();

    const wrap = document.createDocumentFragment();
    const dow = U.el('div', { class: 'month__dow' });
    DOW.forEach((label) => dow.appendChild(U.el('span', { text: label })));
    wrap.appendChild(dow);

    const grid = U.el('div', { class: 'month' });
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(gridStart);
      date.setDate(date.getDate() + i);
      const list = eventsOn(date);
      const outside = date.getMonth() !== month;

      const cell = U.el('button', {
        type: 'button',
        class: `day${outside ? ' day--outside' : ''}${sameDay(date, today) ? ' day--today' : ''}`,
        'aria-label': `${date.getDate()} ${MONTHS[date.getMonth()]}, ${list.length} event${list.length === 1 ? '' : 's'}`,
        onClick: (event) => {
          if (event.target.closest('.day__event')) return;
          openEditor(null, date);
        },
      });

      cell.appendChild(U.el('span', { class: 'day__num', text: String(date.getDate()) }));

      const holder = U.el('div', { class: 'day__events' });
      list.slice(0, 3).forEach((item) => {
        holder.appendChild(
          U.el('span', {
            class: `day__event${item.done ? ' day__event--done' : ''}`,
            text: `${U.formatTime(item.start_at)} ${item.title}`,
            title: item.title,
            onClick: (event) => {
              event.stopPropagation();
              openEditor(item.id);
            },
          })
        );
      });
      if (list.length > 3) {
        holder.appendChild(U.el('span', { class: 'day__more', text: `+${list.length - 3} more` }));
      }
      cell.appendChild(holder);

      if (list.length) {
        cell.appendChild(
          U.el('span', { class: 'day__dotcount', text: String(list.length) })
        );
      }
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    U.clear(dom.body);
    dom.body.appendChild(wrap);
  }

  function renderWeek() {
    const weekStart = startOfWeek(state.cursor);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    dom.period.textContent =
      `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()].slice(0, 3)} – ` +
      `${weekEnd.getDate()} ${MONTHS[weekEnd.getMonth()].slice(0, 3)} ${weekEnd.getFullYear()}`;

    const today = new Date();
    const grid = U.el('div', { class: 'week' });
    grid.appendChild(U.el('div', { class: 'week__corner' }));

    for (let d = 0; d < 7; d += 1) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + d);
      grid.appendChild(
        U.el('div', { class: `week__head${sameDay(date, today) ? ' is-today' : ''}` }, [
          U.el('span', { class: 'week__dow', text: DOW[d] }),
          U.el('span', { class: 'week__date', text: String(date.getDate()) }),
        ])
      );
    }

    /* Hours 7:00 → 21:00 keeps a working day readable without a huge grid. */
    for (let hour = 7; hour <= 21; hour += 1) {
      grid.appendChild(
        U.el('div', { class: 'week__time', text: `${String(hour).padStart(2, '0')}:00` })
      );
      for (let d = 0; d < 7; d += 1) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + d);
        date.setHours(hour, 0, 0, 0);
        const cellStart = ts(date);
        const cellEnd = cellStart + 3600;

        const cell = U.el('div', {
          class: `week__cell${sameDay(date, today) ? ' is-today' : ''}`,
          role: 'button',
          tabindex: '0',
          'aria-label': `Add event at ${hour}:00 on ${date.getDate()} ${MONTHS[date.getMonth()]}`,
          onClick: () => openEditor(null, date),
          onKeydown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openEditor(null, date);
            }
          },
        });

        state.events
          .filter((item) => item.start_at >= cellStart && item.start_at < cellEnd)
          .forEach((item) => {
            cell.appendChild(
              U.el('button', {
                type: 'button',
                class: `week__event${item.done ? ' week__event--done' : ''}`,
                text: item.title,
                title: `${item.title} · ${U.formatTime(item.start_at)}`,
                onClick: (event) => {
                  event.stopPropagation();
                  openEditor(item.id);
                },
              })
            );
          });

        grid.appendChild(cell);
      }
    }

    U.clear(dom.body);
    dom.body.appendChild(grid);
  }

  function renderDay() {
    const date = startOfDay(state.cursor);
    const today = new Date();
    dom.period.textContent =
      `${DOW[dowIndex(date)]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

    const list = eventsOn(date);
    const view = U.el('div', { class: 'dayview' });

    view.appendChild(
      U.el('div', { class: 'dayview__head' }, [
        U.el('span', { class: 'dayview__date', text: sameDay(date, today) ? 'Today' : `${date.getDate()} ${MONTHS[date.getMonth()]}` }),
        U.el('span', {
          class: 'dayview__count',
          text: list.length
            ? `${list.length} event${list.length === 1 ? '' : 's'} · ${list.filter((e) => e.done).length} done`
            : 'No events yet',
        }),
      ])
    );

    const rows = U.el('div', { class: 'dayview__list' });
    for (let hour = 7; hour <= 21; hour += 1) {
      const slotDate = new Date(date);
      slotDate.setHours(hour, 0, 0, 0);
      const slotStart = ts(slotDate);
      const slotEnd = slotStart + 3600;
      const matches = list.filter((e) => e.start_at >= slotStart && e.start_at < slotEnd);

      const row = U.el('div', { class: 'dayrow' }, [
        U.el('div', { class: 'dayrow__time', text: `${String(hour).padStart(2, '0')}:00` }),
      ]);

      const slot = U.el('div', {
        class: 'dayrow__slot',
        role: 'button',
        tabindex: '0',
        'aria-label': `Add event at ${hour}:00`,
        onClick: (event) => {
          if (event.target.closest('.dayrow__event')) return;
          openEditor(null, slotDate);
        },
        onKeydown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openEditor(null, slotDate);
          }
        },
      });

      matches.forEach((item) => {
        slot.appendChild(
          U.el('button', {
            type: 'button',
            class: `dayrow__event${item.done ? ' dayrow__event--done' : ''}`,
            onClick: (event) => {
              event.stopPropagation();
              openEditor(item.id);
            },
          }, [
            U.el('span', { class: 'dayrow__dot' }),
            U.el('span', { class: 'dayrow__title', text: item.title }),
            U.el('span', {
              class: 'dayrow__when',
              text: `${U.formatTime(item.start_at)}–${U.formatTime(item.end_at)}`,
            }),
          ])
        );
      });

      row.appendChild(slot);
      rows.appendChild(row);
    }
    view.appendChild(rows);
    U.clear(dom.body);
    dom.body.appendChild(view);
  }

  function renderStats() {
    const events = state.events;
    const upcoming = events.filter((e) => e.start_at >= Date.now() / 1000 && !e.done);
    U.clear(dom.stats);
    [
      ['Events', events.length],
      ['Done', events.filter((e) => e.done).length],
      ['Upcoming', upcoming.length],
    ].forEach(([label, value]) => {
      dom.stats.appendChild(U.el('div', {}, [
        U.el('dt', { text: label }),
        U.el('dd', { text: String(value) }),
      ]));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Event editor                                                       */
  /* ------------------------------------------------------------------ */
  function openEditor(eventId, date) {
    state.editingId = eventId || null;
    dom.fError.hidden = true;
    dom.fClash.hidden = true;

    if (eventId) {
      const event = state.events.find((item) => item.id === eventId);
      if (!event) return;
      dom.fTitle.textContent = 'Edit event';
      dom.fName.value = event.title;
      dom.fStart.value = U.toLocalInput(event.start_at);
      dom.fEnd.value = U.toLocalInput(event.end_at);
      dom.fNotes.value = event.notes || '';
      dom.fDone.checked = Boolean(event.done);
      dom.fDelete.hidden = false;
    } else {
      const base = date ? new Date(date) : new Date();
      if (date && !date.getHours()) base.setHours(9, 0, 0, 0);
      const end = new Date(base.getTime() + 3600 * 1000);
      dom.fTitle.textContent = 'New event';
      dom.fName.value = '';
      dom.fStart.value = U.toLocalInput(ts(base));
      dom.fEnd.value = U.toLocalInput(ts(end));
      dom.fNotes.value = '';
      dom.fDone.checked = false;
      dom.fDelete.hidden = true;
    }

    dom.editor.hidden = false;
    dom.editor.dataset.open = 'true';
    setTimeout(() => dom.fName.focus(), 40);
  }

  function closeEditor() {
    dom.editor.hidden = true;
    delete dom.editor.dataset.open;
    state.editingId = null;
  }

  async function saveEvent(event) {
    event.preventDefault();
    dom.fError.hidden = true;

    const title = dom.fName.value.trim();
    const start = U.fromLocalInput(dom.fStart.value);
    const end = U.fromLocalInput(dom.fEnd.value);

    if (!title) {
      showFormError('Give the event a title.');
      return;
    }
    if (start === null || end === null) {
      showFormError('Set a start and end time.');
      return;
    }
    if (end <= start) {
      showFormError('The end time must be after the start time.');
      return;
    }

    const payload = {
      title,
      start_at: start,
      end_at: end,
      notes: dom.fNotes.value,
      done: dom.fDone.checked,
      all_day: false,
    };

    dom.fSave.disabled = true;
    try {
      let data;
      if (state.editingId) {
        data = await api.put(`/api/kronos/events/${state.editingId}`, payload);
      } else {
        data = await api.post('/api/kronos/events', payload);
      }
      closeEditor();
      await loadEvents();
      U.success(state.editingId ? 'Event updated.' : 'Event saved.');
      if (data.clashes && data.clashes.length) {
        U.toast(
          `Note: this overlaps ${data.clashes.length} existing event${data.clashes.length === 1 ? '' : 's'}.`,
          'error',
          6000
        );
      }
      window.OPS.shell.refreshActivity();
    } catch (err) {
      showFormError(err.message);
    } finally {
      dom.fSave.disabled = false;
    }
  }

  function showFormError(message) {
    dom.fError.textContent = message;
    dom.fError.hidden = false;
  }

  async function deleteEvent() {
    if (!state.editingId) return;
    const event = state.events.find((item) => item.id === state.editingId);
    const ok = await U.confirm({
      title: 'Delete event?',
      message: `“${event ? event.title : 'This event'}” will be removed from your calendar.`,
      confirmLabel: 'Delete event',
    });
    if (!ok) return;
    try {
      await api.del(`/api/kronos/events/${state.editingId}`);
      closeEditor();
      await loadEvents();
      U.success('Event deleted.');
    } catch (err) {
      showFormError(err.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Natural language                                                   */
  /* ------------------------------------------------------------------ */
  async function parseEntry(event) {
    event.preventDefault();
    const text = dom.nl.value.trim();
    if (!text) {
      dom.nl.focus();
      return;
    }
    dom.nlGo.disabled = true;
    try {
      const data = await api.post('/api/kronos/parse', { text });
      state.parsed = data.parsed;
      dom.parse.hidden = false;
      dom.pTitle.value = data.parsed.title;
      dom.pStart.value = U.toLocalInput(data.parsed.start_at);
      dom.pEnd.value = U.toLocalInput(data.parsed.end_at);
      dom.pConf.textContent =
        `Interpreted with ${Math.round(data.parsed.confidence * 100)}% confidence` +
        (data.parsed.matched_date ? '' : ' — no explicit date was recognised');

      dom.pClash.textContent = data.clashes && data.clashes.length
        ? `Overlaps: ${data.clashes.map((c) => c.title).join(', ')}`
        : '';
    } catch (err) {
      U.error(err.message);
    } finally {
      dom.nlGo.disabled = false;
    }
  }

  async function confirmParsed() {
    const title = dom.pTitle.value.trim();
    const start = U.fromLocalInput(dom.pStart.value);
    const end = U.fromLocalInput(dom.pEnd.value);
    if (!title || start === null || end === null || end <= start) {
      U.error('Check the title and times before saving.');
      return;
    }
    dom.pSave.disabled = true;
    try {
      await api.post('/api/kronos/events', {
        title, start_at: start, end_at: end, notes: '', all_day: false, done: false,
      });
      dom.parse.hidden = true;
      dom.nl.value = '';
      await loadEvents();
      U.success('Event added to your calendar.');
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    } finally {
      dom.pSave.disabled = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                         */
  /* ------------------------------------------------------------------ */
  function move(step) {
    if (state.view === 'month') {
      state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + step, 1);
    } else if (state.view === 'week') {
      const next = new Date(state.cursor);
      next.setDate(next.getDate() + step * 7);
      state.cursor = next;
    } else {
      const next = new Date(state.cursor);
      next.setDate(next.getDate() + step);
      state.cursor = next;
    }
    loadEvents();
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                             */
  /* ------------------------------------------------------------------ */
  dom.prev.addEventListener('click', () => move(-1));
  dom.next.addEventListener('click', () => move(1));
  dom.todayBtn.addEventListener('click', () => {
    state.cursor = new Date();
    loadEvents();
  });

  U.$$('.cal__view').forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.dataset.view;
      render();
      renderStats();
    });
  });

  dom.nlForm.addEventListener('submit', parseEntry);
  dom.pCancel.addEventListener('click', () => {
    dom.parse.hidden = true;
    state.parsed = null;
  });
  dom.pSave.addEventListener('click', confirmParsed);
  dom.form.addEventListener('submit', saveEvent);
  dom.fDelete.addEventListener('click', deleteEvent);

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="ke-close"]')) closeEditor();
  });

  dom.editor.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeEditor();
    }
  });

  /* Warn if the times are edited into a clash, using loaded events. */
  dom.fStart.addEventListener('change', checkClashPreview);
  dom.fEnd.addEventListener('change', checkClashPreview);

  function checkClashPreview() {
    const start = U.fromLocalInput(dom.fStart.value);
    const end = U.fromLocalInput(dom.fEnd.value);
    if (start === null || end === null || end <= start) {
      dom.fClash.hidden = true;
      return;
    }
    const clash = state.events.filter((item) => {
      if (state.editingId && item.id === state.editingId) return false;
      return start < item.end_at && end > item.start_at;
    });
    dom.fClash.textContent = clash.length
      ? `Overlaps: ${clash.map((c) => c.title).join(', ')}`
      : '';
    dom.fClash.hidden = !clash.length;
  }

  window.OPS.shell.registerPrimary('New event', () => {
    openEditor(null, new Date());
  });

  /* ------------------------------------------------------------------ */
  /* Startup                                                            */
  /* ------------------------------------------------------------------ */
  dom.today.textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  loadEvents();
})();
