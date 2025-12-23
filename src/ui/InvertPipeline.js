/* global Phaser */

// Minimal WebGL pipeline to invert sprite colors.
// Used for the "SUPER READY" meter blink effect.
export class InvertPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  /**
   * @param {Phaser.Game} game
   */
  constructor(game) {
    super({
      game,
      fragShader: `
        precision mediump float;

        uniform sampler2D uMainSampler;
        varying vec2 outTexCoord;

        void main(void) {
          vec4 c = texture2D(uMainSampler, outTexCoord);
          gl_FragColor = vec4(vec3(1.0) - c.rgb, c.a);
        }
      `,
    });
  }
}

/**
 * Ensure the invert pipeline exists (WebGL only).
 * @param {Phaser.Scene} scene
 * @param {string} [key]
 * @returns {string|null} The pipeline key if available, otherwise null (Canvas fallback).
 */
export function ensureInvertPipeline(scene, key = 'fx:invert') {
  const renderer = scene?.game?.renderer;
  if (!renderer) return null;
  if (renderer.type !== Phaser.WEBGL) return null;
  if (typeof renderer.addPipeline !== 'function') return null;

  try {
    const pipelines = renderer.pipelines;
    const has =
      pipelines && (typeof pipelines.has === 'function' ? pipelines.has(key) : typeof pipelines.get === 'function' ? !!pipelines.get(key) : false);
    if (!has) renderer.addPipeline(key, new InvertPipeline(scene.game));
    return key;
  } catch (_) {
    return null;
  }
}


