/* global Phaser */

import { MUSIC } from '../game/constants.js';
import { playMusic, setMusicBaseVolume } from '../audio/AudioManager.js';

const ASSET_ROOT = '/assets/processed/';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Load intro music *first* so it can start immediately on the splash screen.
    if (!this.cache.audio.exists('music:intro')) {
      this.load.audio('music:intro', `${ASSET_ROOT}audio/music/intro.mp3`);
    }
  }

  create() {
    // Keep pixels crisp on camera transforms.
    this.cameras.main.roundPixels = true;

    // Ensure base volume is set very early and start the intro loop ASAP.
    setMusicBaseVolume(this, MUSIC.baseVolume);
    playMusic(this, 'music:intro');

    this.scene.start('PreloadScene');
  }
}


