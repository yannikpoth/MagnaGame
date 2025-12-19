/* global Phaser */

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    // Keep pixels crisp on camera transforms.
    this.cameras.main.roundPixels = true;
    this.scene.start('PreloadScene');
  }
}

