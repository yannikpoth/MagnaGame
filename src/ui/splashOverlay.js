/**
 * DOM-based splash overlay controller.
 *
 * Flow:
 * - Stage A (#pre-splash): user gesture required. On click/Space:
 *   - starts video download/play (muted)
 *   - reveals Stage B overlay
 *   - emits `magna:begin` so main.js can create Phaser
 * - Stage B: progress bar driven by Phaser via `magna:load-progress`
 * - Stage C: on `magna:load-complete`, show press-to-start; on click/Space:
 *   - emit `magna:start-game` so PreloadScene can enter LevelScene
 *   - fade out and remove overlays
 */

function qs(id) {
  return /** @type {HTMLElement|null} */ (document.getElementById(id));
}

function isSpaceEvent(e) {
  return e && (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar');
}

function fadeOutAndRemove(el, ms = 800) {
  if (!el) return;
  el.classList.add('fade-out');
  window.setTimeout(() => {
    try {
      el.remove();
    } catch {
      // ignore
    }
  }, ms);
}

export function initSplashOverlay() {
  const preSplash = qs('pre-splash');
  const preBtn = /** @type {HTMLButtonElement|null} */ (qs('pre-splash-button'));
  const splash = qs('splash-screen');

  const video = /** @type {HTMLVideoElement|null} */ (qs('intro-video'));
  const source = /** @type {HTMLSourceElement|null} */ (video?.querySelector('source') ?? null);

  const progressContainer = qs('progress-container');
  const progressFill = qs('progress-fill');
  const startText = qs('start-text');

  let begun = false;
  let readyToStart = false;
  let startTriggered = false;

  /** @type {(value: number) => void} */
  const setProgress = (value) => {
    if (!progressFill) return;
    const p = Math.max(0, Math.min(1, value || 0));
    progressFill.style.width = `${Math.floor(p * 100)}%`;
  };

  const showStartGate = () => {
    readyToStart = true;
    if (progressContainer) progressContainer.style.display = 'none';
    if (startText) startText.style.display = 'block';
  };

  const triggerStart = () => {
    if (startTriggered) return;
    startTriggered = true;

    // Tell Phaser it may proceed into gameplay.
    window.dispatchEvent(new Event('magna:start-game'));

    // Reduce CPU: stop video and remove overlays.
    try {
      if (video) {
        video.pause();
        // Leave src as-is; removing it sometimes triggers extra network work.
      }
    } catch {
      // ignore
    }

    fadeOutAndRemove(splash);
    fadeOutAndRemove(preSplash);

    // Remove global listeners
    document.removeEventListener('keydown', onKeydown, { capture: true });
    document.removeEventListener('click', onClick, { capture: true });
    window.removeEventListener('magna:load-progress', onLoadProgress);
    window.removeEventListener('magna:load-complete', onLoadComplete);
  };

  const onLoadProgress = (/** @type {Event} */ e) => {
    const ce = /** @type {CustomEvent|null} */ (/** @type {any} */ (e));
    const value = ce?.detail?.value;
    if (typeof value === 'number') setProgress(value);
  };

  const onLoadComplete = () => {
    setProgress(1);
    showStartGate();
  };

  const begin = () => {
    if (begun) return;
    begun = true;

    // Reveal the video splash immediately.
    if (splash) {
      splash.classList.add('is-visible');
    }

    // Start video download/play ONLY after the user gesture.
    // Primary path is `/splash/...` (works for static servers + Vite build).
    const hidePre = () => fadeOutAndRemove(preSplash);
    const trySources = () => {
      if (!video || !source) return hidePre();

      /** @type {string[]} */
      const urls = [];
      const primary = source.getAttribute('data-src');
      const fallback = source.getAttribute('data-src-fallback');
      if (primary) urls.push(primary);
      if (fallback) urls.push(fallback);

      let idx = 0;
      const tryNext = () => {
        const url = urls[idx++];
        if (!url) return;

        // Swap URL and try to load again.
        source.setAttribute('src', url);
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.load();
        video.play().catch(() => {});
      };

      const onErr = () => {
        if (idx < urls.length) {
          tryNext();
        }
      };

      // If the browser can render frames, fade out the pre-splash.
      video.addEventListener('canplay', hidePre, { once: true });
      // If the first URL fails (e.g. 404), fall back once.
      video.addEventListener('error', onErr);
      source.addEventListener('error', onErr);

      // If video takes too long to become ready, don't block the user.
      window.setTimeout(hidePre, 900);

      tryNext();
    };

    try {
      trySources();
    } catch {
      hidePre();
    }

    // Start Phaser boot now.
    window.dispatchEvent(new Event('magna:begin'));

    // Listen for Phaser loader events.
    window.addEventListener('magna:load-progress', onLoadProgress);
    window.addEventListener('magna:load-complete', onLoadComplete);
  };

  const onKeydown = (/** @type {KeyboardEvent} */ e) => {
    // Prevent page scroll / quick-find etc while overlays are up.
    if (isSpaceEvent(e)) e.preventDefault();

    if (!begun && isSpaceEvent(e)) {
      begin();
      return;
    }

    if (begun && readyToStart && isSpaceEvent(e)) {
      triggerStart();
    }
  };

  const onClick = () => {
    if (!begun) {
      begin();
      return;
    }

    if (begun && readyToStart) {
      triggerStart();
    }
  };

  // Wire input listeners.
  if (preBtn) preBtn.addEventListener('click', begin);
  document.addEventListener('keydown', onKeydown, { capture: true });
  document.addEventListener('click', onClick, { capture: true });

  // If the overlay markup is missing for any reason, we still want the game to be playable.
  if (!preSplash) {
    begin();
  }

  return {
    waitForBegin() {
      return new Promise((resolve) => {
        if (begun) return resolve();
        window.addEventListener('magna:begin', () => resolve(), { once: true });
      });
    },
  };
}
