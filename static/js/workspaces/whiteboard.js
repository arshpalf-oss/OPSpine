/**
 * Whiteboard — Visual thinking (pure black, thin curves, circular marks)
 */
(function() {
  function mount() {
    const el = document.createElement('div');
    el.className = 'wb-panel';
    el.innerHTML = `
      <div class="wb-canvas-container canvas-dots">
        <canvas id="wb-canvas" class="wb-canvas"></canvas>
      </div>
      
      <div class="wb-toolbar glass-surface">
        <div class="wb-toolbar-group">
          <button class="wb-tool" id="wb-select" title="Select (V)" data-mode="select">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
          </button>
          <button class="wb-tool active" id="wb-node" title="Add Node (N)" data-mode="add">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>
          </button>
          <button class="wb-tool" id="wb-connect" title="Connect (C)" data-mode="connect">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
        </div>
        <div class="wb-toolbar-sep"></div>
        <div class="wb-toolbar-group">
          <button class="wb-tool" id="wb-delete" title="Delete selected">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <button class="wb-tool" id="wb-clear" title="Clear all">Clear</button>
        </div>
        <div class="wb-toolbar-group" style="margin-left:auto">
          <button class="wb-tool" id="wb-save" title="Save board">Save</button>
          <select id="wb-board-select" class="wb-select"></select>
          <button class="wb-tool" id="wb-new-board" title="New board">+</button>
        </div>
      </div>
      
      <div class="wb-hint" id="wb-hint">Click anywhere to add a node · Drag to move · Select two nodes and press C to connect</div>
      
      <div class="wb-info" id="wb-info">
        <h1 class="wb-wordmark">WHITEBOARD</h1>
        <p id="wb-node-count">0 nodes</p>
      </div>
    `;
    setTimeout(() => initWhiteboard(el), 0);
    return el;
  }
  
  let canvas, ctx;
  let nodes = [], edges = [];
  let mode = 'add';
  let dragging = null, dragOffset = {x:0,y:0};
  let selected = null, connectFrom = null;
  let currentBoardId = null;
  
  function initWhiteboard(el) {
    canvas = el.querySelector('#wb-canvas');
    ctx = canvas.getContext('2d');
    
    function resize() {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
      draw();
    }
    resize();
    window.addEventListener('resize', resize);
    
    el.querySelectorAll('[data-mode]').forEach(b => {
      b.addEventListener('click', () => {
        el.querySelectorAll('[data-mode]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        mode = b.dataset.mode;
        connectFrom = null;
        draw();
      });
    });
    
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('click', onClick);
    
    el.querySelector('#wb-clear').addEventListener('click', () => {
      if (confirm('Clear all nodes?')) { nodes = []; edges = []; selected = null; connectFrom = null; draw(); updateCount(el); }
    });
    
    el.querySelector('#wb-delete').addEventListener('click', () => {
      if (selected !== null) {
        nodes = nodes.filter((_,i) => i !== selected);
        edges = edges.filter(e => e.from !== selected && e.to !== selected);
        selected = null; draw(); updateCount(el);
      }
    });
    
    el.querySelector('#wb-save').addEventListener('click', () => saveBoard(el));
    el.querySelector('#wb-new-board').addEventListener('click', () => newBoard(el));
    el.querySelector('#wb-board-select').addEventListener('change', e => loadBoard(e.target.value, el));
    
    loadBoardsList(el);
    
    // Keyboard
    el.addEventListener('keydown', e => {});
    window.addEventListener('keydown', e => {
      if (!document.querySelector('.wb-panel.active')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected !== null && document.activeElement.tagName !== 'INPUT') {
          nodes = nodes.filter((_,i) => i !== selected);
          edges = edges.filter(ed => ed.from !== selected && ed.to !== selected);
          selected = null; draw(); updateCount(el);
        }
      }
      if (e.key === 'n' || e.key === 'N') { el.querySelector('[data-mode="add"]').click(); }
      if (e.key === 'c' || e.key === 'C') { el.querySelector('[data-mode="connect"]').click(); }
      if (e.key === 'v' || e.key === 'V') { el.querySelector('[data-mode="select"]').click(); }
    });
  }
  
  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    
    const hit = findNode(x, y);
    
    if (mode === 'add' && hit === -1) {
      nodes.push({ x, y, label: `Idea ${nodes.length+1}`, r: 28 });
      draw(); updateCount(document.querySelector('.wb-panel.active'));
    } else if (mode === 'connect') {
      if (hit !== -1) {
        if (connectFrom === null) connectFrom = hit;
        else if (connectFrom !== hit) {
          edges.push({ from: connectFrom, to: hit });
          connectFrom = null;
        }
        draw();
      }
    } else if (mode === 'select') {
      selected = hit;
      draw();
    }
  }
  
  function onMouseDown(e) {
    if (mode !== 'select' && mode !== 'add') return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const hit = findNode(x, y);
    if (hit !== -1) {
      dragging = hit;
      dragOffset = { x: x - nodes[hit].x, y: y - nodes[hit].y };
      selected = hit;
      canvas.style.cursor = 'grabbing';
      draw();
    }
  }
  
  function onMouseMove(e) {
    if (dragging === null) return;
    const rect = canvas.getBoundingClientRect();
    nodes[dragging].x = e.clientX - rect.left - dragOffset.x;
    nodes[dragging].y = e.clientY - rect.top - dragOffset.y;
    draw();
  }
  
  function onMouseUp() {
    dragging = null;
    canvas.style.cursor = '';
  }
  
  function findNode(x, y) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const d = Math.hypot(x - n.x, y - n.y);
      if (d < n.r) return i;
    }
    return -1;
  }
  
  function draw() {
    if (!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    
    // Edges (curved)
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1.5;
    edges.forEach(edge => {
      const a = nodes[edge.from], b = nodes[edge.to];
      if (!a || !b) return;
      const mx = (a.x+b.x)/2, my = (a.y+b.y)/2 - 40;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
    });
    
    // Connect preview
    if (connectFrom !== null && mode === 'connect') {
      const n = nodes[connectFrom];
      if (n) {
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.setLineDash([4,4]);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r+8, 0, Math.PI*2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    
    // Nodes
    nodes.forEach((n, i) => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
      ctx.fillStyle = i === selected ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.06)';
      ctx.fill();
      ctx.strokeStyle = i === selected ? '#fff' : 'rgba(255,255,255,.4)';
      ctx.lineWidth = i === selected ? 2 : 1;
      ctx.stroke();
      
      ctx.fillStyle = '#fff';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.label.slice(0, 8), n.x, n.y);
    });
  }
  
  function updateCount(el) {
    const c = el.querySelector('#wb-node-count');
    if (c) c.textContent = `${nodes.length} nodes · ${edges.length} edges`;
  }
  
  async function saveBoard(el) {
    try {
      const name = prompt('Board name:', 'Board ' + new Date().toLocaleString());
      if (!name) return;
      let data;
      if (currentBoardId) {
        data = await API.updateBoard(currentBoardId, { name, nodes, edges });
      } else {
        data = await API.createBoard({ name, nodes, edges });
        currentBoardId = data.id;
      }
      Shell.toast('Board saved');
      loadBoardsList(el);
    } catch(err) { Shell.toast(err.message, {type:'error'}); }
  }
  
  async function loadBoardsList(el) {
    const sel = el.querySelector('#wb-board-select');
    try {
      const data = await API.boards();
      sel.innerHTML = '<option value="">— Select board —</option>' +
        (data.boards||[]).map(b => `<option value="${b.id}">${b.name}</option>`).join('');
      if (currentBoardId) sel.value = currentBoardId;
    } catch(e) {}
  }
  
  async function loadBoard(id, el) {
    if (!id) { nodes = []; edges = []; currentBoardId = null; draw(); updateCount(el); return; }
    try {
      const b = await API.getBoard(id);
      nodes = b.nodes || []; edges = b.edges || []; currentBoardId = id;
      draw(); updateCount(el);
    } catch(e) {}
  }
  
  function newBoard(el) {
    nodes = []; edges = []; selected = null; connectFrom = null; currentBoardId = null;
    el.querySelector('#wb-board-select').value = '';
    draw(); updateCount(el);
  }
  
  Workspace.register('whiteboard', mount);
})();
