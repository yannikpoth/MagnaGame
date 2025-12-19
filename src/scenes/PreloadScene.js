/* global Phaser */

import { PLATFORM } from '../game/constants.js';

const ASSET_ROOT = '/assets/processed/';

function getMaxTextureSize(scene) {
  const r = scene.game?.renderer;
  const gl = r?.gl;
  if (gl && typeof gl.getParameter === 'function') {
    return gl.getParameter(gl.MAX_TEXTURE_SIZE) || 8192;
  }
  return 8192;
}

function splitStripIntoSpriteSheets(scene, { stripKey, baseSheetKey, frameWidth, frameHeight, frameCount }) {
  const maxTex = getMaxTextureSize(scene);
  // Keep some headroom to avoid edge cases with drivers.
  const safeMaxTex = Math.max(1024, maxTex - 64);
  const framesPerChunk = Math.max(1, Math.floor(safeMaxTex / frameWidth));
  const chunkCount = Math.ceil(frameCount / framesPerChunk);

  const stripTex = scene.textures.get(stripKey);
  const img = stripTex?.getSourceImage?.();
  if (!img) throw new Error(`Missing source image for ${stripKey}`);

  /** @type {string[]} */
  const sheetKeys = [];

  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    const startFrame = chunk * framesPerChunk;
    const endFrame = Math.min(frameCount, startFrame + framesPerChunk);
    const framesInChunk = endFrame - startFrame;

    const canvas = document.createElement('canvas');
    canvas.width = framesInChunk * frameWidth;
    canvas.height = frameHeight;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Copy the chunk region of the long strip
    const sx = startFrame * frameWidth;
    const sw = framesInChunk * frameWidth;
    ctx.drawImage(img, sx, 0, sw, frameHeight, 0, 0, sw, frameHeight);

    const key = chunk === 0 ? baseSheetKey : `${baseSheetKey}:${chunk}`;
    scene.textures.addSpriteSheet(key, canvas, {
      frameWidth,
      frameHeight,
      endFrame: framesInChunk - 1,
    });

    sheetKeys.push(key);
  }

  // Free the huge strip texture to reduce memory pressure.
  scene.textures.remove(stripKey);

  return { sheetKeys, framesPerChunk };
}

function createStripAnimMulti(scene, { key, baseSheetKey, frameCount, framesPerChunk, fps = 8, repeat = -1 }) {
  /** @type {Phaser.Types.Animations.AnimationFrame[]} */
  const frames = [];
  for (let i = 0; i < frameCount; i += 1) {
    const chunk = Math.floor(i / framesPerChunk);
    const frame = i % framesPerChunk;
    const sheetKey = chunk === 0 ? baseSheetKey : `${baseSheetKey}:${chunk}`;
    frames.push({ key: sheetKey, frame });
  }

  scene.anims.create({
    key,
    frames,
    frameRate: fps,
    repeat,
  });
}

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    // Manifests
    this.load.json('frames:player', `${ASSET_ROOT}spritesheets/main_char/frames.json`);
    this.load.json('frames:enemy', `${ASSET_ROOT}spritesheets/enemy_cyberbully/frames.json`);
    this.load.json('frames:boss', `${ASSET_ROOT}spritesheets/end_boss_wolmerath/frames.json`);

    // Environment
    this.load.image('bg:sky', `${ASSET_ROOT}environment/background_parallax/background_sky_tile_pixelate.png`);
    this.load.image('fg:statue1', `${ASSET_ROOT}environment/background_parallax/foreground_elements/statue1.png`);
    this.load.image('fg:statue2', `${ASSET_ROOT}environment/background_parallax/foreground_elements/statue2.png`);
    this.load.image('fg:temple1', `${ASSET_ROOT}environment/background_parallax/foreground_elements/temple1.png`);
    // Intentionally not loading tiles_1.png

    // Load raw platform; we'll build a seam-safe, scaled tile texture in create().
    this.load.image('world:platform_raw', `${ASSET_ROOT}environment/platform/platform.png`);

    // Minimal loading text
    const w = this.scale.width;
    const h = this.scale.height;
    this._loadingText = this.add
      .text(w / 2, h / 2, 'Loading…', { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff' })
      .setOrigin(0.5);

    this.load.on('progress', (p) => {
      if (this._loadingText) this._loadingText.setText(`Loading… ${Math.floor(p * 100)}%`);
    });
  }

  create() {
    const dispatchDom = (name, detail) => {
      if (typeof window === 'undefined') return;
      if (detail !== undefined) {
        window.dispatchEvent(new CustomEvent(name, { detail }));
      } else {
        window.dispatchEvent(new Event(name));
      }
    };

    // Gate entering gameplay until the DOM splash overlay says “start”.
    this._startRequested = false;
    this._loadDone = false;
    this._onStartGame = () => {
      this._startRequested = true;
      if (this._loadDone) this.scene.start('LevelScene');
    };
    window.addEventListener('magna:start-game', this._onStartGame);

    const playerFrames = this.cache.json.get('frames:player');
    const enemyFrames = this.cache.json.get('frames:enemy');
    const bossFrames = this.cache.json.get('frames:boss');

    const queueCharacter = (prefix, framesJson) => {
      const { frameWidth, frameHeight, animations } = framesJson;
      for (const [animName, meta] of Object.entries(animations)) {
        const stripKey = `${prefix}:strip:${animName}`;
        this.load.image(stripKey, `${ASSET_ROOT}${meta.file}`);
      }

      // Store for later sizing decisions
      this.registry.set(`${prefix}:frameWidth`, frameWidth);
      this.registry.set(`${prefix}:frameHeight`, frameHeight);
      this.registry.set(`${prefix}:animations`, animations);
    };

    queueCharacter('player', playerFrames);
    queueCharacter('enemy', enemyFrames);
    queueCharacter('boss', bossFrames);

    // Second-phase loader: send progress events to the DOM loading bar.
    this._domProgressHandler = (p) => dispatchDom('magna:load-progress', { value: p });
    this.load.on('progress', this._domProgressHandler);
    dispatchDom('magna:load-start');

    this.load.once('complete', () => {
      // Build seam-safe, scaled platform texture for tiling.
      // This avoids gaps caused by sampling transparent edge pixels and non-integer UV mapping.
      try {
        const src = this.textures.get('world:platform_raw')?.getSourceImage?.();
        if (src) {
          const sh = src.height;

          // Auto-trim transparent horizontal padding (common reason for visible gaps when tiling).
          const tmp = document.createElement('canvas');
          tmp.width = src.width;
          tmp.height = src.height;
          const tctx = tmp.getContext('2d');
          tctx.imageSmoothingEnabled = false;
          tctx.drawImage(src, 0, 0);
          const imgData = tctx.getImageData(0, 0, tmp.width, tmp.height).data;

          const alphaThreshold = 8;
          let minX = tmp.width - 1;
          let maxX = 0;
          for (let y = 0; y < tmp.height; y += 1) {
            const row = y * tmp.width * 4;
            for (let x = 0; x < tmp.width; x += 1) {
              const a = imgData[row + x * 4 + 3];
              if (a > alphaThreshold) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
              }
            }
          }

          // Fallback if fully transparent (shouldn't happen)
          if (maxX <= minX) {
            minX = 0;
            maxX = tmp.width - 1;
          }

          // Nudge inward a tiny bit to avoid half-transparent fringes at the edges.
          const inset = 1;
          minX = Math.min(Math.max(0, minX + inset), tmp.width - 2);
          maxX = Math.max(Math.min(tmp.width - 1, maxX - inset), minX + 1);

          const sw = Math.max(1, maxX - minX + 1);
          const dw = Math.max(1, Math.round(sw * PLATFORM.scale));
          const dh = Math.max(1, Math.round(sh * PLATFORM.scale));

          // Pad 2px on both horizontal sides by duplicating edge columns (helps prevent seams).
          const pad = 2;
          const canvas = document.createElement('canvas');
          canvas.width = dw + pad * 2;
          canvas.height = dh;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = false;

          // Center draw (scaled)
          ctx.drawImage(src, minX, 0, sw, sh, pad, 0, dw, dh);
          // Left pad: duplicate leftmost column
          ctx.drawImage(src, minX, 0, 1, sh, 0, 0, pad, dh);
          // Right pad: duplicate rightmost column
          ctx.drawImage(src, minX + sw - 1, 0, 1, sh, pad + dw, 0, pad, dh);

          // Replace/alias as tiling texture key
          if (this.textures.exists('world:platform_tile')) this.textures.remove('world:platform_tile');
          this.textures.addCanvas('world:platform_tile', canvas);

          // Make sure filtering is nearest for pixel seams.
          this.textures.get('world:platform_tile').setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      } catch (e) {
        // If this fails, LevelScene will fall back to using the raw platform.
        // eslint-disable-next-line no-console
        console.warn('Platform tile build failed:', e);
      }

      // Split long strips into GPU-safe sprite sheets, then create animations.
      const mk = (prefix) => {
        const animations = this.registry.get(`${prefix}:animations`);
        const frameWidth = this.registry.get(`${prefix}:frameWidth`);
        const frameHeight = this.registry.get(`${prefix}:frameHeight`);
        for (const [animName, meta] of Object.entries(animations)) {
          const stripKey = `${prefix}:strip:${animName}`;
          const baseSheetKey = `${prefix}:sheet:${animName}`;
          const animKey = `${prefix}:${animName}`;

          // Make attack animations short + non-looping (the source strips are 32 frames).
          let animFrames = meta.frameCount;
          let fps = meta.fps ?? 8;
          let repeat = -1;
          if (prefix === 'player' && animName === 'attack') {
            animFrames = Math.min(meta.frameCount, 12);
            fps = 18;
            repeat = 0;
          }
          if (prefix === 'boss' && animName.startsWith('attack')) {
            animFrames = Math.min(meta.frameCount, 16);
            fps = 10;
            repeat = 0;
          }

          const { framesPerChunk } = splitStripIntoSpriteSheets(this, {
            stripKey,
            baseSheetKey,
            frameWidth,
            frameHeight,
            frameCount: animFrames,
          });

          createStripAnimMulti(this, {
            key: animKey,
            baseSheetKey,
            frameCount: animFrames,
            framesPerChunk,
            fps,
            repeat,
          });
        }
      };

      mk('player');
      mk('enemy');
      mk('boss');

      // Tell the DOM overlay that Phaser is fully loaded; wait for user “start”.
      this._loadDone = true;
      dispatchDom('magna:load-complete');
      if (this._startRequested) this.scene.start('LevelScene');
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      try {
        window.removeEventListener('magna:start-game', this._onStartGame);
      } catch {
        // ignore
      }
      if (this._domProgressHandler) this.load.off('progress', this._domProgressHandler);
    });

    this.load.start();
  }
}

