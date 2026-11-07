/**
 * OPSpine Keyboard Commands — ⌘K palette, ⌘0-8 shortcuts, global keys.
 * Every shortcut calls the same Shell.navigate or action as the click handler.
 */
const Commands = (() => {
  function init() {
    document.addEventListener('keydown', handler);
  }
  
  function handler(e) {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    
    // Don't intercept when typing in inputs/textareas/contenteditable (except Escape)
    const typing = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
                   e.target.isContentEditable;
    
    // Escape closes overlays
    if (e.key === 'Escape') {
      const paletteEl = document.getElementById('palette');
      const shortcutsEl = document.getElementById('shortcuts-panel');
      if (paletteEl && !paletteEl.hidden) { Shell.closePalette(); e.preventDefault(); return; }
      if (shortcutsEl && !shortcutsEl.hidden) { Shell.closeShortcuts(); e.preventDefault(); return; }
      return;
    }
    
    // ? opens shortcuts (when not typing, and only when Shift is held — ? is Shift+/)
    if (key === '?' && !typing && !mod && e.shiftKey) {
      // Check that shortcuts isn't already open to avoid toggle-loop
      const sp = document.getElementById('shortcuts-panel');
      if (sp && sp.hidden) {
        e.preventDefault();
        Shell.openShortcuts();
      }
      return;
    }
    // Toggle shortcuts with /? when palette is open
    if (key === '?' && !typing && !mod && !e.shiftKey) {
      // plain "/" when not typing - do nothing (avoids accidental triggers on non-US keyboards)
    }
    
    // Modifier combos
    if (mod) {
      // Command palette
      if (key === 'k') {
        e.preventDefault();
        Shell.openPalette();
        return;
      }
      
      // Dashboard
      if (key === '0') { e.preventDefault(); Shell.navigate('/dashboard'); return; }
      
      // Workspace shortcuts (1-8)
      const routeMap = {
        '1': '/abyss', '2': '/scout', '3': '/forge', '4': '/quill',
        '5': '/kronos', '6': '/whiteboard', '7': '/dash', '8': '/working-board',
        '9': '/image-studio',
      };
      if (routeMap[key]) { e.preventDefault(); Shell.navigate(routeMap[key]); return; }
      
      // Run primary action (Enter)
      if (key === 'enter') {
        e.preventDefault();
        runPrimaryAction();
        return;
      }
      
      // Voice
      if (e.shiftKey && key === 'v') {
        e.preventDefault();
        Shell.toast('Voice input requires an API key. Configure in Settings.', { type: 'info' });
        return;
      }
      
      // Toggle nav (backtick or \)
      if (key === '\\' || key === '`') {
        e.preventDefault();
        Shell.toggleNav();
        return;
      }
    }
    
    // Alt+1-8 also navigates
    if (e.altKey && !mod && key >= '1' && key <= '8') {
      e.preventDefault();
      const routeMap = {
        '1': '/abyss', '2': '/scout', '3': '/forge', '4': '/quill',
        '5': '/kronos', '6': '/whiteboard', '7': '/dash', '8': '/working-board',
      };
      Shell.navigate(routeMap[key]);
    }
  }
  
  function runPrimaryAction() {
    const key = OPS.state.currentKey;
    const panel = document.querySelector('.workspace-panel.active');
    if (!panel) return;
    
    // Find the primary action button in the active workspace
    const primaryBtn = panel.querySelector('[data-primary-action]');
    if (primaryBtn) {
      primaryBtn.click();
    }
  }
  
  return { init };
})();
