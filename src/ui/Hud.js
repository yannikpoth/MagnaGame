/* global Phaser */

import { PLAYER } from '../game/constants.js';

export class Hud {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    this.chargeText = scene.add.text(12, 10, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
    });
    this.chargeText.setScrollFactor(0);
    this.chargeText.setDepth(1000);

    this.bossText = scene.add.text(12, 32, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffe66d',
    });
    this.bossText.setScrollFactor(0);
    this.bossText.setDepth(1000);

    this.hintText = scene.add.text(12, 54, 'F: attack   X: super   R: restart', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
    });
    this.hintText.setScrollFactor(0);
    this.hintText.setDepth(1000);
  }

  /**
   * @param {{kills:number, bossHp?:number, bossMaxHp?:number}} state
   */
  update(state) {
    const kills = state.kills ?? 0;
    const req = PLAYER.superKillsRequired;
    const clamped = Math.max(0, Math.min(req, kills));

    const ready = clamped >= req;
    this.chargeText.setText(ready ? 'SUPER READY (X)' : `Charge: ${clamped}/${req}`);

    if (typeof state.bossHp === 'number' && typeof state.bossMaxHp === 'number') {
      this.bossText.setText(`Boss HP: ${Math.max(0, state.bossHp)}/${state.bossMaxHp}`);
    } else {
      this.bossText.setText('');
    }
  }

  destroy() {
    this.chargeText.destroy();
    this.bossText.destroy();
    this.hintText.destroy();
  }
}


