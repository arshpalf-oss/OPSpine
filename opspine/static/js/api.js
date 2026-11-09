/* ==========================================================================
   OPSpine API client
   Relative URLs only. Every call resolves to {ok, data} or throws ApiError
   with a message that is safe to show the user.
   ========================================================================== */
(function () {
  'use strict';

  class ApiError extends Error {
    constructor(message, status, payload) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.payload = payload || {};
      this.field = (payload && payload.field) || null;
    }
  }

  async function request(path, options = {}) {
    const opts = Object.assign({ method: 'GET', headers: {} }, options);
    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }

    let response;
    try {
      response = await fetch(path, opts);
    } catch (err) {
      throw new ApiError(
        'OPSpine could not reach its local server. Is it still running?',
        0,
        { network: true }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    let payload = null;
    if (contentType.includes('application/json')) {
      try {
        payload = await response.json();
      } catch (err) {
        payload = null;
      }
    }

    if (!response.ok) {
      const message =
        (payload && payload.error) ||
        `The server returned ${response.status}.`;
      throw new ApiError(message, response.status, payload);
    }

    return payload;
  }

  const get = (path) => request(path);
  const post = (path, body) => request(path, { method: 'POST', body });
  const put = (path, body) => request(path, { method: 'PUT', body });
  const patch = (path, body) => request(path, { method: 'PATCH', body });
  const del = (path) => request(path, { method: 'DELETE' });

  async function upload(path, file) {
    const form = new FormData();
    form.append('file', file);
    return request(path, { method: 'POST', body: form });
  }

  /* Ask the browser to save a file it just downloaded from the API. */
  async function download(path, fallbackName) {
    const response = await fetch(path, { method: 'GET' });
    if (!response.ok) {
      let message = `Download failed (${response.status}).`;
      try {
        const payload = await response.json();
        if (payload && payload.error) message = payload.error;
      } catch (err) {
        /* keep the default message */
      }
      throw new ApiError(message, response.status, {});
    }
    const blob = await response.blob();
    let filename = fallbackName || 'download';
    const disposition = response.headers.get('content-disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    if (match) filename = match[1];

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return filename;
  }

  window.OPS = window.OPS || {};
  window.OPS.api = { get, post, put, patch, del, upload, download, request, ApiError };
})();
