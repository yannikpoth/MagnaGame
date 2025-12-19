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
    cam.shake(140, 0.01);

    // "Book" projectile placeholder: a chunky rectangle that flies forward.
    const book = scene.add.rectangle(origin.x + origin.dir * 40, origin.y - 40, 56, 32, 0xf3f4f6, 1);
    book.setStrokeStyle(3, 0x111827, 1);
    book.setDepth(50);

    scene.tweens.add({
      targets: book,
      x: origin.x + origin.dir * 900,
      duration: 260,
      ease: 'Cubic.Out',
      onComplete: () => book.destroy(),
    });

    // "§" burst placeholder.
    const para = scene.add.text(origin.x, origin.y - 140, '§', {
      fontFamily: 'monospace',
      fontSize: '84px',
      color: '#ffe66d',
      stroke: '#0b0f1a',
      strokeThickness: 10,
    });
    para.setOrigin(0.5);
    para.setDepth(60);

    scene.tweens.add({
      targets: para,
      scale: { from: 0.6, to: 1.2 },
      alpha: { from: 1, to: 0 },
      y: para.y - 30,
      duration: 420,
      ease: 'Quad.Out',
      onComplete: () => para.destroy(),
    });

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
