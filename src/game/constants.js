export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const CAMERA_ZOOM = 1;

export const GRAVITY_Y = 1800;

export const GROUND_Y = GAME_HEIGHT;

export const LEVEL = {
  // Level length in world pixels (independent from platform texture).
  // Adjust later when you decide where the level should end.
  width: 16000,
};

export const SCALE = {
  player: 0.35,
  enemy: 0.35,
  boss: 0.5,
  parallax: 0.35,
};

export const PLATFORM = {
  // Visual scale of the big platform strip.
  scale: 0.5,
  // Where the *walkable* ground line is relative to screen bottom (in world pixels).
  // The platform art has piles below the walk surface, so characters should stand above the bottom.
  floorFromBottomPx: 180,
  colliderThicknessPx: 40,
};

export const PLAYER = {
  accel: 2200,
  drag: 2400,
  maxSpeed: 420,
  jumpVelocity: 760,
  coyoteMs: 90,
  jumpBufferMs: 110,
  attackCooldownMs: 280,
  // Delay before the hitbox becomes active, to match the guitar swing animation.
  attackWindupMs: 300,
  attackDurationMs: 160,
  superKillsRequired: 4,
};

export const ENEMY = {
  speed: 170,
  spawnInitialMs: 2200,
  spawnMinMs: 900,
  spawnRampMs: 25000,
  maxCount: 20,
};

export const BOSS = {
  // Boss survives 10 normal hits; super counts as 2.
  hp: 10,
  speed: 90,
  attackCooldownMs: 900,
  attackWindupMs: 260,
  arenaLeftPadding: 520,
};

export const MUSIC = {
  // Global base volume for background music (0..1).
  // Sound effects can temporarily "duck" music below this level.
  baseVolume: 0.8,
  // Default ducking parameters (used when SFX plays).
  duckTo: 0.35,
  duckAttackMs: 60,
  duckHoldMs: 120,
  duckReleaseMs: 520,
};
