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
  }

  root.querySelectorAll('input[name="format"]').forEach((input) => {
    input.addEventListener('change', () => applyFormat(input.value));
  });

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
    U.toast('Example structure loaded. Edit it before generating.');
  });

  window.OPS.shell.registerPrimary('Generate file', () => generate());

  /* ------------------------------------------------------------------ */
  /* Startup                                                            */
  /* ------------------------------------------------------------------ */
  applyFormat(selectedFormat());
  showIdle();
  loadHistory();
})();
