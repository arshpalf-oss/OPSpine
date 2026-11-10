/* ==========================================================================
   Forge — format configuration, real generation, output preview and history.
   ========================================================================== */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;

  const root = document.querySelector('[data-forge]');
  if (!root) return;

  const dom = {
    form: document.getElementById('forge-form'),
    title: document.getElementById('forge-title'),
    body: document.getElementById('forge-body'),
    bodyLabel: document.getElementById('forge-body-label'),
    bodyHint: document.getElementById('forge-body-hint'),
    opts: document.getElementById('forge-opts'),
    author: document.getElementById('forge-author'),
    subtitle: document.getElementById('forge-subtitle'),
    page: document.getElementById('forge-page'),
    width: document.getElementById('forge-width'),
    height: document.getElementById('forge-height'),
    accent: document.getElementById('forge-accent'),
    generate: document.getElementById('forge-generate'),
    sample: document.getElementById('forge-sample'),
    stage: document.getElementById('forge-stage'),
    history: document.getElementById('forge-history'),
    note: document.getElementById('forge-note'),
    bodyCount: document.getElementById('forge-body-count'),
    clear: document.getElementById('forge-clear'),
    prevLabel: document.getElementById('forge-prev-label'),
    prevMeta: document.getElementById('forge-prev-meta'),
    prevBody: document.getElementById('forge-prev-body'),
  };

  const COPY = {
    pdf: {
      label: 'Content',
      hint: 'Each line is a paragraph. A line ending with ":" or starting with "#" becomes a heading. Lines starting with "-" become bullets.',
      opts: ['author', 'page_size'],
    },
    docx: {
      label: 'Content',
      hint: 'Headings use the same rules as PDF: end a line with ":" or start it with "#". "-" lines become bullets.',
      opts: ['author'],
    },
    pptx: {
      label: 'Slide content',
      hint: 'Each heading starts a new slide. The lines under it become bullets, up to nine per slide.',
      opts: ['author', 'subtitle'],
    },
    xlsx: {
      label: 'Rows',
      hint: 'One row per line, separated by commas, tabs or pipes. The first row becomes the header.',
      opts: [],
    },
    md: {
      label: 'Markdown body',
      hint: 'Written to the file as-is, under an H1 title. Markdown syntax is preserved.',
      opts: ['author'],
    },
    png: {
      label: 'Image text',
      hint: 'The title and these lines are rendered onto the image. Keep it short.',
      opts: ['size', 'accent'],
    },
  };

  const EXAMPLES = {
    pdf: 'Overview\nThis document was generated locally by OPSpine Forge.\n\nWhat it does\n- Produces real PDF files\n- Runs without a network connection\n- Stores output in data/documents\n\nNext steps\nReview the output and adjust the content as needed.',
    docx: 'Summary\nA short brief assembled from notes on this machine.\n\nKey points\n- Everything stays local\n- Files are standard Office documents\n\nActions\nOpen the file and continue editing.',
    pptx: 'Problem\nThe current process is manual and slow.\n\nApproach\n- Automate the repetitive steps\n- Keep a human in the loop\n\nOutcome\n- Faster turnaround\n- Clearer ownership',
    xlsx: 'Task, Owner, Status, Due\nDraft outline, You, In progress, 2026-11-12\nReview content, Team, To do, 2026-11-14\nPublish, You, To do, 2026-11-18',
    md: '## Notes\n\n- Generated offline\n- Markdown preserved\n\n> Edit this in any text editor.\n',
    png: 'A generated title card\nBuilt with Pillow\nStored locally',
  };

  let currentFormat = 'pdf';
  let busy = false;

  /* ------------------------------------------------------------------ */
  /* Format switching                                                   */
  /* ------------------------------------------------------------------ */
  function selectedFormat() {
    const checked = root.querySelector('input[name="format"]:checked');
    return checked ? checked.value : 'pdf';
  }

  function applyFormat(format) {
    currentFormat = format;
    const copy = COPY[format] || COPY.pdf;
    dom.bodyLabel.textContent = copy.label;
    dom.bodyHint.textContent = copy.hint;

    U.$$('[data-opt]', dom.opts).forEach((field) => {
      field.hidden = !copy.opts.includes(field.dataset.opt);
    });
    renderPreview();
  }

  root.querySelectorAll('input[name="format"]').forEach((input) => {
    input.addEventListener('change', () => applyFormat(input.value));
  });

  /* Everything that changes what the file will contain re-renders the preview. */
  [dom.title, dom.body, dom.author, dom.subtitle, dom.width, dom.height, dom.accent]
    .forEach((node) => {
      if (!node) return;
      node.addEventListener('input', refreshPreview);
      node.addEventListener('change', refreshPreview);
    });

  /* ------------------------------------------------------------------ */
  /* Live preview                                                       */
  /* ------------------------------------------------------------------ */
  /* These mirror services/documents.py exactly. If the parsing rules there
     change, the preview has to change with them — it is a window onto the
     generator, not a decoration. */

  function splitSections(body) {
    const sections = [];
    let current = null;
    (body || '').split('\n').forEach((raw) => {
      const line = raw.replace(/\s+$/, '');
      const stripped = line.trim();
      let heading = null;
      if (stripped.startsWith('#')) {
        heading = stripped.replace(/^#+/, '').trim();
      } else if (stripped.endsWith(':') && stripped.length <= 80
                 && !stripped.startsWith('-')) {
        heading = stripped.slice(0, -1).trim();
      }
      if (heading) {
        current = { heading, lines: [] };
        sections.push(current);
      } else if (stripped) {
        if (current === null) {
          current = { heading: '', lines: [] };
          sections.push(current);
        }
        current.lines.push(stripped);
      }
    });
    return sections.length ? sections : [{ heading: '', lines: [] }];
  }

  function splitRows(body) {
    return (body || '').split('\n')
      .map((ln) => ln.trim())
      .filter(Boolean)
      .map((line) => {
        if (line.includes('|')) return line.replace(/^\|+|\|+$/g, '').split('|').map((c) => c.trim());
        if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
        return line.split(',').map((c) => c.trim());
      });
  }

  const countWords = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);

  function renderPreview() {
    const body = dom.body.value;
    const format = currentFormat;
    const title = dom.title.value.trim();

    dom.prevBody.textContent = '';
    dom.prevLabel.textContent = `Preview · ${format.toUpperCase()}`;

    if (!body.trim()) {
      dom.prevMeta.textContent = '';
      dom.prevBody.appendChild(U.el('p', {
        class: 'prev__empty',
        text: 'Start typing and this shows the structure Forge will build.',
      }));
      return;
    }

    if (format === 'pptx') {
      const sections = splitSections(body).filter((s) => s.heading || s.lines.length);
      dom.prevMeta.textContent = `${sections.length + 1} slides`;
      const deck = U.el('div', { class: 'prev__slides' });
      deck.appendChild(U.el('article', { class: 'prev__slide prev__slide--cover' }, [
        U.el('span', { class: 'prev__slide-no', text: 'Cover' }),
        U.el('h4', { class: 'prev__slide-title', text: title || 'Untitled' }),
        dom.subtitle.value.trim()
          ? U.el('p', { class: 'prev__slide-sub', text: dom.subtitle.value.trim() }) : null,
      ]));
      sections.forEach((section, i) => {
        const shown = section.lines.slice(0, 9);
        const card = U.el('article', { class: 'prev__slide' }, [
          U.el('span', { class: 'prev__slide-no', text: String(i + 1) }),
          U.el('h4', { class: 'prev__slide-title', text: section.heading || title || 'Untitled' }),
        ]);
        if (shown.length) {
          const list = U.el('ul', { class: 'prev__bullets' });
          shown.forEach((line) => {
            list.appendChild(U.el('li', {
              text: line.replace(/^[-*•\s]+/, '').slice(0, 220),
            }));
          });
          card.appendChild(list);
        }
        if (section.lines.length > 9) {
          card.appendChild(U.el('p', {
            class: 'prev__warn',
            text: `+${section.lines.length - 9} more lines — slides hold nine`,
          }));
        }
        deck.appendChild(card);
      });
      dom.prevBody.appendChild(deck);
      return;
    }

    if (format === 'xlsx') {
      const rows = splitRows(body);
      const cols = Math.max(...rows.map((r) => r.length));
      dom.prevMeta.textContent = `${rows.length} rows × ${cols} columns`;
      const table = U.el('table', { class: 'prev__table' });
      rows.slice(0, 12).forEach((row, r) => {
        const tr = U.el('tr', {});
        for (let c = 0; c < cols; c += 1) {
          const cell = U.el(r === 0 ? 'th' : 'td', { text: row[c] ?? '' });
          tr.appendChild(cell);
        }
        table.appendChild(tr);
      });
      dom.prevBody.appendChild(table);
      if (rows.length > 12) {
        dom.prevBody.appendChild(U.el('p', {
          class: 'prev__warn', text: `+${rows.length - 12} more rows`,
        }));
      }
      return;
    }

    if (format === 'png') {
      const w = Number(dom.width.value) || 1280;
      const h = Number(dom.height.value) || 720;
      dom.prevMeta.textContent = `${w} × ${h}`;
      const canvas = U.el('div', { class: 'prev__canvas' });
      canvas.style.aspectRatio = `${w} / ${h}`;
      canvas.style.borderColor = dom.accent.value;
      canvas.appendChild(U.el('h4', {
        class: 'prev__canvas-title', text: title || 'Untitled',
      }));
      body.split('\n').filter((l) => l.trim()).slice(0, 8).forEach((line) => {
        canvas.appendChild(U.el('p', { class: 'prev__canvas-line', text: line.trim() }));
      });
      dom.prevBody.appendChild(canvas);
      return;
    }

    // pdf, docx, md — section flow
    const sections = splitSections(body);
    dom.prevMeta.textContent = `${countWords(body)} in body`
      + (title ? ` + ${countWords(title)} in title` : '');
    const page = U.el('div', { class: 'prev__page' });
    page.appendChild(U.el('h4', { class: 'prev__page-title', text: title || 'Untitled' }));
    if (dom.author.value.trim() && !U.$('[data-opt="author"]', dom.opts).hidden) {
      page.appendChild(U.el('p', {
        class: 'prev__page-by', text: dom.author.value.trim(),
      }));
    }
    sections.forEach((section) => {
      if (section.heading) {
        page.appendChild(U.el('h5', { class: 'prev__page-h', text: section.heading }));
      }
      const bullets = [];
      const paragraphs = [];
      section.lines.forEach((line) => {
        if (line.startsWith('-')) bullets.push(line.replace(/^[-*•\s]+/, ''));
        else paragraphs.push(line);
      });
      paragraphs.forEach((text) => {
        page.appendChild(U.el('p', { class: 'prev__page-p', text }));
      });
      if (bullets.length) {
        const ul = U.el('ul', { class: 'prev__bullets' });
        bullets.forEach((b) => ul.appendChild(U.el('li', { text: b })));
        page.appendChild(ul);
      }
    });
    dom.prevBody.appendChild(page);
  }

  function updateCount() {
    const words = countWords(dom.body.value);
    dom.bodyCount.textContent = words ? `${words} ${words === 1 ? 'word' : 'words'}` : '';
  }

  /* A plain function declaration, not a const arrow: the input listeners above
     are registered before this point in the file, and a const would still be in
     its temporal dead zone when they are wired. */
  let previewTimer = null;

  function refreshPreview() {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      updateCount();
      renderPreview();
    }, 120);
  }

  /* ------------------------------------------------------------------ */
  /* Output rendering                                                   */
  /* ------------------------------------------------------------------ */
  function showIdle() {
    U.clear(dom.stage);
    dom.stage.appendChild(
      U.el('div', { class: 'out__idle' }, [
        U.el('div', {
          class: 'out__glyph',
          html: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h4"/></svg>',
        }),
        U.el('h3', { text: 'Nothing generated yet' }),
        U.el('p', {
          text: 'Fill in a title and content, choose a format, then generate. The file will appear here with a download link.',
        }),
      ])
    );
  }

  function showMaking(format) {
    U.clear(dom.stage);
    dom.stage.appendChild(
      U.el('div', { class: 'making' }, [
        U.el('span', { class: 'spinner' }),
        U.el('span', { text: `Building your ${format.toUpperCase()} file locally…` }),
      ])
    );
  }

  function showResult(document, bodyText) {
    U.clear(dom.stage);
    const card = U.el('div', { class: 'made' });

    card.appendChild(
      U.el('div', { class: 'made__top' }, [
        U.el('span', { class: 'made__badge', text: document.format.toUpperCase() }),
        U.el('div', { class: 'made__meta' }, [
          U.el('p', { class: 'made__title', text: document.title }),
          U.el('p', {
            class: 'made__sub',
            text: `${document.filename} · ${U.filesize(document.bytes)}`,
          }),
          U.el('span', { class: 'made__check' }, [
            U.el('span', { text: 'Saved to disk' }),
          ]),
        ]),
      ])
    );

    /* Real preview: Markdown as text, PNG as an image element. */
    if (document.format === 'md') {
      card.appendChild(
        U.el('div', { class: 'made__preview' }, [
          U.el('pre', { text: bodyText }),
        ])
      );
    } else if (document.format === 'png') {
      const preview = U.el('div', { class: 'made__preview' });
      const img = U.el('img', {
        alt: `Preview of ${document.title}`,
        src: `/api/library/documents/${document.id}/file`,
      });
      preview.appendChild(img);
      card.appendChild(preview);
    }

    card.appendChild(
      U.el('div', { class: 'made__actions' }, [
        U.el('button', {
          class: 'btn btn--primary btn--sm',
          type: 'button',
          onClick: () => download(document),
        }, 'Download'),
        U.el('a', { class: 'btn btn--sm', href: '/library' }, 'Open Library'),
      ])
    );

    dom.stage.appendChild(card);
  }

  async function download(document) {
    try {
      await api.download(
        `/api/library/documents/${document.id}/file`,
        `${document.title}.${document.format}`
      );
    } catch (err) {
      U.error(err.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* History                                                            */
  /* ------------------------------------------------------------------ */
  async function loadHistory() {
    try {
      const data = await api.get('/api/forge/documents');
      U.clear(dom.history);
      if (!data.documents.length) {
        dom.history.appendChild(
          U.el('li', {
            class: 'out__empty',
            text: 'No files yet. Generated documents appear here and in the Library.',
          })
        );
        return;
      }
      data.documents.slice(0, 8).forEach((document) => {
        dom.history.appendChild(
          U.el('li', { class: 'out__row' }, [
            U.el('span', { class: 'out__ftype', text: document.format.toUpperCase() }),
            U.el('span', { class: 'out__fname', text: document.title }),
            U.el('span', { class: 'out__fmeta', text: U.relativeTime(document.created_at) }),
            U.el('button', {
              class: 'icon-btn out__dl',
              type: 'button',
              'aria-label': `Download ${document.title}`,
              title: 'Download',
              html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M8 11l4 4 4-4M5 19h14"/></svg>',
              onClick: () => download(document),
            }),
          ])
        );
      });
    } catch (err) {
      U.clear(dom.history);
      dom.history.appendChild(U.el('li', { class: 'out__empty', text: err.message }));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Generate                                                           */
  /* ------------------------------------------------------------------ */
  async function generate(event) {
    if (event) event.preventDefault();
    if (busy) return;

    const format = selectedFormat();
    const title = dom.title.value.trim();
    const body = dom.body.value;

    if (!title) {
      U.error('Give the document a title.');
      dom.title.focus();
      return;
    }
    if (!body.trim()) {
      U.error('Add some content — Forge builds the file from your text.');
      dom.body.focus();
      return;
    }

    const payload = { format, title, body };
    if (!U.$('[data-opt="author"]', dom.opts).hidden) {
      payload.author = dom.author.value.trim();
    }
    if (!U.$('[data-opt="subtitle"]', dom.opts).hidden) {
      payload.subtitle = dom.subtitle.value.trim();
    }
    if (!U.$('[data-opt="page_size"]', dom.opts).hidden) {
      payload.page_size = dom.page.value;
    }
    if (!U.$('[data-opt="size"]', dom.opts).hidden) {
      payload.width = Number(dom.width.value) || 1280;
      payload.height = Number(dom.height.value) || 720;
    }
    if (!U.$('[data-opt="accent"]', dom.opts).hidden) {
      payload.accent = dom.accent.value;
    }

    busy = true;
    dom.generate.disabled = true;
    dom.generate.textContent = 'Generating…';
    showMaking(format);

    try {
      const data = await api.post('/api/forge/documents', payload);
      showResult(data.document, body);
      U.success(`${format.toUpperCase()} file created.`);
      await loadHistory();
      window.OPS.shell.refreshActivity();
    } catch (err) {
      showIdle();
      U.error(err.message);
    } finally {
      busy = false;
      dom.generate.disabled = false;
      dom.generate.textContent = 'Generate file';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                             */
  /* ------------------------------------------------------------------ */
  dom.form.addEventListener('submit', generate);

  dom.sample.addEventListener('click', () => {
    const format = selectedFormat();
    if (!dom.title.value.trim()) {
      dom.title.value = `${format.toUpperCase()} example`;
    }
    dom.body.value = EXAMPLES[format] || EXAMPLES.pdf;
    dom.body.focus();
    refreshPreview();
    U.toast('Example structure loaded. Edit it before generating.');
  });

  dom.clear.addEventListener('click', () => {
    dom.title.value = '';
    dom.body.value = '';
    showIdle();
    renderPreview();
    updateCount();
    dom.title.focus();
    U.toast('Cleared. Your previous files are still in the Library.');
  });

  window.OPS.shell.registerPrimary('Generate file', () => generate());

  /* ------------------------------------------------------------------ */
  /* Startup                                                            */
  /* ------------------------------------------------------------------ */
  applyFormat(selectedFormat());
  updateCount();
  renderPreview();
  showIdle();
  loadHistory();
})();
