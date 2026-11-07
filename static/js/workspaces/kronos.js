/**
 * Kronos — Calendar & reminders (neobrutalist)
 */
(function() {
  function mount() {
    const el = document.createElement('div');
    el.className = 'kronos-panel scroll-area';
    const now = new Date();
    el.innerHTML = `
      <div class="kronos-neo">
        <div class="kronos-header">
          <span class="kronos-eyebrow">◼ KRONOS</span>
          <h1 style="font-weight:900;font-size:clamp(36px,6vw,56px)">Plan your time.</h1>
          <p style="font-size:var(--fs-lg);opacity:.6">Schedule in plain English. Kronos parses it.</p>
        </div>
        
        <div class="kronos-entry">
          <input type="text" id="kronos-nl" class="kronos-input" placeholder="e.g. Team meeting tomorrow at 2pm for 1 hour" autocomplete="off">
          <button class="kronos-add" data-primary-action id="kronos-add">ADD</button>
        </div>
        <div id="kronos-parsed" style="margin-top:var(--sp-3);font-family:var(--mono);font-size:var(--fs-xs)"></div>
        
        <div class="kronos-controls">
          <div class="kronos-tabs tabs">
            <button class="tab active" data-view="month">Month</button>
            <button class="tab" data-view="week">Week</button>
            <button class="tab" data-view="day">Day</button>
          </div>
          <div class="kronos-nav-btns">
            <button class="kronos-btn" id="kronos-prev">←</button>
            <span id="kronos-title" style="font-family:var(--mono);font-weight:700"></span>
            <button class="kronos-btn" id="kronos-next">→</button>
          </div>
        </div>
        
        <div class="kronos-views">
          <div class="kronos-month-view" id="kronos-month"></div>
        </div>
        
        <div class="kronos-upcoming">
          <h3 style="font-weight:800;margin-bottom:var(--sp-3);border-bottom:3px solid #000;padding-bottom:var(--sp-2)">Upcoming</h3>
          <div id="kronos-events"></div>
        </div>
      </div>
    `;
    setTimeout(() => populate(el), 0);
    return el;
  }
  
  let viewDate = new Date();
  let currentView = 'month';
  let events = [];
  
  function populate(el) {
    const nlInput = el.querySelector('#kronos-nl');
    const addBtn = el.querySelector('#kronos-add');
    const parsedEl = el.querySelector('#kronos-parsed');
    
    async function addEvent() {
      const text = nlInput.value.trim();
      if (!text) return;
      addBtn.disabled = true;
      addBtn.textContent = '…';
      try {
        // Parse first to show
        const parsed = await API.kronosParse(text);
        const ev = await API.createEvent({ natural_input: text });
        events.push(ev);
        nlInput.value = '';
        parsedEl.innerHTML = `<span style="color:#22c55e">✓ Added: "${ev.title}" at ${new Date(ev.start_time*1000).toLocaleString()}${ev.clashes && ev.clashes.length ? ' · ⚠ ' + ev.clashes.length + ' clash(es)' : ''}</span>`;
        render(el);
        Shell.toast(`Event added: ${ev.title}`, { type: 'success' });
        setTimeout(() => { if(parsedEl) parsedEl.innerHTML=''; }, 5000);
      } catch(err) {
        Shell.toast(err.message, { type: 'error' });
      }
      addBtn.disabled = false;
      addBtn.textContent = 'ADD';
    }
    addBtn.addEventListener('click', addEvent);
    nlInput.addEventListener('keydown', e => { if(e.key==='Enter') addEvent(); });
    
    // Parse preview
    nlInput.addEventListener('input', async () => {
      const text = nlInput.value.trim();
      if (text.length < 5) { parsedEl.innerHTML = ''; return; }
      try {
        const p = await API.kronosParse(text);
        const dt = new Date(p.start_time*1000);
        parsedEl.innerHTML = `<span style="opacity:.7">Will create: "${p.title}" · ${dt.toLocaleString()} · ${p.duration_min}min · ${p.priority}</span>`;
      } catch(e) {}
    });
    
    el.querySelectorAll('[data-view]').forEach(t => {
      t.addEventListener('click', () => {
        el.querySelectorAll('[data-view]').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        currentView = t.dataset.view;
        render(el);
      });
    });
    
    el.querySelector('#kronos-prev').addEventListener('click', () => {
      if (currentView === 'month') viewDate.setMonth(viewDate.getMonth()-1);
      else if (currentView === 'week') viewDate.setDate(viewDate.getDate()-7);
      else viewDate.setDate(viewDate.getDate()-1);
      render(el);
    });
    el.querySelector('#kronos-next').addEventListener('click', () => {
      if (currentView === 'month') viewDate.setMonth(viewDate.getMonth()+1);
      else if (currentView === 'week') viewDate.setDate(viewDate.getDate()+7);
      else viewDate.setDate(viewDate.getDate()+1);
      render(el);
    });
    
    render(el);
  }
  
  async function render(el) {
    const monthView = el.querySelector('#kronos-month');
    const titleEl = el.querySelector('#kronos-title');
    const eventsEl = el.querySelector('#kronos-events');
    
    // Load events for visible range
    const start = new Date(viewDate.getFullYear(), viewDate.getMonth()-1, 1).getTime()/1000;
    const end = new Date(viewDate.getFullYear(), viewDate.getMonth()+2, 0).getTime()/1000;
    const data = await API.events(start, end);
    events = data.events;
    
    if (currentView === 'month') {
      titleEl.textContent = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      renderMonth(monthView, el);
    } else if (currentView === 'week') {
      titleEl.textContent = 'Week of ' + viewDate.toLocaleDateString(undefined, { month:'short', day:'numeric' });
      renderWeek(monthView);
    } else {
      titleEl.textContent = viewDate.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
      renderDay(monthView);
    }
    
    // Upcoming
    const upcoming = events
      .filter(e => e.start_time > Date.now()/1000 - 3600)
      .sort((a,b) => a.start_time - b.start_time)
      .slice(0, 10);
    eventsEl.innerHTML = upcoming.length === 0 ?
      '<div class="kronos-empty" style="border:2px dashed #000;padding:var(--sp-6);text-align:center">No upcoming events. Type something above to get started.</div>' :
      upcoming.map(e => renderEvent(e)).join('');
    
    eventsEl.querySelectorAll('.kronos-event-del').forEach(b => {
      b.addEventListener('click', async e => {
        e.stopPropagation();
        await API.deleteEvent(b.dataset.id);
        render(el);
      });
    });
    eventsEl.querySelectorAll('.kronos-event-done').forEach(b => {
      b.addEventListener('click', async e => {
        e.stopPropagation();
        await API.updateEvent(b.dataset.id, { done: 1 });
        render(el);
      });
    });
  }
  
  function renderMonth(container, el) {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m+1, 0).getDate();
    const today = new Date();
    
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    
    let html = '<div class="kronos-cal-grid">';
    dayNames.forEach(d => { html += `<div class="kronos-cal-head">${d}</div>`; });
    for (let i=0; i<firstDay; i++) html += '<div class="kronos-cal-day empty"></div>';
    for (let d=1; d<=daysInMonth; d++) {
      const date = new Date(y,m,d);
      const dayStart = new Date(y,m,d).getTime()/1000;
      const dayEnd = dayStart + 86400;
      const dayEvents = events.filter(e => e.start_time >= dayStart && e.start_time < dayEnd);
      const isToday = date.toDateString() === today.toDateString();
      html += `<div class="kronos-cal-day ${isToday?'today':''}">
        <div class="cal-day-num">${d}</div>
        ${dayEvents.slice(0,3).map(e => `<div class="cal-event" style="background:${e.priority==='high'?'#fbbf24':'#000'};color:${e.priority==='high'?'#000':'#fff'}">${e.title.slice(0,18)}${e.title.length>18?'…':''}</div>`).join('')}
        ${dayEvents.length>3?`<div class="cal-more">+${dayEvents.length-3} more</div>`:''}
      </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  }
  
  function renderWeek(container) {
    const startOfWeek = new Date(viewDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    let html = '<div class="kronos-week">';
    for (let i=0; i<7; i++) {
      const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate()+i);
      const ds = new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()/1000;
      const de = ds+86400;
      const dayEv = events.filter(e => e.start_time >= ds && e.start_time < de);
      html += `<div class="kronos-weekday">
        <div class="weekday-name">${d.toLocaleDateString(undefined,{weekday:'short',day:'numeric'})}</div>
        ${dayEv.map(e => `<div class="weekday-event" style="border-left:4px solid ${e.priority==='high'?'#fbbf24':'#000'}">${e.title}</div>`).join('')}
      </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  }
  
  function renderDay(container) {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate());
    const ds = d.getTime()/1000, de = ds+86400;
    const dayEv = events.filter(e => e.start_time >= ds && e.start_time < de).sort((a,b)=>a.start_time-b.start_time);
    container.innerHTML = `<div class="kronos-day">
      ${dayEv.length === 0 ? '<div class="kronos-empty" style="border:2px dashed #000;padding:var(--sp-6);text-align:center">No events scheduled.</div>' :
        dayEv.map(e => `<div class="kronos-day-event" style="border-left:4px solid ${e.priority==='high'?'#fbbf24':'#000'}">
          <strong>${new Date(e.start_time*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</strong> — ${e.title}
        </div>`).join('')}
    </div>`;
  }
  
  function renderEvent(e) {
    const dt = new Date(e.start_time*1000);
    return `<div class="kronos-event-item ${e.done?'done':''}" style="border-left:5px solid ${e.priority==='high'?'#fbbf24':e.done?'#22c55e':'#000'}">
      <div class="kronos-event-info">
        <div class="kronos-event-title">${e.title}</div>
        <div class="kronos-event-time small">${dt.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})} · ${dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <div class="kronos-event-btns">
        ${!e.done ? `<button class="kronos-event-done" data-id="${e.id}">✓</button>` : '<span style="color:#22c55e;font-family:var(--mono);font-size:var(--fs-xs)">DONE</span>'}
        <button class="kronos-event-del" data-id="${e.id}">✕</button>
      </div>
    </div>`;
  }
  
  Workspace.register('cadence', mount);
})();
