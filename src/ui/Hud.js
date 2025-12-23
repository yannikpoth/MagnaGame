/* global Phaser */

import { PLAYER } from '../game/constants.js';
import { ensureInvertPipeline } from './InvertPipeline.js';

export class Hud {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    this._superMeterKeys = [
      'ui:super_meter:0',
      'ui:super_meter:1',
      'ui:super_meter:2',
      'ui:super_meter:3',
      'ui:super_meter:4',
    ];

    /** @type {string|null} */
    this._invertPipelineKey = ensureInvertPipeline(scene);
    /** @type {Phaser.Time.TimerEvent|null} */
    this._blinkEvent = null;
    /** @type {boolean} */
    this._blinkOn = false;

    this.superMeter = scene.add.image(0, 0, this._superMeterKeys[0]);
    this.superMeter.setScrollFactor(0);
    this.superMeter.setDepth(1000);
    this.superMeter.setOrigin(1, 1);

    // Boss HP meter (frame + 10-step bar behind it)
    this._bossHpSteps = 10;
    // Based on your frame design: centered transparent window where the bar should appear.
    // If you ever tweak the PNG, these are the only numbers you may need to adjust.
    this._bossHpWindowW = 1090;
    this._bossHpWindowH = 120;
    this._bossHpWindowTop = 56; // approx vertical offset from the top edge of the frame image

    this.bossHpUi = scene.add.container(0, 0);
    this.bossHpUi.setScrollFactor(0);
    this.bossHpUi.setDepth(1000);
    this.bossHpUi.setVisible(false);

    const yMid = this._bossHpWindowTop + this._bossHpWindowH / 2;

    // Bar background (slightly inset so it doesn't touch the frame border)
    const barBgH = Math.round(this._bossHpWindowH * 1);
    const barBg = scene.add.rectangle(0, yMid, this._bossHpWindowW, barBgH, 0x05070d, 0.85);
    barBg.setOrigin(0.5, 0.5);

    /** @type {Phaser.GameObjects.Rectangle[]} */
    this._bossHpSegments = [];
    const gap = 6;
    const pad = 0;
    // Taller segments while keeping them vertically centered in the window.
    const segH = Math.round((this._bossHpWindowH - pad * 2) * 1);
    const segW = (this._bossHpWindowW - pad * 2 - gap * (this._bossHpSteps - 1)) / this._bossHpSteps;
    const x0 = -this._bossHpWindowW / 2 + pad;
    const segColor = 0xc2410c; // dark orange/red (uniform, no rainbow)

    for (let i = 0; i < this._bossHpSteps; i += 1) {
      const seg = scene.add.rectangle(x0 + i * (segW + gap), yMid, segW, segH, segColor, 1);
      seg.setOrigin(0, 0.5);
      seg.setAlpha(0.95);
      this._bossHpSegments.push(seg);
    }

    this.bossHpFrame = scene.add.image(0, 0, 'ui:boss_hp_meter').setOrigin(0.5, 0);

    // Add in render order: bar behind, frame on top
    this.bossHpUi.add([barBg, ...this._bossHpSegments, this.bossHpFrame]);

    this.hintText = scene.add.text(12, 54, 'F: attack   X: super   R: restart', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cbd5e1',
    });
    this.hintText.setScrollFactor(0);
    this.hintText.setDepth(1000);

    this._onResize = (gameSize) => this._layout(gameSize);
    this.scene.scale.on('resize', this._onResize);
    this._layout();
  }

  /**
   * @param {{width:number,height:number}|undefined} [gameSize]
   */
  _layout(gameSize) {
    const w = Math.floor(gameSize?.width ?? this.scene.scale.width);
    const h = Math.floor(gameSize?.height ?? this.scene.scale.height);

    const margin = 6;
    this.superMeter.setPosition(w - margin, h - margin);

    // Auto-scale the large meter art down to a HUD-friendly size.
    // Keep it readable without covering too much of the playfield.
    const tex = this.scene.textures.get(this._superMeterKeys[0]);
    const src = tex?.getSourceImage?.();
    const baseW = Math.max(1, src?.width ?? 1024);
    const desiredW = Math.max(160, Math.min(280, Math.round(w * 0.28)));
    const scale = (desiredW / baseW) * 0.8;
    this.superMeter.setScale(scale);

    // Boss HP UI (top center)
    const topMargin = 8;
    this.bossHpUi.setPosition(Math.round(w / 2), topMargin);

    const bossTex = this.scene.textures.get('ui:boss_hp_meter');
    const bossSrc = bossTex?.getSourceImage?.();
    const bossBaseW = Math.max(1, bossSrc?.width ?? 1600);
    // Keep it within the viewport width with a little breathing room.
    const bossDesiredW = Math.max(360, Math.min(Math.round(w * 0.96), 920));
    // Reduce overall size (~50% of previous).
    const bossScale = (bossDesiredW / bossBaseW) * 0.5;
    this.bossHpUi.setScale(bossScale);
  }

  _startBlink() {
    if (this._blinkEvent) return;
    this._blinkOn = false;

    this._blinkEvent = this.scene.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        if (!this.superMeter?.active) return;
        this._blinkOn = !this._blinkOn;

        if (this._invertPipelineKey) {
          if (this._blinkOn) this.superMeter.setPipeline(this._invertPipelineKey);
          else this.superMeter.resetPipeline();
        } else {
          // Canvas fallback: flash opacity.
          this.superMeter.setAlpha(this._blinkOn ? 0.35 : 1);
        }
      },
    });
  }

  _stopBlink() {
    if (this._blinkEvent) {
      this._blinkEvent.remove(false);
      this._blinkEvent = null;
    }
    if (this.superMeter) {
      this.superMeter.setAlpha(1);
      if (this._invertPipelineKey && this.superMeter.resetPipeline) this.superMeter.resetPipeline();
    }
    this._blinkOn = false;
  }

  /**
   * @param {{kills:number, bossHp?:number, bossMaxHp?:number}} state
   */
  update(state) {
    const kills = state.kills ?? 0;
    const req = PLAYER.superKillsRequired;
    const clamped = Math.max(0, Math.min(req, kills));

    const ready = clamped >= req;
    const meterIndex = Math.max(0, Math.min(req, Math.floor(clamped)));
    this.superMeter.setTexture(this._superMeterKeys[meterIndex]);

    if (ready) this._startBlink();
    else this._stopBlink();

    // Boss HP meter
    if (typeof state.bossHp === 'number' && typeof state.bossMaxHp === 'number' && state.bossMaxHp > 0) {
      const hp = Math.max(0, Math.min(state.bossMaxHp, state.bossHp));
      const steps = this._bossHpSteps;
      // Convert HP to 10-step display (for bossMaxHp=10 this is 1:1).
      const filled = Math.round((hp / state.bossMaxHp) * steps);
      for (let i = 0; i < this._bossHpSegments.length; i += 1) {
        // Dim empty segments slightly instead of hiding (reads nicer through the frame).
        this._bossHpSegments[i].setAlpha(i < filled ? 0.95 : 0.18);
      }
      this.bossHpUi.setVisible(true);
    } else {
      this.bossHpUi.setVisible(false);
    }
  }

  destroy() {
    try {
      this.scene.scale.off('resize', this._onResize);
    } catch (_) {
      // ignore
    }
    this._stopBlink();
    this.superMeter.destroy();
    this.bossHpUi.destroy(true);
    this.hintText.destroy();
  }
}


