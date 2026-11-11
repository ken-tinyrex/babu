import { Application, Assets, type Texture } from 'pixi.js';
import { allTitles, catalog } from './data/catalog';
import { enrichTitle } from './data/movieInfo';
import { loadUserTitles } from './data/userTitles';
import type { Catalog, Shelf, Title } from './data/types';
import { Details } from './details/Details';
import { activeSession, loadLibrary, type Library, type ViewContent } from './jellyfin/client';
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
  if (added.length) {
    catalog.shelves.unshift({ id: 'recent', label: 'Recently Added', items: added });
    catalog.featured = added.find((t) => t.poster || t.backdrop) ?? added[0];
  }
  const tabs = buildTabs(library);
  const slugs = tabs.map((t) => slug(t.label));
  const tabFromHash = () => Math.max(0, slugs.indexOf(location.hash.slice(1)));

  const player = new Player();
  const details = new Details();
  details.onPlay = (item) => void player.open(item);
  const home = new HomeScreen(
    app,
    tabs,
    (item) => void player.open(item),
    (item) => void details.open(item),
    mascot,
    tabFromHash(),
    (i) => history.pushState(null, '', i === 0 ? location.pathname : `#${slugs[i]}`),
  );
  // Back/forward buttons switch tabs too.
  window.addEventListener('popstate', () => home.selectTab(tabFromHash(), false));
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

const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const shelf = (id: string, label: string, items: Title[]): Shelf[] =>
  items.length ? [{ id, label, items: items.slice(0, 30) }] : [];

const heroOf = (...lists: Title[][]) => lists.flat().find((t) => t.backdrop) ?? lists.flat().find((t) => t.poster);

/** Rows for one Jellyfin library tab (Anime, Kids, Movies, TV Shows…). */
function libraryCatalog(v: ViewContent): Catalog {
  const shows = v.view.type === 'tvshows';
  const shelves: Shelf[] = [
    ...shelf(`${v.view.id}-resume`, 'Continue Watching', v.resume),
    ...shelf(`${v.view.id}-next`, 'Next Up', v.nextUp),
    ...shelf(`${v.view.id}-latest`, shows ? 'Recently Added Shows' : 'Recently Added', v.latest),
    ...v.byGenre.map((g) => ({ id: `${v.view.id}-g-${g.genre}`, label: g.genre, items: g.items.slice(0, 30) })),
  ];
  const featured =
    heroOf(v.resume, v.latest) ??
    ({
      id: `demo-empty-${v.view.id}`,
      name: v.view.name,
      description: `Nothing in ${v.view.name} yet. Add some in Jellyfin and it will show up here.`,
      color: 0x3f6b52,
      source: { kind: 'file', url: '' },
    } satisfies Title);
  return { featured, shelves };
}

/**
 * Tabs: Home (everything) + one per Jellyfin library, in Jellyfin's order.
 * Without Jellyfin, just Home with the /upload movies and demo rows.
 */
function buildTabs(lib: Library | null): { label: string; catalog: Catalog }[] {
  if (!lib?.views.length) return [{ label: 'Home', catalog }];

  const isDemo = (t: Title) => t.id.startsWith('demo-');
  const uploaded = catalog.shelves
    .map((s) => ({ ...s, items: s.items.filter((t) => !isDemo(t)) }))
    .filter((s) => s.items.length);
  const allResume = lib.views.flatMap((v) => v.resume);
  const allNext = lib.views.flatMap((v) => v.nextUp);
  const home: Catalog = {
    featured: heroOf(allResume, ...lib.views.map((v) => v.latest)) ?? catalog.featured,
    shelves: [
      ...shelf('home-resume', 'Continue Watching', allResume),
      ...shelf('home-next', 'Next Up', allNext),
      ...lib.views.flatMap((v) => shelf(`home-${v.view.id}`, `New in ${v.view.name}`, v.latest)),
      ...uploaded,
    ],
  };
  return [{ label: 'Home', catalog: home }, ...lib.views.map((v) => ({ label: v.view.name, catalog: libraryCatalog(v) }))];
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
