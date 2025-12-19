/* global Phaser */

import { GAME_HEIGHT, GAME_WIDTH, GRAVITY_Y } from './constants.js';
import { BootScene } from '../scenes/BootScene.js';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { LevelScene } from '../scenes/LevelScene.js';
import { VictoryScene } from '../scenes/VictoryScene.js';

export function createGame({ parent } = {}) {
  const config = {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#0b0f1a',
    pixelArt: true,
    antialias: false,
    render: {
      pixelArt: true,
      antialias: false,
      roundPixels: true,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: GRAVITY_Y },
        debug: false,
      },
    },
    scale: {
      // ENVELOP ("cover") crops the game on non-16:9 viewports, which can make the
      // ground/action line appear offset and clip jumps. FIT keeps the full
      // 960x540 playfield visible with letterboxing as needed.
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, PreloadScene, LevelScene, VictoryScene],
  };

  // eslint-disable-next-line no-new
  return new Phaser.Game(config);
}
