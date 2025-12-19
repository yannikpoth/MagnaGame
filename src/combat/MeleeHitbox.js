/* global Phaser */

export class MeleeHitbox {
  /**
   * @param {Phaser.Scene} scene
   * @param {{x:number,y:number,width:number,height:number,durationMs:number}} opts
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.zone = scene.add.zone(opts.x, opts.y, opts.width, opts.height);
    // Ensure the Zone has a stable origin/size for Arcade body computations.
    this.zone.setOrigin(0.5, 0.5);
    this.zone.setSize(opts.width, opts.height);

    // IMPORTANT:
    // Use a DYNAMIC Arcade body here. Static bodies don't support some Body APIs (like
    // setImmovable/setAllowGravity in certain Phaser builds), which can hard-crash on keypress.
    // We keep it immovable + gravity off, and manually sync it to the Zone position.
    scene.physics.add.existing(this.zone);

    /** @type {Phaser.Physics.Arcade.Body} */
    // @ts-ignore
    const body = this.zone.body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setVelocity(0, 0);
    body.setSize(opts.width, opts.height);
    body.updateFromGameObject();

    /**
     * Ensure each target is damaged at most once per swing window.
     * Arcade overlaps can fire every physics step while bodies overlap.
     * @type {WeakSet<object>}
     */
    this._hitTargets = new WeakSet();

    this._destroyTimer = scene.time.delayedCall(opts.durationMs, () => this.destroy());
  }

  /**
   * Marks a target as hit, returning true only the first time.
   * @param {any} target
   * @returns {boolean}
   */
  tryHit(target) {
    if (!this._hitTargets) return false;
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) return false;
    if (this._hitTargets.has(target)) return false;
    this._hitTargets.add(target);
    return true;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  setPosition(x, y) {
    this.zone.setPosition(x, y);
    // Keep Arcade body aligned with the moved Zone (required for reliable overlaps).
    // @ts-ignore
    this.zone.body?.updateFromGameObject?.();
  }

  /** @returns {Phaser.GameObjects.Zone} */
  get gameObject() {
    return this.zone;
  }

  destroy() {
    if (!this.zone) return;
    if (this._destroyTimer) this._destroyTimer.remove(false);
    this.zone.destroy();
    this.zone = null;
    this._hitTargets = null;
  }
}
