/* global Phaser */

import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants.js';

export class VictoryScene extends Phaser.Scene {
  constructor() {
    super('VictoryScene');
  }

  create(data) {
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 'YOU WIN', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#ffe66d',
      })
      .setOrigin(0.5);

    const msg = data?.message ?? 'The temple is quiet. The law book has spoken.';

    const body = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, msg, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 80 },
      })
      .setOrigin(0.5);

    const hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 40, 'Press R to restart', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5);

    title.setScrollFactor(0);
    body.setScrollFactor(0);
    hint.setScrollFactor(0);

    this.keys = this.input.keyboard.addKeys({ r: Phaser.Input.Keyboard.KeyCodes.R });
  }

  update() {
    if (this.keys?.r && Phaser.Input.Keyboard.JustDown(this.keys.r)) {
      this.scene.start('LevelScene');
    }
  }
}

