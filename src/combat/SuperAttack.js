/* global Phaser */

export class SuperAttack {
  /**
   * Visual + gameplay effect: clears current enemies and optionally damages boss.
   *
   * @param {Phaser.Scene} scene
   * @param {{x:number,y:number,dir:number}} origin
   * @param {{enemies?: Phaser.GameObjects.Group|Phaser.Physics.Arcade.Group, boss?: any}} targets
   */
  static activate(scene, origin, targets = {}) {
    const cam = scene.cameras.main;
    // Stronger, more dramatic shake on super.
    cam.shake(220, 0.02);

    // Laser: appears from the player's position and expands outward quickly.
    // We keep it static (no movement), and animate via crop width expansion.
    const tex = scene.textures.get('fx:laser');
    const src = tex?.getSourceImage?.();
    const texW = src?.width ?? 0;
    const texH = src?.height ?? 0;

    if (texW > 0 && texH > 0) {
      // Spawn right in front of the player.
      const spawnX = origin.x + origin.dir * 40;
      const spawnY = origin.y - 40;

      const laser = scene.add.image(spawnX, spawnY, 'fx:laser');
      // Facing right: anchor on left edge; facing left: anchor on right edge.
      laser.setOrigin(origin.dir >= 0 ? 0 : 1, 0.5);
      laser.setDepth(55);

      // Scale to half-size (relative to prior "fit to camera height" sizing).
      const displayH = cam.height * 0.5;
      const displayW = (texW * displayH) / texH;
      laser.setDisplaySize(displayW, displayH);

      const startCropW = Math.min(500, texW);
      const applyCrop = (w) => {
        const cw = Math.max(1, Math.min(texW, Math.floor(w)));
        if (origin.dir >= 0) {
          // Reveal from left edge → right.
          laser.setCrop(0, 0, cw, texH);
        } else {
          // Reveal from right edge → left.
          laser.setCrop(texW - cw, 0, cw, texH);
        }
      };
      applyCrop(startCropW);

      // Tween crop width from 500px -> full width in ~100ms.
      const state = { w: startCropW };
      scene.tweens.add({
        targets: state,
        w: texW,
        duration: 100,
        ease: 'Quad.Out',
        onUpdate: () => {
          if (!laser.active) return;
          applyCrop(state.w);
        },
        onComplete: () => {
          // Brief hold + fade out, then destroy to avoid lingering overlay.
          scene.tweens.add({
            targets: laser,
            alpha: { from: 1, to: 0 },
            delay: 90,
            duration: 120,
            ease: 'Quad.In',
            onComplete: () => laser.destroy(),
          });
        },
      });
    }

    // Gameplay: clear enemies immediately.
    const enemies = targets.enemies;
    if (enemies?.getChildren) {
      for (const child of enemies.getChildren()) {
        if (!child || !child.active) continue;
        if (typeof child.die === 'function') child.die({ via: 'super' });
        else child.destroy();
      }
    }

    // Boss: optional chunk damage.
    if (targets.boss && typeof targets.boss.takeHit === 'function' && targets.boss.active) {
      // Super counts as 2 "attacks".
      targets.boss.takeHit(2);
    }
  }
}
