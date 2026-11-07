/**
 * Working Board — Project execution (dotted near-black canvas, connected node cards)
 */
(function() {
  function mount() {
    const el = document.createElement('div');
    el.className = 'board-panel';
    el.innerHTML = `
      <div class="board-canvas-area canvas-dots" id="board-canvas-area">
        <div class="board-nodes" id="board-nodes"></div>
        <svg class="board-edges" id="board-edges"></svg>
      </div>
      
      <div class="board-toolbar glass-surface">
        <span class="board-title" id="board-title">Project Board</span>
        <div class="board-tb-group">
          <button class="glass-btn" id="board-add-task">+ Task</button>
          <button class="board-run" data-primary-action id="board-run">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Run → Kronos
          </button>
        </div>
        <div class="board-tb-group" style="margin-left:auto">
          <button class="glass-btn" id="board-view-list">List</button>
          <button class="glass-btn" id="board-view-canvas active" style="opacity:1;background:var(--ws-accent);color:#fff">Canvas</button>
        </div>
      </div>
      
      <div class="board-detail" id="board-detail" hidden>
        <div class="board-detail-inner">
          <button class="board-detail-close" id="board-detail-close">✕</button>
          <h3 id="bd-title"></h3>
          <div class="bd-fields">
            <div class="bd-field"><label>Status</label><select id="bd-status"><option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="done">Done</option></select></div>
            <div class="bd-field"><label>Priority</label><select id="bd-priority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></div>
            <div class="bd-field"><label>Owner</label><input type="text" id="bd-owner" class="input-field"></div>
            <div class="bd-field"><label>Due date</label><input type="date" id="bd-due" class="input-field"></div>
            <div class="bd-field full"><label>Description</label><textarea id="bd-desc" class="input-field" rows="4"></textarea></div>
          </div>
          <div style="display:flex;gap:var(--sp-2);margin-top:var(--sp-4)">
            <button class="glass-btn" id="bd-save" style="background:#fff;color:#000;border-color:transparent">Save</button>
            <button class="glass-btn" id="bd-delete" style="background:rgba(239,68,68,.2);color:#ef4444;border-color:transparent">Delete</button>
          </div>
        </div>
      </div>
      
      <div class="board-hint" id="board-hint">Click + Task to add work items · Drag to move · Select a task to edit · Run pushes dated tasks to Kronos</div>
    `;
    setTimeout(() => initBoard(el), 0);
    return el;
  }
  
  let tasks = [], selectedTask = null;
  let dragTask = null, dragOffset = {x:0,y:0};
  let boardArea, nodesEl, edgesEl;
  let nextX = 40, nextY = 40;
  
  function initBoard(el) {
    boardArea = el.querySelector('#board-canvas-area');
    nodesEl = el.querySelector('#board-nodes');
    edgesEl = el.querySelector('#board-edges');
    
    load();
    
    el.querySelector('#board-add-task').addEventListener('click', async () => {
      const title = prompt('Task title:');
      if (!title) return;
      const t = await API.createTask({
        title, status: 'todo', priority: 'normal',
        x: nextX, y: nextY
      });
      tasks.push(t);
      nextX += 40; nextY += 30;
      if (nextX > 600) { nextX = 40; nextY += 100; }
      render();
      Shell.toast('Task added');
    });
    
    el.querySelector('#board-run').addEventListener('click', async () => {
      const dated = tasks.filter(t => t.due_date && t.status !== 'done').map(t => t.id);
      if (dated.length === 0) { Shell.toast('No dated tasks to push. Set due dates first.'); return; }
      const r = await API.pushTasksToKronos(dated);
      Shell.toast(`Pushed ${r.pushed} tasks to Kronos`, { type: 'success' });
    });
    
    el.querySelector('#board-detail-close').addEventListener('click', () => {
      el.querySelector('#board-detail').hidden = true;
      selectedTask = null;
      render();
    });
    
    el.querySelector('#bd-save').addEventListener('click', () => saveDetail(el));
    el.querySelector('#bd-delete').addEventListener('click', () => deleteSelected(el));
    
    // Drag and drop on canvas
    boardArea.addEventListener('mousedown', onMouseDown);
    boardArea.addEventListener('mousemove', onMouseMove);
    boardArea.addEventListener('mouseup', onMouseUp);
    boardArea.addEventListener('click', e => { if (e.target === boardArea || e.target === nodesEl) { closeDetail(el); } });
  }
  
  async function load() {
    const data = await API.tasks();
    tasks = data.tasks || [];
    if (tasks.length === 0) {
      // Create sample tasks
      const samples = ['Define project scope', 'Design architecture', 'Implement core engine', 'QA and testing', 'Launch'];
      for (let i = 0; i < samples.length; i++) {
        const t = await API.createTask({
          title: samples[i], status: i === 0 ? 'in_progress' : 'todo',
          x: 40 + (i % 3) * 240, y: 40 + Math.floor(i/3) * 140
        });
        tasks.push(t);
      }
    }
    render();
  }
  
  function render() {
    nodesEl.innerHTML = '';
    
    // Draw edges
    edgesEl.innerHTML = '';
    tasks.forEach((t, i) => {
      if (t.status === 'done') return;
      // Connect to next unfinished task in sequence
      const next = tasks.slice(i+1).find(x => x.status !== 'done');
      if (next && !tasks.find((tt,j) => j !== i && j < tasks.indexOf(next) && tt.status !== 'done' && Math.hypot((tt.x||0)-(next.x||0),(tt.y||0)-(next.y||0)) < Math.hypot((t.x||0)-(next.x||0),(t.y||0)-(next.y||0)))) {
        drawEdge(t, next);
      }
    });
    
    // Draw nodes
    tasks.forEach(t => {
      const card = document.createElement('div');
      card.className = 'task-card' + (t.status === 'done' ? ' done' : '') + (t.priority === 'high' ? ' high' : '') + (selectedTask === t.id ? ' selected' : '');
      card.style.left = (t.x||40) + 'px';
      card.style.top = (t.y||40) + 'px';
      card.dataset.id = t.id;
      card.innerHTML = `
        <div class="task-status ${t.status}"></div>
        <div class="task-title">${t.title}</div>
        ${t.due_date ? `<div class="task-due small">${new Date(t.due_date*1000).toLocaleDateString()}</div>` : ''}
      `;
      card.addEventListener('click', e => { e.stopPropagation(); openDetail(t); });
      nodesEl.appendChild(card);
    });
  }
  
  function drawEdge(a, b) {
    const ax = (a.x||40) + 100, ay = (a.y||40) + 40;
    const bx = (b.x||40), by = (b.y||40) + 40;
    const mx = (ax+bx)/2, my = (ay+by)/2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${ax},${ay} Q${mx},${my-30} ${bx},${by}`);
    path.setAttribute('stroke', 'rgba(255,255,255,.15)');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('fill', 'none');
    edgesEl.appendChild(path);
  }
  
  function onMouseDown(e) {
    const card = e.target.closest('.task-card');
    if (!card) return;
    const id = parseInt(card.dataset.id);
    dragTask = tasks.find(t => t.id === id);
    if (dragTask) {
      const rect = boardArea.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left - (dragTask.x||0);
      dragOffset.y = e.clientY - rect.top - (dragTask.y||0);
      card.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }
  
  function onMouseMove(e) {
    if (!dragTask) return;
    const rect = boardArea.getBoundingClientRect();
    dragTask.x = e.clientX - rect.left - dragOffset.x;
    dragTask.y = e.clientY - rect.top - dragOffset.y;
    render();
  }
  
  function onMouseUp() {
    if (dragTask) {
      API.updateTask(dragTask.id, { x: dragTask.x, y: dragTask.y });
      dragTask = null;
    }
  }
  
  function openDetail(t) {
    selectedTask = t.id;
    const panel = document.querySelector('.board-panel.active #board-detail');
    if (!panel) return;
    panel.hidden = false;
    panel.querySelector('#bd-title').textContent = t.title;
    panel.querySelector('#bd-status').value = t.status;
    panel.querySelector('#bd-priority').value = t.priority;
    panel.querySelector('#bd-owner').value = t.owner || '';
    panel.querySelector('#bd-due').value = t.due_date ? new Date(t.due_date*1000).toISOString().slice(0,10) : '';
    panel.querySelector('#bd-desc').value = t.description || '';
    render();
  }
  
  function closeDetail(el) {
    el.querySelector('#board-detail').hidden = true;
    selectedTask = null;
    render();
  }
  
  async function saveDetail(el) {
    if (!selectedTask) return;
    const dueStr = el.querySelector('#bd-due').value;
    const due = dueStr ? new Date(dueStr).getTime() : null;
    const updates = {
      status: el.querySelector('#bd-status').value,
      priority: el.querySelector('#bd-priority').value,
      owner: el.querySelector('#bd-owner').value,
      due_date: due,
      description: el.querySelector('#bd-desc').value,
    };
    const t = await API.updateTask(selectedTask, updates);
    const idx = tasks.findIndex(x => x.id === selectedTask);
    if (idx >= 0) tasks[idx] = t;
    closeDetail(el);
    render();
    Shell.toast('Task updated');
  }
  
  async function deleteSelected(el) {
    if (!selectedTask) return;
    await API.deleteTask(selectedTask);
    tasks = tasks.filter(t => t.id !== selectedTask);
    closeDetail(el);
    render();
    Shell.toast('Task deleted');
  }
  
  Workspace.register('board', mount);
})();
