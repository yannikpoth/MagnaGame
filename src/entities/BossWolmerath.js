/* global Phaser */

import { BOSS, SCALE } from '../game/constants.js';

export class BossWolmerath extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   */
  constructor(scene, x, y) {
    super(scene, x, y, 'boss:sheet:idle', 0);

    this.setName('BossWolmerath');
    this.setScale(SCALE.boss);

    this.maxHp = BOSS.hp;
    this.hp = BOSS.hp;

    this.facing = -1;

    this._nextAttackAt = 0;
    this._attacking = false;

    /** @type {null | { onPearl?: (spec:any)=>void, dir:number }} */
    this._pendingPearl = null;

    // When an attack animation finishes, we release the pearl and allow movement again.
    this.on('animationcomplete', (anim) => {
      if (!anim?.key || !anim.key.startsWith('boss:attack')) return;
      if (!this.active) return;

      const pending = this._pendingPearl;
      this._pendingPearl = null;
      this._attacking = false;

      if (pending?.onPearl) {
        const body = this.body;
        const x = this.x + pending.dir * 150;
        const y = body ? body.bottom - 10 : this.y;
        pending.onPearl({ x, y, dir: pending.dir });
      }
    });
  }

  /**
   * Call after physics body exists.
   */
  configureBody() {
    this.play('boss:idle');

    // Collision box
    // Arcade body setSize/setOffset use the *unscaled* frame pixel units.
    const bw = this.width * 0.31;
    const bh = this.height * 0.67;
    this.body.setSize(bw, bh);
    this.body.setOffset((this.width - bw) / 2, this.height - bh);

    this.setCollideWorldBounds(true);
  }

  takeHit(amount = 1) {
    this.hp -= amount;

    this.scene.cameras.main.shake(70, 0.006);
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => this.clearTint());

    if (this.hp <= 0) {
      this.die();
    }
  }

  die() {
    this.disableBody(true, true);
    this.active = false;
  }

  /**
   * @param {number} time
   * @param {{player:any, arenaLeft:number, arenaRight:number, onPearl?: (spec:any)=>void, onAttack?: (spec:any)=>void}} ctx
   */
  updateAI(time, ctx) {
    if (!this.active || !ctx?.player?.active) return;

    const player = ctx.player;

    // Face player
    this.facing = player.x < this.x ? -1 : 1;
    this.setFlipX(this.facing > 0);

    const withinArena = Phaser.Math.Clamp(this.x, ctx.arenaLeft, ctx.arenaRight);
    if (this.x !== withinArena) this.x = withinArena;

    // Move slowly toward player when not attacking
    if (!this._attacking) {
      const dx = player.x - this.x;
      const move = Phaser.Math.Clamp(dx, -1, 1);
      this.setVelocityX(move * BOSS.speed);
      this.play(Math.abs(move) > 0.1 ? 'boss:walking' : 'boss:idle', true);
    }

    // Attack when close-ish
    const close = Math.abs(player.x - this.x) < 220;
    if (close && time >= this._nextAttackAt && !this._attacking) {
      this._attacking = true;
      this._nextAttackAt = time + BOSS.attackCooldownMs;
      this.setVelocityX(0);

      // Use a single attack animation for now.
      this.play('boss:attack_1', true);
      if (ctx.onAttack) ctx.onAttack({ key: 'boss:attack_1' });

      // Spawn pearl AFTER the animation completes (matches the throw timing).
      this._pendingPearl = { onPearl: ctx.onPearl, dir: this.facing };
    }
  }
}
