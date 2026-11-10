/* ==========================================================================
   Launcher — the first page.

   Two jobs:
   1. Animate the hero particle field (respecting motion settings).
   2. Keep the counts and the activity list honest: they come from the API,
      never from a template that pretends.
   ========================================================================== */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;

  const root = document.getElementById('launcher');
  if (!root) return;

  const state = {
    motion: document.documentElement.dataset.motion || 'liquid',
    theme: document.documentElement.dataset.theme || 'light',
  };

  /* ------------------------------------------------------------------ */
  /* Stagger the workspace rows so the list assembles on load           */
  /* ------------------------------------------------------------------ */
  function staggerRows() {
    const items = U.$$('.l-index__item', root);
    items.forEach((item, index) => {
      item.style.setProperty('--i', String(index));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Hero particle field                                                */
  /* ------------------------------------------------------------------ */
  function initField() {
    const canvas = document.getElementById('launcher-field');
    if (!canvas) return;

    const still = state.motion === 'still'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (still) {
      canvas.style.display = 'none';
      return;
    }

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let raf = 0;
    let visible = true;

    function readInk() {
      const styles = getComputedStyle(document.documentElement);
      return {
        ink: styles.getPropertyValue('--ink-950').trim() || '#0f0f0e',
      };
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function build() {
      // Density scales with area so phones don't get a blizzard.
      const target = Math.round((width * height) / 15000);
      const count = Math.max(28, Math.min(target, 220));
      particles = Array.from({ length: count }, () => spawn(true));
    }

    function spawn(anywhere) {
      // The reference concentrates dots on the right, fading toward centre.
      const bias = Math.random();
      const x = anywhere
        ? bias * width * 1.05
        : width * (0.55 + Math.random() * 0.5);
      return {
        x,
        y: Math.random() * height,
        size: 1 + Math.random() * 2.4,
        speed: 0.08 + Math.random() * 0.34,
        drift: (Math.random() - 0.5) * 0.12,
        alpha: 0.06 + Math.random() * 0.2,
      };
    }

    let ink = readInk().ink;

    function draw() {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = ink;

      for (const p of particles) {
        // Anything off the right edge re-enters from the left.
        if (p.y < -12) {
          p.y = height + 8;
          p.x = width * (0.4 + Math.random() * 0.65);
        }
        if (p.x < -12) p.x = width + 8;

        p.y -= p.speed;
        p.x += p.drift;

        ctx.globalAlpha = p.alpha;
        ctx.fillRect(p.x, p.y, p.size, p.size * 2.4);
      }
      ctx.globalAlpha = 1;
    }

    function loop() {
      if (!visible) return;
      draw();
      raf = window.requestAnimationFrame(loop);
    }

    function start() {
      if (raf) return;
      raf = window.requestAnimationFrame(loop);
    }

    function stop() {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    }

    resize();
    start();

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 180);
    });

    // Don't burn a frame budget on a hidden tab.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else start();
    });

    // Re-read the ink colour when the theme flips.
    document.addEventListener('opspine:theme', () => {
      ink = readInk().ink;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Live data                                                          */
  /* ------------------------------------------------------------------ */
  function renderCounts(counts) {
    U.$$('[data-count]', root).forEach((node) => {
      const key = node.dataset.count;
      if (counts && key in counts) {
        node.textContent = String(counts[key]);
      }
    });
  }

  function renderActivity(items) {
    const list = document.getElementById('launcher-activity');
    if (!list) return;
    U.clear(list);

    if (!items || !items.length) {
      list.appendChild(U.el('li', { class: 'l-activity__empty' }, [
        'Nothing yet. Open a room and whatever you create will appear here — '
        + 'with a real timestamp.',
      ]));
      return;
    }

    items.forEach((item) => {
      list.appendChild(
        U.el('li', {}, [
          U.el('a', { href: item.target || `/${item.workspace}` }, [
            U.el('span', { class: 'l-activity__ws', text: item.workspace_label }),
            U.el('span', { class: 'l-activity__what', text: item.label }),
            U.el('time', { text: U.relativeTime(item.created_at) }),
          ]),
        ])
      );
    });
  }

  async function refresh() {
    try {
      const data = await api.get('/api/activity?limit=8');
      renderCounts(data.counts);
      renderActivity(data.activity);
    } catch (err) {
      // The launcher still works; only the counters are stale.
      U.error(`Could not refresh the launcher: ${err.message}`);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Clear history                                                      */
  /* ------------------------------------------------------------------ */
  const clearBtn = document.getElementById('launcher-clear-activity');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const ok = await U.confirm({
        title: 'Clear activity history?',
        message: 'This removes the recent-actions log. Your conversations, drafts, '
          + 'events and files are untouched.',
        confirmLabel: 'Clear history',
      });
      if (!ok) return;
      try {
        await api.post('/api/activity/clear', {});
        U.success('Activity history cleared.');
        await refresh();
        if (window.OPS.shell && window.OPS.shell.refreshActivity) {
          window.OPS.shell.refreshActivity();
        }
      } catch (err) {
        U.error(err.message);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Startup                                                            */
  /* ------------------------------------------------------------------ */
  staggerRows();
  initField();
  refresh();

  // The launcher is the app's home, so Ctrl+Enter opens the first room.
  if (window.OPS.shell && window.OPS.shell.registerPrimary) {
    window.OPS.shell.registerPrimary('Open Abyss', () => {
      window.location.href = '/abyss';
    });
  }

  document.documentElement.addEventListener('opspine:theme', (event) => {
    state.theme = event.detail && event.detail.theme;
  });
})();
