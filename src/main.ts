import { Application, Assets, type Texture } from 'pixi.js';
import { allTitles, catalog } from './data/catalog';
import { enrichTitle } from './data/movieInfo';
import { loadUserTitles } from './data/userTitles';
import type { Shelf, Title } from './data/types';
import { Details } from './details/Details';
import { activeSession, loadLibrary, type Library } from './jellyfin/client';
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
  const timeout = <T>(ms: number, fallback: T) => new Promise<T>((r) => setTimeout(() => r(fallback), ms));
  const [mascot, added, library] = await Promise.all([
    Assets.load<Texture>('/icons/logo.png').catch(() => null),
    // Movies added from /upload (Firestore); they already carry full details.
    Promise.race([loadUserTitles(), timeout(4000, [])]),
    // The signed-in user's Jellyfin library (null when signed out or unreachable).
    Promise.race([loadJellyfin(), timeout<Library | null>(8000, null)]),
    Promise.race([
      Promise.all(allTitles(catalog).filter((t) => t.meta).map(enrichTitle)),
      timeout(3000, undefined),
    ]),
  ]);
  if (added.length) catalog.shelves.unshift({ id: 'recent', label: 'Recently Added', items: added });
  if (library) applyLibrary(library);

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

async function loadJellyfin(): Promise<Library | null> {
  const s = await activeSession().catch(() => null);
  if (!s) return null;
  try {
    return await loadLibrary(s);
  } catch (err) {
    console.warn('Jellyfin library unavailable', err);
    return null;
  }
}

/**
 * Puts the Jellyfin library on the homepage: Continue Watching, newest additions and genre rows
 * go first, the newest movie with artwork becomes the hero, and placeholder demo titles are removed.
 */
function applyLibrary(lib: Library) {
  if (!lib.latest.length) return;
  const isDemo = (t: Title) => t.id.startsWith('demo-');
  const rest = catalog.shelves
    .map((s) => ({ ...s, items: s.items.filter((t) => !isDemo(t)) }))
    .filter((s) => s.items.length);
  const jf: Shelf[] = [
    ...(lib.resume.length ? [{ id: 'jf-resume', label: 'Continue Watching', items: lib.resume }] : []),
    { id: 'jf-latest', label: 'New in Your Library', items: lib.latest.slice(0, 30) },
    ...lib.byGenre.map((g) => ({ id: `jf-genre-${g.genre}`, label: g.genre, items: g.items.slice(0, 30) })),
  ];
  catalog.shelves = [...jf, ...rest];
  catalog.featured = lib.resume.find((t) => t.backdrop) ?? lib.latest.find((t) => t.backdrop) ?? catalog.featured;
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
