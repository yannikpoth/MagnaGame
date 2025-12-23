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
    this._deathCleanupTimer = null;
  }

  /** @returns {boolean} */
  isDead() {
    return this._dead;
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

  /**
   * @param {{via?: 'melee' | 'super' | 'despawn' | string} | undefined} opts
   */
  die(opts = {}) {
    if (this._dead) return;
    this._dead = true;

    const via = opts?.via ?? 'unknown';

    // Despawn cleanup: remove immediately (no animation).
    if (via === 'despawn') {
      this.disableBody(true, true);
      this.scene.time.delayedCall(1, () => this.destroy());
      return;
    }

    // Stop physics interactions, but keep the sprite visible for the death animation.
    try {
      if (this.body) {
        this.body.setVelocity(0, 0);
        this.body.enable = false;
      }
    } catch (_) {
      // ignore
    }

    // Render behind the player from the moment the death animation starts.
    const playerDepth = this.scene?.player?.depth;
    if (typeof playerDepth === 'number') this.setDepth(playerDepth - 1);
    else this.setDepth(this.depth - 1);

    // Death presentation:
    // - zoom out (scale down) for 400ms
    // - then fade out for 600ms
    // - enemy must be gone after 1000ms total
    const baseScaleX = this.scaleX || 1;
    const baseScaleY = this.scaleY || 1;
    this.setAlpha(1);

    this.scene.tweens.add({
      targets: this,
      scaleX: baseScaleX * 0.72,
      scaleY: baseScaleY * 0.72,
      duration: 400,
      ease: 'Quad.Out',
    });

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      delay: 400,
      duration: 600,
      ease: 'Linear',
    });

    // Random death variant.
    const animKey = Phaser.Math.Between(1, 2) === 1 ? 'enemyhit:hit1' : 'enemyhit:hit2';

    if (this.scene?.anims?.exists?.(animKey)) {
      this.play(animKey);
    }

    // Ensure cleanup happens exactly after the 1s death presentation window.
    this._deathCleanupTimer = this.scene.time.delayedCall(1000, () => {
      if (!this.scene?.sys?.isActive()) return;
      this.destroy();
    });
  }
}
