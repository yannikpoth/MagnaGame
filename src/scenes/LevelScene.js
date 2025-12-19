/* global Phaser */

import { BOSS, CAMERA_ZOOM, ENEMY, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, LEVEL, PLATFORM, SCALE } from '../game/constants.js';
import { Player } from '../entities/Player.js';
import { EnemyCyberbully } from '../entities/EnemyCyberbully.js';
import { BossWolmerath } from '../entities/BossWolmerath.js';
import { MeleeHitbox } from '../combat/MeleeHitbox.js';
import { SuperAttack } from '../combat/SuperAttack.js';
import { Hud } from '../ui/Hud.js';
import { duckMusic, playMusic, stopMusic } from '../audio/AudioManager.js';

export class LevelScene extends Phaser.Scene {
  constructor() {
    super('LevelScene');
  }

  create() {
    // Music: ensure the ingame loop is active during gameplay.
    playMusic(this, 'music:ingame');

    // Safety: previous scene instances may have paused global systems (e.g. game over).
    // Scene restart does not automatically resume the global animation manager.
    try {
      this.anims.resumeAll();
      this.physics.world.resume();
    } catch (_) {
      // ignore
    }

    this.worldWidth = LEVEL.width;
    this.worldHeight = GAME_HEIGHT;

    // World + camera
    // Important: we clamp the *physics* world bottom to the action line (groundTopY),
    // so characters can never fall below the intended play line even if a collider misbehaves.
    // We set this properly after computing groundTopY.
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.setZoom(CAMERA_ZOOM);
    this.cameras.main.roundPixels = true;

    // Parallax background
    this.bgSky = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg:sky')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0);

    // Platform visual (bottom aligned, scaled down)
    const platformKey = this.textures.exists('world:platform_tile') ? 'world:platform_tile' : 'world:platform_raw';
    const platformSource = this.textures.get(platformKey)?.getSourceImage?.();
    const platformH = Math.round((platformSource?.height ?? 504) * 1);
    const platformTopY = GROUND_Y - platformH;

    // Ground (behind platform, behind props, same scroll speed).
    // Only show the upper third of the source image for a "distant ground" feel.
    const groundSource = this.textures.get('world:ground')?.getSourceImage?.();
    const groundFullH = Math.max(1, groundSource?.height ?? 180);
    const groundVisibleH = Math.max(1, Math.round(groundFullH / 3));
    const groundOverlapIntoPlatform = Math.min(16, Math.round(groundVisibleH * 0.25));
    // Nudge the ground upward a touch so it's clearly visible.
    const groundNudgePx = -Math.round(groundVisibleH * 0.03);
    this.groundImage = this.add
      .tileSprite(0, platformTopY + groundOverlapIntoPlatform + groundNudgePx, this.worldWidth, groundVisibleH, 'world:ground')
      .setOrigin(0, 1)
      .setScrollFactor(1)
      .setDepth(0.8);

    // Wall (in front of all background/props, but still behind platform)
    const wallSource = this.textures.get('world:wall')?.getSourceImage?.();
    const wallH = Math.max(1, wallSource?.height ?? 120);
    const wallScale = 0.25;
    this.wallImage = this.add
      // Widen the tileSprite, then scale down so we still cover the full world width.
      .tileSprite(0, platformTopY - 1, this.worldWidth / wallScale, wallH, 'world:wall')
      .setOrigin(0, 1)
      .setScrollFactor(1)
      .setDepth(1.9)
      .setScale(wallScale);

    this.platformImage = this.add
      .tileSprite(0, GROUND_Y, this.worldWidth, platformH, platformKey)
      .setOrigin(0, 1)
      .setScrollFactor(1);
    // The platform tile texture is pre-scaled; tileScale=1 avoids seams.
    this.platformImage.tileScaleX = 1;
    this.platformImage.tileScaleY = 1;
    // Platform should be on top of bg/parallax, but under characters.
    this.platformImage.setDepth(2);

    // Decorative foreground elements (ignore tiles_1.png intentionally)
    // Place several props early & throughout the level so they are visible immediately.
    const decoDepth = 1; // behind platform
    const addProp = (key, x, y, scroll, scale = SCALE.parallax, alpha = 0.95) => {
      const img = this.add
        .image(x, y, key)
        .setOrigin(0.5, 1)
        .setScrollFactor(scroll)
        .setScale(scale)
        .setAlpha(alpha)
        .setDepth(decoDepth);

      // Quick variation: randomly mirror foreground props.
      img.setFlipX(Math.random() < 0.5);
    };

    // Foreground prop tuning
    const statueScale = SCALE.parallax * 0.5; // half size
    // Align props so their *bottom* sits 1px below the platform PNG top edge.
    const propBottomY = platformTopY + 1;
    const statueY = propBottomY;
    const templeY = propBottomY;

    const statueXs = [900, 1900, 3100, 4600, 6100, 7600, 9200, 10900, 12600, 14300];
    for (let i = 0; i < statueXs.length; i += 1) {
      addProp(i % 2 === 0 ? 'fg:statue1' : 'fg:statue2', statueXs[i], statueY, 1, statueScale);
    }
    addProp('fg:temple1', 1400, templeY, 1, SCALE.parallax * 0.95);
    addProp('fg:temple1', 8200, templeY, 1, SCALE.parallax * 0.95, 0.9);

    // Ground collider (walkable line above the bottom piles)
    this.groundY = GROUND_Y - PLATFORM.floorFromBottomPx;
    this.groundTopY = this.groundY - PLATFORM.colliderThicknessPx / 2;

    // Now that we know the intended "floor", clamp physics world bounds to it.
    this.physics.world.setBounds(0, 0, this.worldWidth, this.groundTopY);

    // Use a Zone (not a Rectangle) for a reliable, non-rendered collider.
    // Some render-shapes can have confusing bounds/size semantics in Arcade Physics.
    const groundZone = this.add
      .zone(this.worldWidth / 2, this.groundY, this.worldWidth, PLATFORM.colliderThicknessPx)
      .setOrigin(0.5);
    this.physics.add.existing(groundZone, true);
    // @ts-ignore
    groundZone.body.updateFromGameObject();
    this.ground = groundZone;

    /** @param {Phaser.Types.Physics.Arcade.SpriteWithDynamicBody} sprite */
    this._snapBodyBottomToGround = (sprite) => {
      // Arcade physics body coordinates are authoritative; align by shifting the game object.
      const delta = this.groundTopY - sprite.body.bottom;
      sprite.y += delta;
    };

    // Player
    this.player = new Player(this, 140, 0);
    this.add.existing(this.player);
    this.physics.add.existing(this.player);
    this.player.configureBody();
    this.player.setDepth(5);
    // Place so the *physics body bottom* sits on top of the ground collider.
    this._snapBodyBottomToGround(this.player);

    this.physics.add.collider(this.player, this.ground);

    // Horizontal follow only (keep ground bottom-aligned / avoid vertical camera drift).
    this.cameras.main.startFollow(this.player, true, 0.15, 0);

    // Enemies
    this.enemies = this.physics.add.group();
    this.physics.add.collider(this.enemies, this.ground);

    this.physics.add.overlap(this.player, this.enemies, () => this._triggerGameOver('enemy'), null, this);

    // Boss
    this.boss = null;
    // Boss projectiles: keep as a plain container for cleanup, but wire physics overlaps
    // per-projectile to avoid Arcade Group side-effects.
    this.bossProjectiles = this.add.group();

    // HUD
    this.hud = new Hud(this);

    // Combat hooks
    this.player.handlers.onMelee = (hitboxSpec) => {
      const hb = new MeleeHitbox(this, hitboxSpec);

      // Keep hitbox attached to the player during the swing window.
      // This makes hits reliable even if the player is moving.
      const followEvt = this.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (!hb?.gameObject || !hb.gameObject.active || !this.player?.active) {
            followEvt.remove(false);
            return;
          }
          const body = this.player.body;
          const bodyCenterX = body.x + body.width * 0.5;
          const bodyCenterY = body.y + body.height * 0.5;

          const w = hitboxSpec.width;
          const padding = 12;
          hb.setPosition(
            bodyCenterX + this.player.facing * (body.width * 0.5 + w * 0.5 + padding),
            bodyCenterY - body.height * 0.15,
          );
        },
      });

      this.physics.add.overlap(hb.gameObject, this.enemies, (_, enemy) => {
        if (!enemy?.active) return;
        if (!hb.tryHit(enemy)) return;
        // Future SFX hook: duck music when hit SFX plays.
        duckMusic(this, { key: 'music:ingame' });
        enemy.die({ via: 'melee' });
        this.player.addKills(1);
        this.cameras.main.shake(50, 0.005);
      });

      if (this.boss) {
        this.physics.add.overlap(hb.gameObject, this.boss, (_, boss) => {
          if (!boss?.active) return;
          if (!hb.tryHit(boss)) return;
          // Future SFX hook: duck music when hit SFX plays.
          duckMusic(this, { key: 'music:ingame' });
          boss.takeHit(1);
        });
      }
    };

    this.player.handlers.onSuper = (origin) => {
      // Future SFX hook: duck music when super SFX plays.
      duckMusic(this, { key: 'music:ingame' });
      SuperAttack.activate(this, origin, { enemies: this.enemies, boss: this.boss });
    };

    this._levelStartAt = this.time.now;
    this._nextEnemySpawnAt = this.time.now + 800;
    this._bossTriggered = false;
    this._enemiesSpawned = 0;

    // Boss intro modal (shown right before boss spawns)
    this._bossIntroOpen = false;
    this._bossIntroUi = null;

    // Game over overlay
    this._gameOverOpen = false;
    this._gameOverUi = null;
    this._gameOverArmed = false;
    this._spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Ensure paused global systems are restored if the scene is restarted/destroyed
    // while a game-over overlay is active.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      try {
        this.anims.resumeAll();
        this.physics.world.resume();
      } catch (_) {
        // ignore
      }
      try {
        if (this._gameOverUi) {
          this._gameOverUi.overlay?.destroy();
          this._gameOverUi.vignette?.destroy();
          this._gameOverUi.scanlines?.destroy();
          this._gameOverUi.titleShadow?.destroy();
          this._gameOverUi.titleCyan?.destroy();
          this._gameOverUi.titleMagenta?.destroy();
          this._gameOverUi.title?.destroy();
          this._gameOverUi.titleHi?.destroy();
          this._gameOverUi.hint?.destroy();
          this._gameOverUi.hint2?.destroy();
        }
      } finally {
        this._gameOverUi = null;
        this._gameOverOpen = false;
        this._gameOverArmed = false;
      }
    });
  }

  update(time, delta = 16) {
    const cam = this.cameras.main;

    // Sky is screen-anchored (scrollFactor=0): keep it fixed and fill the viewport.
    this.bgSky.setPosition(0, 0);
    this.bgSky.setSize(this.scale.width, this.scale.height);
    // Parallax: when moving right, sky should drift left.
    // In Phaser, increasing tilePositionX shifts the texture left, so we use +scrollX.
    this.bgSky.tilePositionX = Math.floor(cam.scrollX * 0.15);

    // Game over overlay: freeze gameplay updates (render still runs).
    if (this._gameOverOpen) {
      // Require releasing SPACE before we accept a restart press.
      if (!this._gameOverArmed && this._spaceKey?.isUp) this._gameOverArmed = true;
      if (this._gameOverArmed && Phaser.Input.Keyboard.JustDown(this._spaceKey)) {
        // Important: anims.pauseAll() affects the global animation manager; resume before restart.
        try {
          this.anims.resumeAll();
          this.physics.world.resume();
        } catch (_) {
          // ignore
        }
        this.scene.restart();
      }
      return;
    }

    // If a modal is open, freeze gameplay updates (render still runs).
    if (this._bossIntroOpen) return;

    // Player
    if (this.player?.active) this.player.update(time);

    // Fall death
    if (this.player.y > GAME_HEIGHT + 300) {
      this._triggerGameOver('fall');
      return;
    }

    // Enemy spawns (stop once boss is active)
    if (!this._bossTriggered && time >= this._nextEnemySpawnAt) {
      // Dead zone at start: wait until player has moved one full screen width.
      if (this.player.x < GAME_WIDTH) {
        this._nextEnemySpawnAt = time + 250;
        return;
      }

      // Hard cap: only spawn up to N enemies total.
      if (this._enemiesSpawned >= ENEMY.maxCount) {
        // No more spawns; wait for cleanup/boss condition below.
        this._nextEnemySpawnAt = time + 250;
        return;
      }

      // Spawn spacing dead zone:
      // ensure at least ~3 enemy-widths of horizontal space to the next enemy.
      // (Prevents "train" spawns that are impossible to react to.)
      const spawnX = Phaser.Math.Clamp(cam.worldView.right + 240, 80, this.worldWidth - 80);
      let rightmost = null;
      let rightmostX = -Infinity;
      for (const e of this.enemies.getChildren()) {
        if (!e?.active) continue;
        if (e.x > rightmostX) {
          rightmostX = e.x;
          rightmost = e;
        }
      }
      if (rightmost) {
        const enemyWidth = rightmost.body?.width ?? rightmost.displayWidth ?? 80;
        const minGap = enemyWidth * 3;
        if (spawnX - rightmostX < minGap) {
          // Check again shortly; keep the time-ramp logic intact.
          this._nextEnemySpawnAt = time + 120;
          return;
        }
      }

      this._spawnEnemy();

      const elapsed = time - this._levelStartAt;
      const t = Phaser.Math.Clamp(elapsed / ENEMY.spawnRampMs, 0, 1);
      const delay = Math.round(ENEMY.spawnInitialMs + (ENEMY.spawnMinMs - ENEMY.spawnInitialMs) * t);

      this._nextEnemySpawnAt = time + delay;
    }

    // Cleanup enemies behind camera
    const killX = this.cameras.main.scrollX - 300;
    for (const e of this.enemies.getChildren()) {
      if (e?.active && e.x < killX) e.die({ via: 'despawn' });
    }

    // Boss trigger: spawn when ALL capped enemies are dead.
    if (!this._bossTriggered && this._enemiesSpawned >= ENEMY.maxCount) {
      let living = 0;
      for (const e of this.enemies.getChildren()) {
        if (e?.active) living += 1;
      }
      if (living === 0) {
        // Stop spawns immediately, show boss warning, then spawn boss on dismiss.
        this._bossTriggered = true;
        this._openBossIntroModal();
      }
    }

    // Boss AI
    if (this.boss?.active) {
      // Boss can roam the whole level (it spawns like a normal enemy now).
      const arenaLeft = 0;
      const arenaRight = this.worldWidth;

      this.boss.updateAI(time, {
        player: this.player,
        arenaLeft,
        arenaRight,
        onPearl: (spec) => {
          // Pearl: rolling projectile along the ground.
          // Keep gameplay sizing stable by scaling the sprite to ~24px diameter.
          const desiredDiameter = 24;
          const tex = this.textures.get('fx:pearl');
          const src = tex?.getSourceImage?.();
          const baseDiameter = Math.max(1, Math.min(src?.width ?? desiredDiameter, src?.height ?? desiredDiameter));
          const scale = desiredDiameter / baseDiameter;
          const r = desiredDiameter / 2;
          const dir = spec.dir >= 0 ? 1 : -1;

          // IMPORTANT:
          // Keep this projectile *out of Arcade Physics* to avoid hard-to-debug freeze /
          // re-entrancy issues on spawn. We'll move it manually and do a simple hit test.
          const pearl = this.add.image(spec.x, this.groundTopY - r, 'fx:pearl').setDepth(7);
          pearl.setOrigin(0.5, 0.5);
          pearl.setScale(scale);
          pearl.rotation = 0;
          pearl._vx = dir * 340; // px/s
          pearl._r = r;

          this.bossProjectiles.add(pearl);

          // Cleanup after a bit.
          this.time.delayedCall(6000, () => {
            if (!pearl?.active) return;
            pearl.destroy();
          });
        },
      });

      if (this.boss.hp <= 0) {
        // Stop gameplay music when we leave the level.
        // (Win fanfare/track can be added later in VictoryScene.)
        stopMusic(this, 'music:ingame');
        this.scene.start('VictoryScene', {
          message: 'Wolmerath is defeated. The storm temple belongs to rock again.',
        });
        return;
      }
    }

    // Boss projectiles update (manual movement + collision)
    if (this.bossProjectiles?.getChildren && this.player?.active) {
      const dt = Math.max(1, delta) / 1000;
      const killX = this.cameras.main.scrollX - 400;
      const playerBody = this.player.body;

      for (const p of this.bossProjectiles.getChildren()) {
        if (!p?.active) continue;
        // Move + spin
        const vx = typeof p._vx === 'number' ? p._vx : 0;
        const dx = vx * dt;
        p.x += dx;

        // Rolling rotation: angle (radians) ~= distance / radius.
        // Phaser's positive rotation appears clockwise (screen y is down),
        // so moving left (dx < 0) naturally yields counter-clockwise rotation.
        const r = typeof p._r === 'number' ? Math.max(1, p._r) : Math.max(1, (p.displayWidth ?? 24) / 2);
        p.rotation += dx / r;

        // Despawn behind camera
        if (p.x < killX) {
          p.destroy();
          continue;
        }

        // Hit test vs player physics body
        if (playerBody) {
          const r = typeof p._r === 'number' ? p._r : 12;
          const px0 = p.x - r;
          const px1 = p.x + r;
          const py0 = p.y - r;
          const py1 = p.y + r;
          const bx0 = playerBody.x;
          const bx1 = playerBody.x + playerBody.width;
          const by0 = playerBody.y;
          const by1 = playerBody.y + playerBody.height;

          const overlap = px0 < bx1 && px1 > bx0 && py0 < by1 && py1 > by0;
          if (overlap) {
            this._triggerGameOver('pearl');
            return;
          }
        }
      }
    }

    // HUD
    this.hud.update({
      kills: this.player.kills,
      bossHp: this.boss?.active ? this.boss.hp : undefined,
      bossMaxHp: this.boss?.active ? this.boss.maxHp : undefined,
    });
  }

  _spawnEnemy() {
    const cam = this.cameras.main;
    // Spawn just beyond the visible right edge (world-space).
    // Using camera.worldView avoids issues with Scale.FIT letterboxing where scale.width
    // can be much larger than the actual camera view in world units.
    const x = Phaser.Math.Clamp(cam.worldView.right + 240, 80, this.worldWidth - 80);
    const y = this.groundTopY;

    const enemy = new EnemyCyberbully(this, x, y);
    this.add.existing(enemy);
    this.physics.add.existing(enemy);
    enemy.configureBody();
    enemy.setDepth(5);
    enemy.body.updateFromGameObject();
    this._snapBodyBottomToGround(enemy);
    enemy.body.updateFromGameObject();

    this.enemies.add(enemy);
    this._enemiesSpawned += 1;
  }

  _spawnBoss() {
    const cam = this.cameras.main;
    // Spawn like a cyberbully: just beyond the visible right edge.
    const x = Phaser.Math.Clamp(cam.worldView.right + 240, 80, this.worldWidth - 80);
    const y = this.groundTopY;

    this.boss = new BossWolmerath(this, x, y);
    this.add.existing(this.boss);
    this.physics.add.existing(this.boss);
    this.boss.configureBody();
    this.boss.setDepth(6);
    this._snapBodyBottomToGround(this.boss);

    this.physics.add.collider(this.boss, this.ground);
    this.physics.add.overlap(this.player, this.boss, () => this._triggerGameOver('boss'));
  }

  _openBossIntroModal() {
    if (this._bossIntroOpen) return;
    this._bossIntroOpen = true;

    // Freeze physics + animations so the "press SPACE" doesn't turn into a jump.
    try {
      if (this.player?.body) this.player.body.setVelocity(0, 0);
      this.physics.world.pause();
      this.anims.pauseAll();
    } catch (_) {
      // If any subsystem is missing (edge case), still show the modal.
    }

    const uiDepth = 2500;
    const w = Math.min(860, this.scale.width - 60);
    const h = Math.min(280, this.scale.height - 80);
    const x0 = Math.round((this.scale.width - w) / 2);
    const y0 = Math.round((this.scale.height - h) / 2);

    const overlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.35)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(uiDepth);

    // Retro Nintendo-ish dialog: light panel + dark outline + subtle shadow.
    const panel = this.add.graphics().setScrollFactor(0).setDepth(uiDepth + 1);
    panel.fillStyle(0x0b0f1a, 0.35);
    panel.fillRect(x0 + 6, y0 + 6, w, h);
    panel.fillStyle(0xf7f3d7, 1);
    panel.fillRect(x0, y0, w, h);
    panel.lineStyle(4, 0x111827, 1);
    panel.strokeRect(x0 + 2, y0 + 2, w - 4, h - 4);
    panel.lineStyle(2, 0xffffff, 0.55);
    panel.strokeRect(x0 + 10, y0 + 10, w - 20, h - 20);

    const title = this.add
      .text(x0 + w / 2, y0 + 24, 'WOLMERALARM!!!', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#111827',
        fontStyle: 'bold',
        letterSpacing: 1,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(uiDepth + 2);

    const bodyText =
      'Watch out! An angry Wolmerath just entered the Battlefield. It turns out he was a double agent all along! He only pretended to research against bullying. In truth, he is the king of bullies.';

    const body = this.add
      .text(x0 + 24, y0 + 72, bodyText, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#111827',
        wordWrap: { width: w - 48, useAdvancedWrap: true },
        lineSpacing: 4,
        letterSpacing: 0.5,
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(uiDepth + 2);

    const hint = this.add
      .text(x0 + w / 2, y0 + h - 22, 'Press SPACE to continue', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#111827',
        letterSpacing: 1,
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(uiDepth + 2);

    this._bossIntroUi = { overlay, panel, title, body, hint };

    // Dismiss with SPACE.
    this.input.keyboard.once('keydown-SPACE', () => {
      this._closeBossIntroModal();
    });
  }

  _closeBossIntroModal() {
    if (!this._bossIntroOpen) return;
    this._bossIntroOpen = false;

    // Clean up UI
    try {
      if (this._bossIntroUi) {
        this._bossIntroUi.overlay?.destroy();
        this._bossIntroUi.panel?.destroy();
        this._bossIntroUi.title?.destroy();
        this._bossIntroUi.body?.destroy();
        this._bossIntroUi.hint?.destroy();
      }
    } finally {
      this._bossIntroUi = null;
    }

    // Prevent the dismiss key press from being interpreted as a buffered jump.
    try {
      this.input.keyboard.resetKeys();
      const spaceKey = this.player?.keys?.cursors?.space;
      if (spaceKey?.reset) spaceKey.reset();
    } catch (_) {
      // ignore
    }

    // Resume gameplay and spawn boss just off-screen to the right.
    try {
      this.anims.resumeAll();
      this.physics.world.resume();
    } catch (_) {
      // ignore
    }

    this._spawnBoss();
  }

  /**
   * @param {'enemy' | 'boss' | 'pearl' | 'fall' | 'unknown'} reason
   */
  _triggerGameOver(reason = 'unknown') {
    if (this._gameOverOpen) return;
    if (this._bossIntroOpen) return; // modal owns input; ignore edge cases
    this._gameOverOpen = true;
    this._gameOverArmed = false;

    // Stop movement immediately.
    try {
      if (this.player?.body) this.player.body.setVelocity(0, 0);
      for (const e of this.enemies?.getChildren?.() ?? []) {
        if (e?.body?.setVelocity) e.body.setVelocity(0, 0);
      }
      if (this.boss?.body?.setVelocity) this.boss.body.setVelocity(0, 0);
    } catch (_) {
      // ignore
    }

    // Pause gameplay systems (render still runs).
    try {
      this.physics.world.pause();
      this.anims.pauseAll();
    } catch (_) {
      // ignore
    }

    // Prevent buffered jump from instantly restarting.
    try {
      this.input.keyboard.resetKeys();
    } catch (_) {
      // ignore
    }

    // Build "impressive" code-only retro overlay.
    const uiDepth = 4000;

    // Dark overlay + subtle vignette
    const overlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(uiDepth);

    const vignette = this.add.graphics().setScrollFactor(0).setDepth(uiDepth + 1);
    const w = this.scale.width;
    const h = this.scale.height;
    // Fake vignette by stacking translucent rect borders.
    vignette.fillStyle(0x000000, 0.18);
    for (let i = 0; i < 10; i += 1) {
      vignette.fillRect(i * 10, i * 8, w - i * 20, 16);
      vignette.fillRect(i * 10, h - i * 8 - 16, w - i * 20, 16);
      vignette.fillRect(i * 10, i * 8, 16, h - i * 16);
      vignette.fillRect(w - i * 10 - 16, i * 8, 16, h - i * 16);
    }

    // Scanlines (generated texture, no imported PNG)
    if (!this.textures.exists('fx:scanlines')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.clear();
      g.fillStyle(0xffffff, 0.14);
      g.fillRect(0, 0, 4, 1);
      g.fillStyle(0xffffff, 0.04);
      g.fillRect(0, 2, 4, 1);
      g.generateTexture('fx:scanlines', 4, 4);
      g.destroy();
    }

    const scanlines = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, 'fx:scanlines')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setAlpha(0.22)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(uiDepth + 2);

    // Text stack (shadow + chroma + main + highlight) to feel "arcade"
    const cx = Math.round(this.scale.width / 2);
    const cy = Math.round(this.scale.height / 2);

    const baseStyle = {
      fontFamily: 'monospace',
      fontStyle: 'bold',
      fontSize: '34px', // keep small-ish, then scale up for pixel feel
      color: '#ff1b2d',
      align: 'center',
      letterSpacing: 6,
      stroke: '#09090b',
      strokeThickness: 10,
    };

    const titleShadow = this.add
      .text(cx + 6, cy - 84 + 7, 'GAME  OVER', { ...baseStyle, color: '#7f0b12' })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setScale(3.0)
      .setAlpha(0.85)
      .setDepth(uiDepth + 3);

    const titleCyan = this.add
      .text(cx - 3, cy - 84, 'GAME  OVER', { ...baseStyle, color: '#00e5ff', stroke: '#001018', strokeThickness: 8 })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setScale(3.0)
      .setAlpha(0.22)
      .setDepth(uiDepth + 4);

    const titleMagenta = this.add
      .text(cx + 3, cy - 84, 'GAME  OVER', { ...baseStyle, color: '#ff2dff', stroke: '#180014', strokeThickness: 8 })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setScale(3.0)
      .setAlpha(0.18)
      .setDepth(uiDepth + 4);

    const title = this.add
      .text(cx, cy - 84, 'GAME  OVER', baseStyle)
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setScale(3.0)
      .setDepth(uiDepth + 5);

    const titleHi = this.add
      .text(cx, cy - 84, 'GAME  OVER', {
        ...baseStyle,
        color: '#ffe4e6',
        stroke: '#ffffff',
        strokeThickness: 0,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setScale(3.0)
      .setAlpha(0.1)
      .setDepth(uiDepth + 6);

    const hint = this.add
      .text(cx, cy + 90, 'Press SPACE to restart', {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '16px',
        color: '#ffffff',
        align: 'center',
        stroke: '#09090b',
        strokeThickness: 6,
        letterSpacing: 1,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setScale(2.4)
      .setDepth(uiDepth + 6);

    const hint2 = this.add
      .text(cx, cy + 90, 'Press SPACE to restart', {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '16px',
        color: '#ff1b2d',
        align: 'center',
        letterSpacing: 1,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setScale(2.4)
      .setAlpha(0.18)
      .setDepth(uiDepth + 5);

    // Animations: bob + glitch jitter + scanline drift + hint pulse
    this.tweens.add({
      targets: [titleShadow, titleCyan, titleMagenta, title, titleHi],
      y: '+=10',
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    this.tweens.add({
      targets: scanlines,
      tilePositionY: 64,
      duration: 1200,
      repeat: -1,
      ease: 'Linear',
    });

    this.tweens.add({
      targets: [hint, hint2],
      alpha: { from: 0.55, to: 1 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    // Glitch: tiny periodic chroma offsets
    this.tweens.add({
      targets: titleCyan,
      x: cx - 5,
      duration: 80,
      yoyo: true,
      repeat: -1,
      ease: 'Linear',
      repeatDelay: 220,
    });
    this.tweens.add({
      targets: titleMagenta,
      x: cx + 5,
      duration: 80,
      yoyo: true,
      repeat: -1,
      ease: 'Linear',
      repeatDelay: 260,
    });
    this.tweens.add({
      targets: titleHi,
      alpha: { from: 0.05, to: 0.18 },
      duration: 140,
      yoyo: true,
      repeat: -1,
      ease: 'Linear',
      repeatDelay: 340,
    });

    // Tiny "impact" on death
    try {
      this.cameras.main.shake(180, 0.01);
    } catch (_) {
      // ignore
    }

    this._gameOverUi = {
      overlay,
      vignette,
      scanlines,
      titleShadow,
      titleCyan,
      titleMagenta,
      title,
      titleHi,
      hint,
      hint2,
      reason,
    };
  }
}
