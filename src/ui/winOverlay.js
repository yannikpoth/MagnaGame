/**
 * DOM-based win overlay controller (video background).
 *
 * - Shown/hidden by Phaser via window events:
 *   - `magna:win-show`
 *   - `magna:win-hide`
 * - Video is always muted (win.mp3 is played via Phaser AudioManager).
 */

function qs(id) {
  return /** @type {HTMLElement|null} */ (document.getElementById(id));
}

export function initWinOverlay() {
  const root = qs('win-screen');
  const video = /** @type {HTMLVideoElement|null} */ (qs('win-video'));
  const source = /** @type {HTMLSourceElement|null} */ (video?.querySelector('source') ?? null);

  let visible = false;
  let srcSet = false;

  const ensureVideo = () => {
    if (!video || !source) return;

    // Set src lazily (saves network until needed).
    if (!srcSet) {
      const primary = source.getAttribute('data-src');
      const fallback = source.getAttribute('data-src-fallback');
      source.setAttribute('src', primary || fallback || '');
      srcSet = true;
    }

    // Force muted; some browsers ignore the attribute depending on the initial state.
    video.muted = true;
    video.volume = 0;
    video.playsInline = true;
    video.loop = true;
    video.preload = 'auto';

    try {
      video.load();
    } catch {
      // ignore
    }

    // Autoplay if possible (muted should allow it).
    video.play().catch(() => {});
  };

  const show = () => {
    if (visible) return;
    visible = true;
    if (root) root.classList.add('is-visible');
    ensureVideo();
  };

  const hide = () => {
    if (!visible) return;
    visible = false;
    try {
      video?.pause();
    } catch {
      // ignore
    }
    if (root) root.classList.remove('is-visible');
  };

  // Wire global events.
  window.addEventListener('magna:win-show', show);
  window.addEventListener('magna:win-hide', hide);

  return {
    show,
    hide,
    destroy() {
      window.removeEventListener('magna:win-show', show);
      window.removeEventListener('magna:win-hide', hide);
    },
  };
}




