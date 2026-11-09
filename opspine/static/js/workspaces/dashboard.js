/* Dashboard: motion preset switching and the real today's date. */
(function () {
  'use strict';

  const U = window.OPS.ui;
  const api = window.OPS.api;

  function stampToday() {
    const node = document.querySelector('[data-today]');
    if (!node) return;
    node.textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  }

  async function setMotion(preset, button) {
    const root = document.documentElement;
    root.dataset.motion = preset;

    U.$$('[data-motion-option]').forEach((node) => {
      const active = node === button;
      node.classList.toggle('is-active', active);
      node.setAttribute('aria-pressed', String(active));
    });

    try {
      await api.post('/api/settings', { motion: preset });
      U.success(`Motion set to ${preset}.`);
    } catch (err) {
      U.error(`Could not save the motion setting: ${err.message}`);
    }
  }

  U.$$('[data-motion-option]').forEach((button) => {
    button.addEventListener('click', () => {
      setMotion(button.dataset.motionOption, button);
    });
  });

  stampToday();

  window.OPS.shell.registerPrimary('Open Abyss', () => {
    window.location.href = '/abyss';
  });
})();
