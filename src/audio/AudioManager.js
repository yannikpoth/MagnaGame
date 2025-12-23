/* global Phaser */

import { MUSIC } from '../game/constants.js';

const REG_BASE_VOL = 'audio:musicBaseVolume';

function getBaseVolume(scene) {
  const v = scene.registry?.get(REG_BASE_VOL);
  if (typeof v === 'number') return Phaser.Math.Clamp(v, 0, 1);
  return Phaser.Math.Clamp(MUSIC.baseVolume ?? 0.8, 0, 1);
}

function setBaseVolume(scene, volume) {
  const v = Phaser.Math.Clamp(volume, 0, 1);
  scene.registry?.set(REG_BASE_VOL, v);
  return v;
}

/**
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {{ loop?: boolean, volume?: number }} [opts]
 */
export function ensureSound(scene, key, opts = {}) {
  let s = scene.sound.get(key);
  if (!s) {
    s = scene.sound.add(key, {
      loop: Boolean(opts.loop),
      volume: typeof opts.volume === 'number' ? opts.volume : getBaseVolume(scene),
    });
  }
  return s;
}

/**
 * Start looping background music track and stop any other known tracks.
 * @param {Phaser.Scene} scene
 * @param {'music:intro'|'music:ingame'|'music:win'} key
 * @param {{ fadeInMs?: number, volume?: number }} [opts]
 */
export function playMusic(scene, key, opts = {}) {
  try {
    // Stop other tracks (small project: keep it explicit).
    for (const k of ['music:intro', 'music:ingame', 'music:win']) {
      if (k === key) continue;
      const other = scene.sound.get(k);
      if (other?.isPlaying) other.stop();
    }

    const baseVol = getBaseVolume(scene);
    const targetVol = Phaser.Math.Clamp(typeof opts.volume === 'number' ? opts.volume : baseVol, 0, 1);
    const loop = key !== 'music:win';
    const fadeInMs = Math.max(0, Math.floor(opts.fadeInMs ?? 0));

    const music = ensureSound(scene, key, { loop, volume: targetVol });
    music.setLoop(loop);

    // If already playing (e.g. scene restart), just enforce current volume.
    if (music.isPlaying) {
      scene.tweens.killTweensOf(music);
      music.setVolume(targetVol);
      return;
    }

    if (fadeInMs > 0) {
      scene.tweens.killTweensOf(music);
      music.setVolume(0);
      music.play();
      scene.tweens.add({
        targets: music,
        volume: targetVol,
        duration: fadeInMs,
        ease: 'Sine.easeInOut',
      });
      return;
    }

    music.setVolume(targetVol);
    music.play();
  } catch (_) {
    // ignore (some browsers lock audio until input)
  }
}

/**
 * Immediately stop a music track if it's playing.
 * @param {Phaser.Scene} scene
 * @param {'music:intro'|'music:ingame'|'music:win'} key
 */
export function stopMusic(scene, key) {
  try {
    const s = scene.sound.get(key);
    if (s?.isPlaying) s.stop();
  } catch (_) {
    // ignore
  }
}

/**
 * Set base music volume for current + future tracks.
 * @param {Phaser.Scene} scene
 * @param {number} volume 0..1
 */
export function setMusicBaseVolume(scene, volume) {
  const v = setBaseVolume(scene, volume);
  try {
    for (const k of ['music:intro', 'music:ingame', 'music:win']) {
      const s = scene.sound.get(k);
      if (s) s.setVolume(v);
    }
  } catch (_) {
    // ignore
  }
  return v;
}

/**
 * Temporarily reduce music volume and smoothly return to base.
 * Call this right before/when playing an SFX.
 *
 * Repeated calls will "refresh" the duck (so rapid SFX keeps music low).
 *
 * @param {Phaser.Scene} scene
 * @param {{
 *   duckTo?: number,
 *   attackMs?: number,
 *   holdMs?: number,
 *   releaseMs?: number,
 *   key?: 'music:intro'|'music:ingame'|'music:win'
 * }} [opts]
 */
export function duckMusic(scene, opts = {}) {
  const base = getBaseVolume(scene);
  const duckTo = Phaser.Math.Clamp(typeof opts.duckTo === 'number' ? opts.duckTo : MUSIC.duckTo, 0, base);
  const attackMs = Math.max(0, Math.floor(opts.attackMs ?? MUSIC.duckAttackMs));
  const holdMs = Math.max(0, Math.floor(opts.holdMs ?? MUSIC.duckHoldMs));
  const releaseMs = Math.max(0, Math.floor(opts.releaseMs ?? MUSIC.duckReleaseMs));

  const key = opts.key ?? 'music:ingame';
  const music = scene.sound.get(key);
  if (!music) return;

  try {
    // Kill any previous volume tween(s) on this sound so the new duck feels snappy.
    scene.tweens.killTweensOf(music);

    // Ensure we never exceed base volume.
    if (music.volume > base) music.setVolume(base);

    // Timeline: quick dip -> hold -> smooth rise.
    scene.tweens.timeline({
      targets: music,
      tweens: [
        { volume: duckTo, duration: attackMs, ease: 'Sine.easeOut' },
        { volume: duckTo, duration: holdMs, ease: 'Linear' },
        { volume: base, duration: releaseMs, ease: 'Sine.easeInOut' },
      ],
    });
  } catch (_) {
    // ignore
  }
}

/**
 * Convenience helper for future sound effects:
 * - optionally ducks the music
 * - plays a one-shot SFX
 *
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {{
 *   volume?: number,
 *   duck?: boolean,
 *   duckKey?: 'music:intro'|'music:ingame'|'music:win',
 *   stopPrevious?: boolean,
 *   fadeOutAfterMs?: number,
 *   fadeOutMs?: number
 * }} [opts]
 */
export function playSfx(scene, key, opts = {}) {
  const volume = typeof opts.volume === 'number' ? Phaser.Math.Clamp(opts.volume, 0, 1) : 1;
  const duck = opts.duck !== false;
  const duckKey = opts.duckKey ?? 'music:ingame';

  try {
    if (duck) duckMusic(scene, { key: duckKey });
    const needsPersistentInstance = Boolean(opts.stopPrevious) || (opts.fadeOutAfterMs ?? 0) > 0 || (opts.fadeOutMs ?? 0) > 0;

    // Default path: allow overlapping SFX by letting Phaser spawn instances.
    if (!needsPersistentInstance) {
      scene.sound.play(key, { volume });
      return;
    }

    // Special path: keep a persistent instance so we can stop/fade it.
    const sfx = ensureSound(scene, key, { loop: false, volume });
    // Cancel any prior tweens (e.g. fade-outs).
    scene.tweens.killTweensOf(sfx);
    // Cancel any prior scheduled fade-out (important: otherwise later plays can fade too early).
    if (sfx.__fadeOutTimer?.remove) sfx.__fadeOutTimer.remove(false);
    sfx.__fadeOutTimer = null;

    // Optionally stop an already-playing instance immediately (useful for "boss attack" spam).
    if (opts.stopPrevious && sfx.isPlaying) sfx.stop();

    sfx.setLoop(false);
    sfx.setVolume(volume);
    sfx.play();

    // Optional timed fade-out (e.g. endboss attack sound).
    const fadeOutAfterMs = Math.max(0, Math.floor(opts.fadeOutAfterMs ?? 0));
    const fadeOutMs = Math.max(0, Math.floor(opts.fadeOutMs ?? 220));
    if (fadeOutAfterMs > 0) {
      sfx.__fadeOutTimer = scene.time.delayedCall(fadeOutAfterMs, () => {
        if (!sfx?.isPlaying) return;
        try {
          scene.tweens.killTweensOf(sfx);
          scene.tweens.add({
            targets: sfx,
            volume: 0,
            duration: fadeOutMs,
            ease: 'Sine.easeInOut',
            onComplete: () => {
              try {
                if (sfx.isPlaying) sfx.stop();
              } finally {
                // Reset volume so the next play starts at the intended level.
                sfx.setVolume(volume);
              }
            },
          });
        } catch (_) {
          // ignore
        }
      });
    }
  } catch (_) {
    // ignore
  }
}

