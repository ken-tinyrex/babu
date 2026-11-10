import { Application, Assets, type Texture } from 'pixi.js';
import { allTitles, catalog } from './data/catalog';
import { enrichTitle } from './data/movieInfo';
import { Details } from './details/Details';
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

  // Header mascot + movie details for real titles (TMDB / Wikipedia), loaded in parallel.
  // A slow movie API never blocks startup for more than a few seconds.
  const [mascot] = await Promise.all([
    Assets.load<Texture>('/icons/logo.png').catch(() => null),
    Promise.race([
      Promise.all(allTitles(catalog).filter((t) => t.meta).map(enrichTitle)),
      new Promise((r) => setTimeout(r, 3000)),
    ]),
  ]);

  const player = new Player();
  const details = new Details();
  details.onPlay = (item) => void player.open(item);
  const home = new HomeScreen(
    app,
    catalog,
    (item) => void player.open(item),
    (item) => void details.open(item),
    mascot,
  );
  app.stage.addChild(home);

  home.layout();
  app.renderer.on('resize', () => home.layout());
  app.ticker.add((t) => home.update(t.deltaTime));

  // The canvas is fully covered while the player or details page is open; pause it to save battery.
  const syncTicker = () => (player.isOpen || details.isOpen ? app.ticker.stop() : app.ticker.start());
  player.onOpen = player.onClose = syncTicker;
  details.onOpen = details.onClose = syncTicker;

  // Fade out the Babu boot loader once the first frame is on screen.
  requestAnimationFrame(() => hideBootLoader());
}

function hideBootLoader() {
  const el = document.getElementById('boot');
  if (!el) return;
  el.classList.add('is-done');
  setTimeout(() => el.remove(), 400);
}

boot().catch((err) => {
  console.error(err);
  const text = document.querySelector('#boot .loader__text');
  if (text) text.textContent = 'Babu tripped over something. Please refresh.';
});
