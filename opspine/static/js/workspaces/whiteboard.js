/* ==========================================================================
   Whiteboard — note placement, links, selection, pan and zoom.
   Coordinates are stored in board space; the stage applies one transform.
   ========================================================================== */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;

  const root = document.querySelector('[data-whiteboard]');
  if (!root) return;

  const dom = {
    boardList: document.getElementById('wb-board-list'),
    boardName: document.getElementById('wb-board-name'),
    newBoard: document.getElementById('wb-new-board'),
    deleteBoard: document.getElementById('wb-delete-board'),
    save: document.getElementById('wb-save'),
    stage: document.getElementById('wb-stage'),
    links: document.getElementById('wb-links'),
    nodes: document.getElementById('wb-nodes'),
    hint: document.getElementById('wb-hint'),
    empty: document.getElementById('wb-empty'),
    emptyAdd: document.getElementById('wb-empty-add'),
    zoomLabel: document.getElementById('wb-zoom-label'),
    zoomIn: document.getElementById('wb-zoom-in'),
    zoomOut: document.getElementById('wb-zoom-out'),
    zoomReset: document.getElementById('wb-zoom-reset'),
    zoomFit: document.getElementById('wb-zoom-fit'),
    renameBoard: document.getElementById('wb-rename-board'),
    editor: document.getElementById('wb-editor'),
    editorInput: document.getElementById('wb-editor-input'),
    editorDone: document.getElementById('wb-editor-done'),
    editorDelete: document.getElementById('wb-editor-delete'),
    saveState: document.getElementById('wb-save-state'),
    undo: document.getElementById('wb-undo'),
  };

  const state = {
    boards: [],
    board: null,
    data: { nodes: [], links: [], viewport: { x: 0, y: 0, zoom: 1 } },
    tool: 'select',
    selected: null,
    linkSource: null,
    dirty: false,
    dragging: null,
    panning: null,
    editingId: null,
    colour: '#c4a1ff',
    lastPointer: { x: 0, y: 0 },
  };

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */
  function uid() {
    return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  /* setPointerCapture is optional: it smooths dragging but is not
     implemented in every engine, so a failure must not abort the gesture. */
  function capturePointer(element, pointerId) {
    if (!element || typeof element.setPointerCapture !== 'function') return;
    try {
      element.setPointerCapture(pointerId);
    } catch (err) {
      /* Dragging still works from pointermove on the stage. */
    }
  }

  function nodeById(id) {
    return state.data.nodes.find((node) => node.id === id);
  }

  /* Convert a browser event into board coordinates. */
  function toBoard(event) {
    const rect = dom.stage.getBoundingClientRect();
    const { x, y, zoom } = state.data.viewport;
    return {
      x: (event.clientX - rect.left - x) / zoom,
      y: (event.clientY - rect.top - y) / zoom,
    };
  }

  function setTool(tool) {
    state.tool = tool;
    dom.stage.dataset.tool = tool;
    U.$$('[data-tool]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.tool === tool);
    });
    if (tool !== 'link') {
      state.linkSource = null;
      render();
    }
    if (tool === 'note') {
      dom.stage.focus();
    }
  }

  function markDirty() {
    state.dirty = true;
    dom.save.classList.add('is-active');
    syncSaveState();
  }

  /* The stage carries its own status so unsaved work is never invisible. */
  function syncSaveState() {
    if (!dom.saveState) return;
    dom.saveState.textContent = state.dirty ? 'Unsaved changes' : 'Saved';
    dom.saveState.classList.toggle('is-dirty', state.dirty);
  }

  /* ------------------------------------------------------------------ */
  /* Undo — a bounded stack of board snapshots                          */
  /* ------------------------------------------------------------------ */
  const HISTORY_LIMIT = 30;
  const history = [];

  function snapshot() {
    return JSON.stringify({ nodes: state.data.nodes, links: state.data.links });
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > HISTORY_LIMIT) history.shift();
    syncUndoButton();
  }

  function syncUndoButton() {
    if (dom.undo) dom.undo.disabled = history.length === 0;
  }

  /* Restore the last snapshot. Editing state is cleared first so the
     editor cannot write a stale note back over the restored board. */
  function undo() {
    if (!history.length) {
      U.toast('Nothing left to undo.');
      return;
    }
    const previous = JSON.parse(history.pop());
    if (state.editingId) {
      state.editingId = null;
      dom.editor.hidden = true;
    }
    state.data.nodes = previous.nodes;
    state.data.links = previous.links;
    state.selected = null;
    state.linkSource = null;
    markDirty();
    render();
    syncUndoButton();
    U.toast('Undone.');
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */
  function render() {
    const { x, y, zoom } = state.data.viewport;
    dom.nodes.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    dom.nodes.style.transformOrigin = '0 0';
    dom.links.setAttribute('viewBox', `0 0 ${dom.stage.clientWidth} ${dom.stage.clientHeight}`);
    dom.links.style.transform = 'none';

    U.clear(dom.nodes);
    state.data.nodes.forEach((node) => {
      const links = state.data.links.filter(
        (link) => link.from === node.id || link.to === node.id
      ).length;

      const element = U.el('div', {
        class: [
          'node',
          state.selected === node.id ? 'is-selected' : '',
          state.linkSource === node.id ? 'is-linking-source' : '',
        ].filter(Boolean).join(' '),
        dataset: { id: node.id },
        style: `left:${node.x}px; top:${node.y}px; --node-colour:${node.color}`,
        tabindex: '0',
        role: 'button',
        'aria-label': `Note: ${node.text || 'empty'}. ${links} links.`,
      }, [
        U.el('div', { class: 'node__text', text: node.text }),
        U.el('div', { class: 'node__meta' }, [
          U.el('span', { class: 'node__dot' }),
          U.el('span', { class: 'node__links', text: links ? `${links} link${links === 1 ? '' : 's'}` : 'no links' }),
        ]),
      ]);

      element.addEventListener('pointerdown', (event) => onNodePointerDown(event, node));
      element.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        openEditor(node.id, element);
      });
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          openEditor(node.id, element);
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          deleteNode(node.id);
        }
      });

      dom.nodes.appendChild(element);
    });

    renderLinks();
    dom.empty.hidden = state.data.nodes.length > 0;
    dom.save.classList.toggle('is-active', state.dirty);
    renderStats();
  }

  function renderLinks() {
    U.clear(dom.links);
    const { x, y, zoom } = state.data.viewport;
    const rect = dom.stage.getBoundingClientRect();
    const width = dom.stage.clientWidth;
    const height = dom.stage.clientHeight;

    state.data.links.forEach((link) => {
      const from = nodeById(link.from);
      const to = nodeById(link.to);
      if (!from || !to) return;

      /* Approximate connection points at each note's centre. */
      const x1 = from.x * zoom + x + 92 * zoom;
      const y1 = from.y * zoom + y + 32 * zoom;
      const x2 = to.x * zoom + x + 92 * zoom;
      const y2 = to.y * zoom + y + 32 * zoom;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const mx = (x1 + x2) / 2;
      path.setAttribute(
        'd',
        `M${x1.toFixed(1)},${y1.toFixed(1)} C${mx.toFixed(1)},${y1.toFixed(1)} ` +
        `${mx.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`
      );
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'rgba(196,161,255,0.55)');
      path.setAttribute('stroke-width', '1.6');
      path.setAttribute('stroke-dasharray', '5 4');
      /* Links have to be removable from the board, not just addable. A wide
         invisible hit path keeps the target comfortable to click. */
      path.classList.add('link-line');
      path.addEventListener('click', (event) => {
        event.stopPropagation();
        removeLink(link);
      });
      dom.links.appendChild(path);

      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', path.getAttribute('d'));
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '14');
      hit.setAttribute('class', 'link-hit');
      hit.addEventListener('click', (event) => {
        event.stopPropagation();
        removeLink(link);
      });
      dom.links.appendChild(hit);
    });
    /* Keep the SVG viewsize in sync with the stage. */
    dom.links.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  function removeLink(link) {
    pushHistory();
    state.data.links = state.data.links.filter(
      (item) => !(item.from === link.from && item.to === link.to)
    );
    markDirty();
    render();
    U.success('Link removed.');
  }

  function renderStats() {
    if (dom.zoomLabel) {
      dom.zoomLabel.textContent = `${Math.round(state.data.viewport.zoom * 100)}%`;
    }
    if (!dom.stats) return;
    U.clear(dom.stats);
    [
      ['Notes', state.data.nodes.length],
      ['Links', state.data.links.length],
      ['Zoom', `${Math.round(state.data.viewport.zoom * 100)}%`],
    ].forEach(([label, value]) => {
      dom.stats.appendChild(U.el('div', {}, [
        U.el('dt', { text: label }),
        U.el('dd', { text: String(value) }),
      ]));
    });
    dom.zoomLabel.textContent = `${Math.round(state.data.viewport.zoom * 100)}%`;
  }

  /* ------------------------------------------------------------------ */
  /* Note interactions                                                  */
  /* ------------------------------------------------------------------ */
  function onNodePointerDown(event, node) {
    event.stopPropagation();
    if (state.tool === 'link') {
      handleLinkClick(node);
      return;
    }

    state.selected = node.id;
    render();

    const startBoard = toBoard(event);
    const origin = { x: node.x, y: node.y };
    state.dragging = { id: node.id, startBoard, origin, moved: false };
    capturePointer(dom.stage, event.pointerId);

    const target = event.currentTarget;
    target.classList.add('is-dragging');
  }

  function handleLinkClick(node) {
    if (!state.linkSource) {
      state.linkSource = node.id;
      U.toast('Now click the second note to connect it.');
      render();
      return;
    }
    if (state.linkSource === node.id) {
      state.linkSource = null;
      render();
      return;
    }

    const exists = state.data.links.some(
      (link) =>
        (link.from === state.linkSource && link.to === node.id) ||
        (link.from === node.id && link.to === state.linkSource)
    );
    if (exists) {
      U.error('Those notes are already connected.');
    } else {
      pushHistory();
      state.data.links.push({ from: state.linkSource, to: node.id });
      markDirty();
      U.success('Notes connected.');
    }
    state.linkSource = null;
    render();
  }

  dom.stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.node') || event.target.closest('.wb__empty')) return;
    if (event.button === 1 || event.getModifierState('Space') || event.button === 0 && spaceHeld()) {
      state.panning = {
        start: { x: event.clientX, y: event.clientY },
        origin: { ...state.data.viewport },
      };
      dom.stage.classList.add('is-panning');
      capturePointer(dom.stage, event.pointerId);
      return;
    }

    if (state.tool === 'note') {
      const point = toBoard(event);
      addNode(point.x - 92, point.y - 30);
      return;
    }

    /* Clicking empty canvas clears selection and closes the editor. */
    state.selected = null;
    closeEditor();
    render();
  });

  dom.stage.addEventListener('pointermove', (event) => {
    state.lastPointer = { x: event.clientX, y: event.clientY };

    if (state.panning) {
      state.data.viewport.x = state.panning.origin.x + (event.clientX - state.panning.start.x);
      state.data.viewport.y = state.panning.origin.y + (event.clientY - state.panning.start.y);
      const { x, y, zoom } = state.data.viewport;
      dom.nodes.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
      renderLinks();
      return;
    }

    if (state.dragging) {
      const current = toBoard(event);
      const node = nodeById(state.dragging.id);
      if (!node) return;
      const dx = current.x - state.dragging.startBoard.x;
      const dy = current.y - state.dragging.startBoard.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) state.dragging.moved = true;
      node.x = Math.round(state.dragging.origin.x + dx);
      node.y = Math.round(state.dragging.origin.y + dy);
      const element = dom.nodes.querySelector(`[data-id="${node.id}"]`);
      if (element) {
        element.style.left = `${node.x}px`;
        element.style.top = `${node.y}px`;
      }
      renderLinks();
    }
  });

  function endPointer(pointerId) {
    if (state.panning) {
      state.panning = null;
      dom.stage.classList.remove('is-panning');
      markDirty();
    }
    if (state.dragging) {
      const moved = state.dragging.moved;
      const id = state.dragging.id;
      state.dragging = null;
      if (moved) {
        markDirty();
        render();
      } else {
        /* A click without movement opens the editor. */
        const element = dom.nodes.querySelector(`[data-id="${id}"]`);
        if (element) openEditor(id, element);
      }
    }
  }

  dom.stage.addEventListener('pointerup', (event) => endPointer(event.pointerId));
  dom.stage.addEventListener('pointercancel', () => endPointer(null));

  /* Track space for panning without conflicting with typing. */
  let spaceDown = false;
  function spaceHeld() {
    return spaceDown;
  }

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !isTyping(event.target)) {
      spaceDown = true;
      dom.stage.classList.add('is-panning');
    }
  });
  document.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
      spaceDown = false;
      if (!state.panning) dom.stage.classList.remove('is-panning');
    }
  });

  function isTyping(target) {
    if (!target) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
      target.isContentEditable;
  }

  /* ------------------------------------------------------------------ */
  /* Notes: add, edit, delete                                           */
  /* ------------------------------------------------------------------ */
  function addNode(x, y) {
    pushHistory();
    const node = {
      id: uid(),
      text: '',
      x: Math.round(x),
      y: Math.round(y),
      color: state.colour,
    };
    state.data.nodes.push(node);
    state.selected = node.id;
    markDirty();
    render();
    const element = dom.nodes.querySelector(`[data-id="${node.id}"]`);
    if (element) openEditor(node.id, element);
    window.OPS.shell.refreshActivity();
  }

  function openEditor(id, anchor) {
    const node = nodeById(id);
    if (!node) return;
    state.editingId = id;
    state.editingSnapshot = snapshot();
    dom.editor.hidden = false;
    dom.editorInput.value = node.text;
    state.colour = node.color;

    const stageRect = dom.stage.getBoundingClientRect();
    const nodeRect = anchor.getBoundingClientRect();
    const { x, y, zoom } = state.data.viewport;

    let left = nodeRect.right - stageRect.left + 10;
    let top = nodeRect.top - stageRect.top;
    if (left + 340 > stageRect.width) left = Math.max(8, nodeRect.left - stageRect.left - 340);
    if (top + 200 > stageRect.height) top = Math.max(8, stageRect.height - 210);

    dom.editor.style.left = `${Math.max(8, left)}px`;
    dom.editor.style.top = `${Math.max(8, top)}px`;

    U.$$('.wb__swatch').forEach((swatch) => {
      swatch.classList.toggle('is-active', swatch.dataset.colour === node.color);
    });

    setTimeout(() => {
      dom.editorInput.focus();
      dom.editorInput.select();
    }, 30);
  }

  function closeEditor() {
    if (state.editingId) {
      const node = nodeById(state.editingId);
      if (node) node.text = dom.editorInput.value.trim();
      const empty = node && !node.text && state.data.nodes.length > 1;
      if (node && !node.text && empty) {
        state.data.nodes = state.data.nodes.filter((n) => n.id !== node.id);
      }
      if (node && node.text) {
        /* Text changed through typing: one snapshot per editing session. */
        if (state.editingSnapshot && state.editingSnapshot !== snapshot()) {
          history.push(state.editingSnapshot);
          if (history.length > HISTORY_LIMIT) history.shift();
        }
        syncUndoButton();
      }
      markDirty();
    }
    state.editingId = null;
    state.editingSnapshot = null;
    dom.editor.hidden = true;
    render();
  }

  function deleteNode(id) {
    const before = state.data.nodes.length;
    pushHistory();
    state.data.nodes = state.data.nodes.filter((node) => node.id !== id);
    state.data.links = state.data.links.filter(
      (link) => link.from !== id && link.to !== id
    );
    if (state.data.nodes.length !== before) {
      markDirty();
      state.selected = null;
      if (state.editingId === id) {
        state.editingId = null;
        dom.editor.hidden = true;
      }
      render();
    }
  }

  /* Editor wiring */
  dom.editorInput.addEventListener('input', () => {
    const node = nodeById(state.editingId);
    if (node) {
      node.text = dom.editorInput.value;
      const element = dom.nodes.querySelector(`[data-id="${node.id}"] .node__text`);
      if (element) element.textContent = node.text;
    }
  });

  dom.editorInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeEditor();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      closeEditor();
    }
  });

  dom.editorDone.addEventListener('click', closeEditor);
  dom.editorDelete.addEventListener('click', () => {
    if (state.editingId) deleteNode(state.editingId);
  });

  U.$$('.wb__swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const node = nodeById(state.editingId);
      if (!node) return;
      node.color = swatch.dataset.colour;
      state.colour = node.color;
      U.$$('.wb__swatch').forEach((s) => {
        s.classList.toggle('is-active', s === swatch);
      });
      const element = dom.nodes.querySelector(`[data-id="${node.id}"]`);
      if (element) element.style.setProperty('--node-colour', node.color);
      markDirty();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Zoom                                                               */
  /* ------------------------------------------------------------------ */
  function setZoom(next) {
    state.data.viewport.zoom = Math.min(3, Math.max(0.25, Number(next.toFixed(2))));
    render();
    markDirty();
  }

  dom.zoomIn.addEventListener('click', () => setZoom(state.data.viewport.zoom + 0.1));
  dom.zoomOut.addEventListener('click', () => setZoom(state.data.viewport.zoom - 0.1));
  dom.zoomReset.addEventListener('click', () => {
    state.data.viewport = { x: 0, y: 0, zoom: 1 };
    render();
    markDirty();
  });

  /* Frame every note. With nothing on the board this is just a reset. */
  dom.zoomFit.addEventListener('click', () => {
    const nodes = state.data.nodes;
    if (!nodes.length) {
      state.data.viewport = { x: 0, y: 0, zoom: 1 };
      render();
      return;
    }
    const NODE_W = 184;
    const NODE_H = 64;
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + NODE_W));
    const maxY = Math.max(...nodes.map((n) => n.y + NODE_H));
    const pad = 48;
    const width = dom.stage.clientWidth - pad * 2;
    const height = dom.stage.clientHeight - pad * 2;
    const zoom = Math.min(1.4, Math.max(0.25,
      Math.min(width / (maxX - minX), height / (maxY - minY))));
    state.data.viewport = {
      zoom: Number(zoom.toFixed(2)),
      x: Math.round((dom.stage.clientWidth - (maxX - minX) * zoom) / 2 - minX * zoom),
      y: Math.round((dom.stage.clientHeight - (maxY - minY) * zoom) / 2 - minY * zoom),
    };
    render();
    markDirty();
    U.toast(`Zoomed to fit ${nodes.length} note${nodes.length === 1 ? '' : 's'}.`);
  });

  /* Ctrl + wheel zooms; plain wheel pans vertically. */
  dom.stage.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      setZoom(state.data.viewport.zoom + (event.deltaY > 0 ? -0.08 : 0.08));
    } else if (!event.shiftKey) {
      event.preventDefault();
      state.data.viewport.y -= event.deltaY;
      state.data.viewport.x -= event.deltaX;
      render();
    }
  }, { passive: false });

  /* ------------------------------------------------------------------ */
  /* Boards                                                             */
  /* ------------------------------------------------------------------ */
  async function loadBoards(selectId) {
    try {
      const data = await api.get('/api/whiteboard/boards');
      state.boards = data.boards;
      renderBoardList();
      if (!state.boards.length) {
        dom.deleteBoard.disabled = true;
        return;
      }
      dom.deleteBoard.disabled = false;
      const target = selectId || (state.board && state.board.id) || state.boards[0].id;
      highlightBoard(target);
    } catch (err) {
      U.error(err.message);
    }
  }

  /* The sidebar list is the only board switcher; the toolbar just shows the
     open board's name. */
  function renderBoardList() {
    if (!dom.boardList) return;
    U.clear(dom.boardList);
    if (!state.boards.length) {
      dom.boardList.appendChild(U.el('li', {
        class: 'ws-side__empty',
        text: 'No boards yet. Press New to make one.',
      }));
      return;
    }
    state.boards.forEach((board) => {
      const active = state.board && state.board.id === board.id;
      dom.boardList.appendChild(U.el('li', {}, [
        U.el('button', {
          class: `ws-board${active ? ' is-active' : ''}`,
          type: 'button',
          dataset: { boardId: String(board.id) },
          onClick: () => chooseBoard(board.id),
        }, [
          U.el('span', { class: 'ws-board__name', text: board.name }),
          U.el('span', {
            class: 'ws-board__meta',
            text: `${board.node_count} note${board.node_count === 1 ? '' : 's'}`,
          }),
        ]),
      ]));
    });
  }

  function highlightBoard(id) {
    if (!dom.boardList) return;
    U.$$('.ws-board', dom.boardList).forEach((node) => {
      node.classList.toggle('is-active', Number(node.dataset.boardId) === Number(id));
    });
  }

  function chooseBoard(id) {
    if (state.board && id === state.board.id) return;
    if (state.dirty) {
      U.confirm({
        title: 'Unsaved board changes',
        message: 'This board has unsaved changes. Open another board and lose them?',
        confirmLabel: 'Discard changes',
      }).then((ok) => { if (ok) openBoard(id); });
      return;
    }
    openBoard(id);
  }

  async function openBoard(id) {
    try {
      const data = await api.get(`/api/whiteboard/boards/${id}`);
      state.board = data.board;
      state.data = {
        nodes: data.board.data.nodes || [],
        links: data.board.data.links || [],
        viewport: data.board.data.viewport || { x: 0, y: 0, zoom: 1 },
      };
      state.dirty = false;
      state.selected = null;
      state.linkSource = null;
      history.length = 0;
      syncUndoButton();
      closeEditor();
      render();
      syncSaveState();
      if (dom.boardName) dom.boardName.textContent = state.board.name;
      renderBoardList();
    } catch (err) {
      U.error(err.message);
    }
  }

  async function createBoard() {
    const name = await U.prompt({
      title: 'New board',
      message: 'Boards hold their own notes and links.',
      label: 'Board name',
      value: `Board ${state.boards.length + 1}`,
      confirmLabel: 'Create board',
    });
    if (name === null) return;
    try {
      const data = await api.post('/api/whiteboard/boards', {
        name: name || 'Untitled board',
      });
      await loadBoards(data.board.id);
      await openBoard(data.board.id);
      U.success('Board created.');
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    }
  }

  async function saveBoard() {
    if (!state.board) {
      U.error('Create a board first.');
      return;
    }
    dom.save.disabled = true;
    dom.save.textContent = 'Saving…';
    try {
      await api.put(`/api/whiteboard/boards/${state.board.id}`, {
        data: state.data,
      });
      state.dirty = false;
      render();
      syncSaveState();
      U.success('Board saved.');
      await loadBoards(state.board.id);
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    } finally {
      dom.save.disabled = false;
      dom.save.textContent = 'Save';
    }
  }

  async function renameBoard() {
    if (!state.board) return;
    const name = await U.prompt({
      title: 'Rename board',
      label: 'Board name',
      value: state.board.name,
      confirmLabel: 'Rename',
    });
    if (name === null || !name || name === state.board.name) return;
    try {
      await api.put(`/api/whiteboard/boards/${state.board.id}`, {
        name,
        data: state.data,
      });
      state.board.name = name;
      state.dirty = false;
      await loadBoards(state.board.id);
      render();
      U.success('Board renamed.');
      window.OPS.shell.refreshActivity();
    } catch (err) {
      U.error(err.message);
    }
  }

  async function deleteBoard() {
    if (!state.board) return;
    const ok = await U.confirm({
      title: 'Delete board?',
      message: `“${state.board.name}” and all its notes and links will be removed.`,
      confirmLabel: 'Delete board',
    });
    if (!ok) return;
    try {
      await api.del(`/api/whiteboard/boards/${state.board.id}`);
      state.board = null;
      state.data = { nodes: [], links: [], viewport: { x: 0, y: 0, zoom: 1 } };
      render();
      await loadBoards();
      if (state.boards.length) {
        await openBoard(state.boards[0].id);
      }
      U.success('Board deleted.');
    } catch (err) {
      U.error(err.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                             */
  /* ------------------------------------------------------------------ */
  dom.newBoard.addEventListener('click', createBoard);
  dom.renameBoard.addEventListener('click', renameBoard);
  dom.save.addEventListener('click', saveBoard);
  dom.undo.addEventListener('click', undo);

  /* Drop any pending unsaved work in favour of the dialog actions: they
     are explicit, and every path back to a saved state is one click away. */
  dom.save.addEventListener('keydown', (event) => {
    if (event.key === 's' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      saveBoard();
    }
  });
  dom.deleteBoard.addEventListener('click', deleteBoard);
  dom.emptyAdd.addEventListener('click', () => setTool('note'));

  U.$$('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => setTool(button.dataset.tool));
  });

  document.addEventListener('keydown', (event) => {
    if (isTyping(event.target)) return;
    if (event.key === 'v' || event.key === 'V') setTool('select');
    else if (event.key === 'n' || event.key === 'N') setTool('note');
    else if (event.key === 'l' || event.key === 'L') setTool('link');
    else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected) {
      event.preventDefault();
      deleteNode(state.selected);
    } else if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault();
      saveBoard();
    } else if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
      event.preventDefault();
      undo();
    } else if (event.key === 'Escape') {
      state.selected = null;
      state.linkSource = null;
      closeEditor();
      render();
    }
  });

  window.OPS.shell.registerPrimary('Add note', () => {
    setTool('note');
    const centreX = dom.stage.clientWidth / 2;
    const centreY = dom.stage.clientHeight / 2;
    const { x, y, zoom } = state.data.viewport;
    addNode((centreX - x) / zoom - 92, (centreY - y) / zoom - 30);
  });

  window.addEventListener('beforeunload', (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  /* ------------------------------------------------------------------ */
  /* Startup                                                            */
  /* ------------------------------------------------------------------ */
  (async function init() {
    setTool('select');
    render();
    await loadBoards();
    if (state.boards.length) {
      await openBoard(state.boards[0].id);
    } else {
      /* A first-run user still gets a board to work on without a prompt. */
      try {
        const data = await api.post('/api/whiteboard/boards', { name: 'First board' });
        await loadBoards(data.board.id);
        await openBoard(data.board.id);
      } catch (err) {
        U.error(`Could not create a board: ${err.message}`);
      }
    }
  })();
})();
