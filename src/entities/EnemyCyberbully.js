/* global Phaser */

import { ENEMY, SCALE } from '../game/constants.js';

export class EnemyCyberbully extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   */
  constructor(scene, x, y) {
    super(scene, x, y, 'enemy:sheet:walking', 0);

    this.setName('EnemyCyberbully');
    this.setScale(SCALE.enemy);

    this._dead = false;
  }

  /**
   * Keep enemies moving left reliably.
   * @param {number} time
   * @param {number} delta
   */
  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this._dead || !this.active) return;

    // Always face left and keep walking.
    this.setFlipX(true);
    this.setVelocityX(-ENEMY.speed);
  }

  /**
   * Call after physics body exists.
   */
  configureBody() {
    this.play('enemy:walking');

    // Collision box
    // Arcade body setSize/setOffset use the *unscaled* frame pixel units.
    const bw = this.width * 0.46;
    const bh = this.height * 0.57;
    this.body.setSize(bw, bh);
    this.body.setOffset((this.width - bw) / 2, this.height - bh);

    // Keep cyberbullies on the action line; gravity isn't needed for them.
    // (This also prevents them from "falling out" if ground collision ever glitches.)
    this.body.setAllowGravity(false);
    this.setFlipX(true);
    this.setVelocity(-ENEMY.speed, 0);
    this.setCollideWorldBounds(false);
  }

  die() {
    if (this._dead) return;
    this._dead = true;

    this.disableBody(true, true);
    this.scene.time.delayedCall(50, () => this.destroy());
  }
}
