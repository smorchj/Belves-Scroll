import * as THREE from 'three';
import { Game } from './game/Game.js';

const canvas = document.getElementById('viewport');
const boot = document.getElementById('boot');
const bootFill = boot.querySelector('.boot-fill');
const bootStatus = boot.querySelector('.boot-status');

function status(text, pct) {
  bootStatus.textContent = text;
  if (pct !== undefined) bootFill.style.width = `${Math.round(pct * 100)}%`;
}

// ?skip=1 jumps straight into the valley with the default body — the recipe
// JSONs are ~5MB each and take a few seconds to parse, which gets tiresome when
// you are reloading to test something else.
const params = new URLSearchParams(location.search);
const skipCreator = params.has('skip');

async function main() {
  const game = new Game(canvas, status);

  let build = null;
  if (!skipCreator) {
    status('shaping a traveller…', 0.02);
    // The creator needs a live renderer, so the stage is stood up first and the
    // rest of the world is built once a body has been chosen.
    const { Stage } = await import('./render/Renderer.js');
    const stage = new Stage(canvas);
    game.stage = stage;

    const { Creator } = await import('./character/Creator.js');
    const creator = new Creator(stage);
    window.__creator = creator;   // probed by the automated checks
    boot.classList.add('gone');
    build = await creator.open();
    boot.classList.remove('gone');
  }

  await game.boot(build);

  setTimeout(() => boot.classList.add('gone'), 400);

  // Exposed for probing from the console and automated checks.
  window.__game = game;
  window.__THREE = THREE;

  const clock = new THREE.Clock();
  let frames = 0, fpsTime = 0;
  game.fps = 0;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    try {
      game.update(dt);
      game.render();
    } catch (err) {
      // One bad frame shouldn't kill the loop and leave a frozen canvas.
      console.error('frame error', err);
    }

    frames++; fpsTime += dt;
    if (fpsTime >= 1) { game.fps = frames / fpsTime; frames = 0; fpsTime = 0; }
  }
  frame();
}

main().catch((err) => {
  console.error(err);
  status(`failed: ${err.message}`);
});
