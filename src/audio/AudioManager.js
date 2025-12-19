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
 */
export function playMusic(scene, key) {
  try {
    // Stop other tracks (small project: keep it explicit).
    for (const k of ['music:intro', 'music:ingame', 'music:win']) {
      if (k === key) continue;
      const other = scene.sound.get(k);
      if (other?.isPlaying) other.stop();
    }

    const music = ensureSound(scene, key, { loop: key !== 'music:win', volume: getBaseVolume(scene) });
    music.setLoop(key !== 'music:win');
    music.setVolume(getBaseVolume(scene));
    if (!music.isPlaying) music.play();
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

