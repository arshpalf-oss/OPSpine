/**
 * OPSpine API client — structured JSON calls with AbortController support.
 */
const API = (() => {
  const controllers = new Map();
  
  async function request(method, url, body, signal) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal,
    };
    if (body) opts.body = JSON.stringify(body);
    
    const res = await fetch(url, opts);
    if (!res.ok) {
      let err;
      try { err = await res.json(); } catch { err = { error: `HTTP ${res.status}` }; }
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }
    return res.json();
  }
  
  function get(url) { return request('GET', url); }
  function post(url, body) { return request('POST', url, body); }
  function put(url, body) { return request('PUT', url, body); }
  function del(url) { return request('DELETE', url); }
  
  function cancel(tag) {
    if (controllers.has(tag)) {
      controllers.get(tag).abort();
      controllers.delete(tag);
    }
  }
  
  function cancellable(tag) {
    cancel(tag);
    const ctrl = new AbortController();
    controllers.set(tag, ctrl);
    return ctrl.signal;
  }
  
  // ── Meta ────────────────────────────────────────────────────────────
  const routes = () => get('/api/routes');
  const meta = () => get('/api/meta');
  
  // ── Settings ────────────────────────────────────────────────────────
  const getSettings = () => get('/api/settings');
  const saveSettings = (data) => post('/api/settings', data);
  
  // ── Dashboard ───────────────────────────────────────────────────────
  const dashboard = () => get('/api/dashboard');
  const activity = (limit = 30) => get(`/api/activity?limit=${limit}`);
  
  // ── Commands ────────────────────────────────────────────────────────
  const commands = () => get('/api/commands');
  const addCommand = (data) => post('/api/commands', data);
  
  // ── AI Core ─────────────────────────────────────────────────────────
  const aiComplete = (task, opts = {}) => post('/api/ai/complete', { task, opts });
  const aiRoute = (prompt) => post('/api/ai/route', { prompt });
  const aiSearch = (query, opts = {}) => post('/api/ai/search', { query, opts });
  const aiVerify = (claim, opts = {}) => post('/api/ai/verify', { claim, opts });
  const aiStatus = () => get('/api/ai/status');
  const aiUsage = () => get('/api/ai/usage');
  
  // ── Scout (briefs) ──────────────────────────────────────────────────
  const briefs = () => get('/api/briefs');
  const createBrief = (query, mode = 'quick') => post('/api/briefs', { query, mode });
  const getBrief = (id) => get(`/api/briefs/${id}`);
  const deleteBrief = (id) => del(`/api/briefs/${id}`);
  
  // ── Forge ───────────────────────────────────────────────────────────
  const documents = () => get('/api/documents');
  const forgeGenerate = (type, prompt) => post('/api/forge/generate', { type, prompt });
  const deleteDocument = (id) => del(`/api/documents/${id}`);
  const documentUrl = (filename) => `/api/documents/${encodeURIComponent(filename)}`;
  
  // ── Quill ───────────────────────────────────────────────────────────
  const drafts = () => get('/api/drafts');
  const createDraft = (title, content = '') => post('/api/drafts', { title, content });
  const getDraft = (id) => get(`/api/drafts/${id}`);
  const updateDraft = (id, data) => put(`/api/drafts/${id}`, data);
  const deleteDraft = (id) => del(`/api/drafts/${id}`);
  const quillTransform = (text, action) => post('/api/quill/transform', { text, action });
  
  // ── Kronos ──────────────────────────────────────────────────────────
  const events = (start, end) => {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const qs = params.toString();
    return get(`/api/events${qs ? '?' + qs : ''}`);
  };
  const createEvent = (data) => post('/api/events', data);
  const updateEvent = (id, data) => put(`/api/events/${id}`, data);
  const deleteEvent = (id) => del(`/api/events/${id}`);
  const kronosParse = (text) => post('/api/kronos/parse', { text });
  const kronosSuggest = (duration = 60) => post('/api/kronos/suggest', { duration });
  
  // ── Whiteboard ──────────────────────────────────────────────────────
  const boards = () => get('/api/boards');
  const createBoard = (data) => post('/api/boards', data);
  const getBoard = (id) => get(`/api/boards/${id}`);
  const updateBoard = (id, data) => put(`/api/boards/${id}`, data);
  const deleteBoard = (id) => del(`/api/boards/${id}`);
  
  // ── Tasks / Working Board ───────────────────────────────────────────
  const tasks = (boardId) => {
    const qs = boardId ? `?board_id=${boardId}` : '';
    return get(`/api/tasks${qs}`);
  };
  const createTask = (data) => post('/api/tasks', data);
  const updateTask = (id, data) => put(`/api/tasks/${id}`, data);
  const deleteTask = (id) => del(`/api/tasks/${id}`);
  const pushTasksToKronos = (taskIds) => post('/api/tasks/push-to-kronos', { task_ids: taskIds });
  
  // ── Conversations ───────────────────────────────────────────────────
  const conversations = (workspace) => {
    const qs = workspace ? `?workspace=${workspace}` : '';
    return get(`/api/conversations${qs}`);
  };
  const createConversation = (workspace) => post('/api/conversations', { workspace, messages: [] });
  const getConversation = (id) => get(`/api/conversations/${id}`);
  const addMessage = (id, message, workspace) => post(`/api/conversations/${id}/message`, { message, workspace });
  
  // ── Knowledge ───────────────────────────────────────────────────────
  const knowledge = () => get('/api/knowledge');
  const addKnowledge = (data) => post('/api/knowledge', data);
  
  // ── Inbox ───────────────────────────────────────────────────────────
  const inbox = () => get('/api/inbox');
  const markRead = (id) => post(`/api/inbox/${id}/read`);
  
  // ── System ──────────────────────────────────────────────────────────
  const backup = () => post('/api/system/backup');
  const restore = (data) => post('/api/system/restore', data);
  const clearSamples = () => post('/api/system/clear-samples');
  
  return {
    cancel, cancellable,
    get, post, put, del, request,
    routes, meta,
    getSettings, saveSettings,
    dashboard, activity,
    commands, addCommand,
    aiComplete, aiRoute, aiSearch, aiVerify, aiStatus, aiUsage,
    briefs, createBrief, getBrief, deleteBrief,
    documents, forgeGenerate, deleteDocument, documentUrl,
    drafts, createDraft, getDraft, updateDraft, deleteDraft, quillTransform,
    events, createEvent, updateEvent, deleteEvent, kronosParse, kronosSuggest,
    boards, createBoard, getBoard, updateBoard, deleteBoard,
    tasks, createTask, updateTask, deleteTask, pushTasksToKronos,
    conversations, createConversation, getConversation, addMessage,
    knowledge, addKnowledge,
    inbox, markRead,
    backup, restore, clearSamples,
  };
})();
