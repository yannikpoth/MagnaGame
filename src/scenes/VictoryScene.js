/* global Phaser */

import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants.js';
import { playMusic, playSfx } from '../audio/AudioManager.js';

export class VictoryScene extends Phaser.Scene {
  constructor() {
    super('VictoryScene');
  }

  create(data) {
    // Show DOM win overlay video (muted).
    try {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('magna:win-show'));
    } catch (_) {
      // ignore
    }

    // Ensure NO prior sounds leak into the win screen (boss attack SFX, etc).
    // We'll start only the intended win audio right after.
    try {
      this.sound.stopAll();
    } catch (_) {
      // ignore
    }

    // Win stinger + then start the win track (no fade-in).
    playSfx(this, 'sfx:start', { duck: false, volume: 1 });
    this.time.delayedCall(400, () => {
      if (!this.sys?.isActive()) return;
      playMusic(this, 'music:win', { fadeInMs: 0 });
    });

    const msg = data?.message ?? 'The temple is quiet. The law book has spoken.';

    // Optional on-canvas fallback message in case the DOM overlay is missing.
    // Keep it subtle so the video remains the hero.
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.18, msg, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 80 },
        stroke: '#09090b',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setAlpha(0.55);

    this.keys = this.input.keyboard.addKeys({ r: Phaser.Input.Keyboard.KeyCodes.R });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      try {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('magna:win-hide'));
      } catch (_) {
        // ignore
      }
    });
  }

  update() {
    if (this.keys?.r && Phaser.Input.Keyboard.JustDown(this.keys.r)) {
      try {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('magna:win-hide'));
      } catch (_) {
        // ignore
      }
      this.scene.start('LevelScene');
    }
  }
}


