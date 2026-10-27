/*
 * Michy's Pet Snake: controls.
 *
 * Three ways to steer, all feeding the same turn queue in the engine:
 *  - swipe anywhere on the play area (a turn fires as soon as the finger has
 *    moved far enough, and you can keep swiping without lifting your finger)
 *  - the on-screen pad, which reacts on pointerdown rather than click so there
 *    is no tap delay
 *  - arrow keys or WASD on a keyboard, with Space, P or Escape to pause
 */
(function (root) {
  'use strict';
  const MPS = (root.MPS = root.MPS || {});

  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  };

  function init(opts) {
    const handlers = opts;
    const swipeArea = opts.swipeArea;
    const pad = opts.pad;

    document.addEventListener('keydown', function (e) {
      if (e.repeat && !KEYS[e.key]) return;
      handlers.onAnyInput && handlers.onAnyInput();
      const dir = KEYS[e.key];
      if (dir) {
        if (handlers.onDir(dir, 'key')) e.preventDefault();
        return;
      }
      if (e.key === ' ' || e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (handlers.onPauseKey(e.key)) e.preventDefault();
      } else if (e.key === 'Enter') {
        if (handlers.onConfirm && handlers.onConfirm()) e.preventDefault();
      }
    });

    // Swipe: track one pointer, fire a turn once it travels past the threshold.
    let active = null;
    function threshold() {
      return Math.max(18, Math.min(40, swipeArea.clientWidth * 0.06));
    }
    swipeArea.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      handlers.onAnyInput && handlers.onAnyInput();
      if (!handlers.swipeEnabled()) return;
      active = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { swipeArea.setPointerCapture(e.pointerId); } catch (err) { /* older WebViews */ }
      e.preventDefault();
    });
    swipeArea.addEventListener('pointermove', function (e) {
      if (!active || e.pointerId !== active.id) return;
      const dx = e.clientX - active.x;
      const dy = e.clientY - active.y;
      const th = threshold();
      if (Math.abs(dx) < th && Math.abs(dy) < th) return;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      handlers.onDir(dir, 'swipe');
      active.x = e.clientX;
      active.y = e.clientY;
      e.preventDefault();
    });
    function end(e) {
      if (active && e.pointerId === active.id) active = null;
    }
    swipeArea.addEventListener('pointerup', end);
    swipeArea.addEventListener('pointercancel', end);

    // On-screen pad.
    pad.querySelectorAll('[data-dir]').forEach(function (btn) {
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        handlers.onAnyInput && handlers.onAnyInput();
        btn.classList.add('pressed');
        handlers.onDir(btn.dataset.dir, 'pad');
      });
      const release = function () { btn.classList.remove('pressed'); };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });

    // Stop long-press menus, text selection and pinch zoom from getting in the way of play.
    document.addEventListener('contextmenu', function (e) {
      if (e.target.closest('.no-menu')) e.preventDefault();
    });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  }

  MPS.Input = { init: init, KEYS: KEYS };
})(typeof window !== 'undefined' ? window : globalThis);
