/**
 * OPSpine Motion Engine — FLIP transitions, sheen, tilt, reveal, ambient canvas.
 * Handles pointer-following sheen, card tilt, staggered reveals, and the
 * shared-element transition between dashboard cards and workspace headers.
 */
const Motion = (() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rafId = null;
  
  // ── Pointer sheen + tilt ────────────────────────────────────────────
  function initSheenTilt(elements) {
    if (reduced) return;
    elements.forEach(el => {
      if (el._sheenInit) return;
      el._sheenInit = true;
      
      let rafPending = false;
      el.addEventListener('mousemove', e => {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          const rect = el.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          el.style.setProperty('--sheen-x', x + '%');
          el.style.setProperty('--sheen-y', y + '%');
          
          const tilt = getComputedStyle(document.documentElement).getPropertyValue('--tilt-amount');
          const tiltDeg = parseFloat(tilt) || 0;
          if (tiltDeg > 0) {
            const cx = 50, cy = 50;
            const rx = ((y - cy) / 50) * -tiltDeg;
            const ry = ((x - cx) / 50) * tiltDeg;
            el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.01)`;
          }
        });
      }, { passive: true });
      
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
        el.style.setProperty('--sheen-x', '50%');
        el.style.setProperty('--sheen-y', '50%');
      });
    });
  }
  
  // ── Staggered reveal ────────────────────────────────────────────────
  function reveal(elements, delayStart = 0) {
    if (reduced) {
      elements.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
      return;
    }
    elements.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(12px)';
      el.style.transition = `opacity .6s cubic-bezier(.22,1,.36,1) ${delayStart + i * 65}ms, transform .6s cubic-bezier(.22,1,.36,1) ${delayStart + i * 65}ms`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        });
      });
    });
  }
  
  // ── Workspace transition (no flash, no overlap) ─────────────────────
  function transitionTo(oldPanel, newPanel) {
    return new Promise(resolve => {
      const dur = reduced ? 0 : (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reveal-dur')) * 1000 || 320);
      
      if (!oldPanel) {
        if (newPanel) newPanel.classList.add('active');
        resolve();
        return;
      }
      
      if (reduced || dur === 0) {
        oldPanel.classList.remove('active', 'leaving');
        if (newPanel) newPanel.classList.add('active');
        resolve();
        return;
      }
      
      // Outgoing animation starts
      oldPanel.classList.add('leaving');
      oldPanel.classList.remove('active');
      
      // After outgoing (120ms overlap), start incoming
      const outgoingMs = Math.min(120, dur * 0.35);
      setTimeout(() => {
        if (newPanel) newPanel.classList.add('active');
      }, outgoingMs);
      
      // Cleanup after total duration
      setTimeout(() => {
        oldPanel.classList.remove('leaving');
        if (newPanel) {
          // Ensure focusable
          const heading = newPanel.querySelector('h1, h2, [tabindex]');
          if (heading && !newPanel.contains(document.activeElement)) {
            // Don't force focus if user is typing
          }
        }
        resolve();
      }, dur + 60);
    });
  }
  
  // ── Ambient canvas (sparks/particles for Abyss, telemetry for Dash) ─
  function initAmbientCanvas() {
    const canvas = document.getElementById('ambient-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let w, h;
    
    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    
    const ws = OPS.state.currentKey;
    
    // Initialize particles based on workspace
    function initParticles() {
      particles = [];
      const key = document.body.getAttribute('data-workspace');
      if (key === 'home') {
        // Abyss: floating orbs of light
        for (let i = 0; i < 40; i++) {
          particles.push({
            x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3,
            r: Math.random() * 2 + .5, a: Math.random() * .3 + .05,
          });
        }
      } else if (key === 'shortcuts') {
        // Dash: data packets
        for (let i = 0; i < 25; i++) {
          particles.push({
            x: Math.random() * w, y: Math.random() * h,
            vx: Math.random() * 1.5 + .5, vy: 0,
            r: Math.random() * 1.5 + .5, a: Math.random() * .4 + .1,
          });
        }
      } else if (key === 'whiteboard' || key === 'board') {
        // Subtle floating dots
        for (let i = 0; i < 15; i++) {
          particles.push({
            x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - .5) * .15, vy: (Math.random() - .5) * .15,
            r: Math.random() * 1.5 + .5, a: Math.random() * .15 + .05,
          });
        }
      }
    }
    initParticles();
    
    // Re-init on workspace change
    const obs = new MutationObserver(() => { initParticles(); });
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-workspace'] });
    
    let lastT = 0;
    function draw(t) {
      const dt = t - lastT; lastT = t;
      ctx.clearRect(0, 0, w, h);
      const key = document.body.getAttribute('data-workspace');
      const palette = OPS.state.palettes[key] || {};
      const accent = palette.accent || '#7b9cff';
      
      if (key === 'home') {
        // Holographic grid
        ctx.strokeStyle = 'rgba(143,174,255,.04)';
        ctx.lineWidth = 1;
        const gs = 60;
        for (let x = 0; x < w; x += gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
        for (let y = 0; y < h; y += gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
      }
      
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = key === 'shortcuts' ? `rgba(79,195,247,${p.a})` : `rgba(143,174,255,${p.a})`;
        ctx.fill();
      });
      
      if (!reduced) requestAnimationFrame(draw);
      else requestAnimationFrame(draw); // still draw but skip motion? no, keep drawing static
    }
    requestAnimationFrame(draw);
  }
  
  // ── Clock ────────────────────────────────────────────────────────────
  function initClock() {
    const el = document.getElementById('tb-clock');
    if (!el) return;
    function tick() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      el.textContent = `${h}:${m}:${s}`;
    }
    tick();
    setInterval(tick, 1000);
  }
  
  return { initSheenTilt, reveal, transitionTo, initAmbientCanvas, initClock, reduced };
})();
