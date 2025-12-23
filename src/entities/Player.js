/* global Phaser */

import { PLAYER, SCALE } from '../game/constants.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   */
  constructor(scene, x, y) {
    super(scene, x, y, 'player:sheet:idle', 0);

    this.setName('Player');
    this.setScale(SCALE.player);

    /** @type {number} */
    this.facing = 1;

    /** @type {number} */
    this.kills = 0;

    /** @type {number} */
    this._lastOnGroundAt = 0;
    /** @type {number} */
    this._lastJumpPressedAt = -99999;

    /** @type {number} */
    this._nextAttackAt = 0;
    /** @type {boolean} */
    this._isAttacking = false;

    /** @type {{ onMeleeStart?: () => void, onMelee?: (hitboxSpec: any) => void, onSuper?: (origin: any) => void }} */
    this.handlers = {};

    this.keys = {
      cursors: scene.input.keyboard.createCursorKeys(),
      f: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      x: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X),
      r: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    };

    this.play('player:idle');

    this.on('animationcomplete', (anim) => {
      if (anim?.key === 'player:attack') this._isAttacking = false;
    });
  }

  /**
   * Call after physics body exists.
   */
  configureBody() {
    this.setCollideWorldBounds(true);

    // Collision box ratios (frame is huge; keep body compact relative to frame size).
    // Arcade body setSize/setOffset use the *unscaled* frame pixel units.
    // (Using displayWidth/displayHeight here breaks alignment when sprites are scaled.)
    const bw = this.width * 0.25;
    const bh = this.height * 0.65;
    this.body.setSize(bw, bh);
    this.body.setOffset((this.width - bw) / 2, this.height - bh);

    this.setMaxVelocity(PLAYER.maxSpeed, 1200);
    this.setDragX(PLAYER.drag);
  }

  /** @returns {boolean} */
  isSuperReady() {
    return this.kills >= PLAYER.superKillsRequired;
  }

  /** @param {number} count */
  addKills(count = 1) {
    this.kills += count;
  }

  resetSuper() {
    this.kills = 0;
  }

  /**
   * @param {number} time
   */
  update(time) {
    const { left, right, up, space } = this.keys.cursors;

    // Restart convenience
    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) {
      this.scene.scene.restart();
      return;
    }

    const wantLeft = left.isDown;
    const wantRight = right.isDown;

    if (wantLeft === wantRight) {
      this.setAccelerationX(0);
    } else if (wantLeft) {
      this.facing = -1;
      this.setFlipX(true);
      this.setAccelerationX(-PLAYER.accel);
    } else {
      this.facing = 1;
      this.setFlipX(false);
      this.setAccelerationX(PLAYER.accel);
    }

    const onGround = this.body.blocked.down;
    if (onGround) this._lastOnGroundAt = time;

    const jumpJustDown = Phaser.Input.Keyboard.JustDown(space) || Phaser.Input.Keyboard.JustDown(up);
    if (jumpJustDown) this._lastJumpPressedAt = time;

    const canCoyote = time - this._lastOnGroundAt <= PLAYER.coyoteMs;
    const hasJumpBuffered = time - this._lastJumpPressedAt <= PLAYER.jumpBufferMs;

    if (hasJumpBuffered && (onGround || canCoyote)) {
      this.setVelocityY(-PLAYER.jumpVelocity);
      this._lastJumpPressedAt = -99999;
    }

    // Animations
    const isAttacking = this._isAttacking;
    if (!isAttacking) {
      if (!onGround) {
        this.play('player:walking', true);
      } else if (Math.abs(this.body.velocity.x) > 20) {
        this.play('player:walking', true);
      } else {
        this.play('player:idle', true);
      }
    }

    // Melee attack
    if (Phaser.Input.Keyboard.JustDown(this.keys.f) && time >= this._nextAttackAt && !this._isAttacking) {
      this._nextAttackAt = time + PLAYER.attackCooldownMs;
      this._isAttacking = true;
      this.play('player:attack', true);
      if (this.handlers.onMeleeStart) this.handlers.onMeleeStart();

      // Spawn the hitbox after a short windup so it matches the swing pose.
      const facingAtPress = this.facing;
      this.scene.time.delayedCall(PLAYER.attackWindupMs, () => {
        if (!this.active || !this.body) return;

        // Build the hitbox from the physics body (not sprite y), so it lines up with enemies.
        const body = this.body;
        const bodyCenterX = body.x + body.width * 0.5;
        const bodyCenterY = body.y + body.height * 0.5;

        const w = Math.max(48, body.width * 1.25);
        const h = Math.max(48, body.height * 0.8);
        const padding = 12;
        const hitboxSpec = {
          x: bodyCenterX + facingAtPress * (body.width * 0.5 + w * 0.5 + padding),
          // Slightly above the feet so it hits enemy bodies on the ground line.
          y: bodyCenterY - body.height * 0.15,
          width: w,
          height: h,
          durationMs: PLAYER.attackDurationMs,
          dir: facingAtPress,
        };

        if (this.handlers.onMelee) this.handlers.onMelee(hitboxSpec);
      });
    }

    // Super attack
    if (Phaser.Input.Keyboard.JustDown(this.keys.x) && this.isSuperReady()) {
      if (this.handlers.onSuper) {
        this.handlers.onSuper({ x: this.x, y: this.y, dir: this.facing });
      }
      this.resetSuper();
    }
  }
}
