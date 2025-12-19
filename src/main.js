import { createGame } from './game/createGame.js';
import { initSplashOverlay } from './ui/splashOverlay.js';

const splash = initSplashOverlay();

// Only create Phaser after the first user gesture. This prevents the “black screen”
// problem on slow networks and prepares for future audio autoplay restrictions.
splash.waitForBegin().then(() => {
  createGame({ parent: 'app' });
});

