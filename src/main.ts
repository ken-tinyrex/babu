import { Application } from 'pixi.js';
import './style.css';
import { catalog } from './data/catalog';
import { Player } from './player/Player';
import { theme } from './theme';
import { HomeScreen } from './ui/HomeScreen';

async function boot() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: theme.bg,
    antialias: true,
    autoDensity: true,
    // Cap at 2x: 3x phones gain little visually and cost a lot of fill-rate.
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  document.getElementById('app')!.appendChild(app.canvas);

  const player = new Player();
  const home = new HomeScreen(app, catalog, (item) => void player.open(item));
  app.stage.addChild(home);

  home.layout();
  app.renderer.on('resize', () => home.layout());
  app.ticker.add((t) => home.update(t.deltaTime));

  // Nothing animates behind the player; save battery while it's open.
  player.onOpen = () => app.ticker.stop();
  player.onClose = () => app.ticker.start();
}

void boot();
