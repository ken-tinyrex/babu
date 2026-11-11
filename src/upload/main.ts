import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { buildTitle, searchMovies, type Candidate } from '../data/lookup';
import { formatRuntime } from '../data/movieInfo';
import type { Title } from '../data/types';
import { deleteTitle, loadUserTitles, saveTitle, slugify, updateTitle } from '../data/userTitles';
import { firebaseApp, OWNER_EMAIL } from '../firebase';
import { connectViewer, loadJellyfinConfig, normalizeServerUrl, probeJellyfin, saveJellyfinUrl, saveJellyfinViewer } from '../data/serverConfig';

// ---------- tiny DOM helpers (all text via textContent: API data is untrusted) ----------

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function loading(text: string): HTMLDivElement {
  const el = h('div', 'loading');
  const img = h('img');
  img.src = '/icons/logo.png';
  img.alt = '';
  el.append(img, h('span', '', text));
  return el;
}

let toastTimer = 0;
function toast(message: string, link?: { href: string; text: string }) {
  const el = $('toast');
  el.replaceChildren(document.createTextNode(message));
  if (link) {
    const a = h('a', '', link.text);
    a.href = link.href;
    el.append(' ', a);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 6000);
}

// ---------- state ----------

const auth = getAuth(firebaseApp);
let user: User | null = null;
let current: Title | null = null;
let videoSeconds: number | null = null;
/** Firestore id of the movie being edited, or null when adding a new one. */
let editingId: string | null = null;
/** ?edit=<id> from the address bar, applied once the movie list has loaded. */
let pendingEditId = new URLSearchParams(location.search).get('edit');
let mineCache: Title[] = [];

const isOwner = () => !!user && user.email === OWNER_EMAIL && user.emailVerified;

const urlInput = $<HTMLInputElement>('video-url');
const titleInput = $<HTMLInputElement>('movie-title');
const yearInput = $<HTMLInputElement>('movie-year');
const findBtn = $<HTMLButtonElement>('find');

// ---------- sign-in ----------

function renderAuth() {
  const box = $('auth');
  const notice = $('signin-notice');
  box.replaceChildren();

  if (!user) {
    box.append(button('Sign in with Google', 'btn btn--ghost btn--small', () => void signIn()));
    notice.textContent = 'Sign in with your Babu account to add movies. You can still search and preview without signing in.';
    notice.hidden = false;
  } else {
    if (user.photoURL) {
      const img = h('img');
      img.src = user.photoURL;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      box.append(img);
    }
    box.append(h('span', 'auth__who', user.email ?? 'Signed in'));
    box.append(button('Sign out', 'btn btn--ghost btn--small', () => void signOut(auth)));
    notice.hidden = isOwner();
    notice.textContent = isOwner() ? '' : `Signed in as ${user.email}. Only ${OWNER_EMAIL} can add movies.`;
  }
  renderPreview();
  void renderMine();
  void renderServer();
}

async function signIn() {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    if (code === 'auth/unauthorized-domain') {
      toast(`This domain (${location.hostname}) isn't authorized for sign-in yet. Add it in Firebase → Authentication → Settings → Authorized domains.`);
    } else if (code === 'auth/operation-not-allowed') {
      toast('Google sign-in is turned off. Enable it in Firebase → Authentication → Sign-in method.');
    } else {
      toast(`Sign-in failed (${code || 'unknown error'}).`);
    }
  }
}

onAuthStateChanged(auth, (u) => {
  user = u;
  renderAuth();
});

// ---------- video URL check ----------

let probeToken = 0;
let probeTimer = 0;

function setVideoStatus(text: string, state: '' | 'ok' | 'bad') {
  const el = $('video-status');
  el.textContent = text;
  el.className = `field__hint${state ? ` is-${state}` : ''}`;
}

function validHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function checkVideo() {
  const url = urlInput.value.trim();
  const token = ++probeToken;
  videoSeconds = null;
  if (!url) return setVideoStatus('A direct link to an .mp4 or .m3u8 file.', '');
  if (!validHttps(url)) return setVideoStatus('The link must start with https://', 'bad');

  const probe = document.createElement('video');
  if (/\.m3u8(\?|$)/i.test(url) && !probe.canPlayType('application/vnd.apple.mpegurl')) {
    return setVideoStatus('HLS stream: it will play through Babu’s HLS player.', 'ok');
  }

  setVideoStatus('Checking the video…', '');
  probe.preload = 'metadata';
  probe.muted = true;
  const done = () => {
    probe.removeAttribute('src');
    probe.load();
  };
  const timeout = window.setTimeout(() => {
    if (token === probeToken) setVideoStatus('Still checking… you can continue; it will be tested when it plays.', '');
    done();
  }, 20000);
  probe.addEventListener('loadedmetadata', () => {
    clearTimeout(timeout);
    if (token !== probeToken) return done();
    videoSeconds = Number.isFinite(probe.duration) ? probe.duration : null;
    const len = !videoSeconds
      ? ''
      : videoSeconds < 60
        ? ` · ${Math.round(videoSeconds)}s`
        : ` · ${formatRuntime(Math.round(videoSeconds / 60))}`;
    setVideoStatus(`✓ Video plays${len}`, 'ok');
    renderPreview();
    done();
  });
  probe.addEventListener('error', () => {
    clearTimeout(timeout);
    if (token !== probeToken) return;
    setVideoStatus('✗ Couldn’t load this video. Is it a direct .mp4/.m3u8 link that’s still online?', 'bad');
    done();
  });
  probe.src = url;
}

urlInput.addEventListener('input', () => {
  clearTimeout(probeTimer);
  probeTimer = window.setTimeout(checkVideo, 600);
  renderPreview();
});

// ---------- search ----------

async function find() {
  const q = titleInput.value.trim();
  if (!q) {
    titleInput.focus();
    return;
  }
  const year = parseInt(yearInput.value, 10) || undefined;
  const results = $('results');
  results.hidden = false;
  results.replaceChildren(loading('Babu is sniffing out your movie…'));
  $('preview').hidden = true;
  findBtn.disabled = true;

  try {
    const found = await searchMovies(q, year);
    results.replaceChildren();
    if (!found.length) {
      results.append(h('p', 'results__empty', 'No films found. Try the exact title, or add the year.'));
      return;
    }
    for (const c of found) results.append(resultCard(c));
  } catch {
    results.replaceChildren(h('p', 'results__empty', 'Search failed. Check your connection and try again.'));
  } finally {
    findBtn.disabled = false;
  }
}

function resultCard(c: Candidate): HTMLButtonElement {
  const b = h('button', 'result');
  b.type = 'button';
  const art = h('div', 'result__art');
  if (c.poster) art.style.backgroundImage = `url(${JSON.stringify(c.poster)})`;
  else art.textContent = c.name.charAt(0);
  const body = h('div', 'result__body');
  body.append(h('div', 'result__name', c.name), h('div', 'result__meta', [c.year, c.blurb].filter(Boolean).join(' · ')));
  b.append(art, body);
  b.addEventListener('click', () => void choose(c));
  return b;
}

async function choose(c: Candidate) {
  const preview = $('preview');
  preview.hidden = false;
  preview.replaceChildren(loading(`Fetching details for ${c.name}…`));
  preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    current = await buildTitle(c, { kind: 'file', url: urlInput.value.trim() });
    renderPreview();
  } catch {
    current = null;
    preview.replaceChildren(h('p', '', 'Couldn’t load the movie details. Try another result.'));
  }
}

findBtn.addEventListener('click', () => void find());
for (const el of [titleInput, yearInput]) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void find();
  });
}

// ---------- preview + save ----------

function input(label: string, value: string, opts: { type?: string; textarea?: boolean } = {}) {
  const wrap = h('label', 'field');
  wrap.append(h('span', 'field__label', label));
  const el = opts.textarea ? h('textarea') : h('input');
  if (el instanceof HTMLInputElement) el.type = opts.type ?? 'text';
  el.value = value;
  wrap.append(el);
  return { wrap, el };
}

function renderPreview() {
  const preview = $('preview');
  if (!current) return;
  const t = current;
  const m = t.meta ?? {};
  if (!t.duration && videoSeconds && videoSeconds >= 60) t.duration = formatRuntime(Math.round(videoSeconds / 60));

  const grid = h('div', 'preview__grid');
  const poster = h('img', 'preview__poster');
  poster.alt = '';
  if (t.poster) poster.src = t.poster;

  const fields = h('div');
  const name = input('Title', t.name);
  const year = input('Year', t.year ? String(t.year) : '', { type: 'number' });
  const duration = input('Runtime', t.duration ?? '');
  const genres = input('Genres (comma separated)', (m.genres ?? []).join(', '));
  const desc = input('Synopsis', t.description, { textarea: true });
  fields.append(name.wrap, year.wrap, duration.wrap, genres.wrap);

  const facts = h('dl', 'preview__facts');
  const factList = [
    ...(m.director ? [{ label: 'Director', value: m.director }] : []),
    ...(m.facts ?? []),
    ...(m.cast?.length ? [{ label: 'Cast', value: m.cast.slice(0, 6).map((c) => c.name).join(', ') + (m.cast.length > 6 ? '…' : '') }] : []),
    { label: 'Source', value: m.source === 'tmdb' ? 'TMDB' : 'Wikipedia' },
  ];
  for (const f of factList) facts.append(h('dt', '', f.label), h('dd', '', f.value));
  fields.append(facts);

  grid.append(poster, fields);

  const url = urlInput.value.trim();
  const canSave = isOwner() && validHttps(url);
  const add = button(editingId ? 'Save changes' : 'Add to Babu', 'btn btn--primary', () => void save());
  add.disabled = !canSave;
  const hint = !isOwner()
    ? `Sign in as ${OWNER_EMAIL} to ${editingId ? 'edit' : 'add'}.`
    : !validHttps(url)
      ? 'Paste the video URL above first.'
      : '';

  const actions = h('div', 'preview__actions');
  actions.append(add);
  if (editingId) actions.append(button('Cancel', 'btn btn--ghost', () => stopEdit()));
  if (hint) actions.append(h('span', 'field__hint', hint));

  preview.hidden = false;
  preview.replaceChildren(h('h2', '', editingId ? 'Edit details' : 'Preview'), grid, desc.wrap, actions);

  // Keep edits when the preview re-renders (e.g. after sign-in or the video check).
  const sync = () => {
    t.name = name.el.value.trim() || t.name;
    t.year = parseInt(year.el.value, 10) || undefined;
    t.duration = duration.el.value.trim() || undefined;
    t.description = desc.el.value.trim();
    const g = genres.el.value.split(',').map((x) => x.trim()).filter(Boolean);
    t.meta = { ...m, genres: g.length ? g : undefined };
  };
  for (const el of [name.el, year.el, duration.el, genres.el, desc.el]) el.addEventListener('input', sync);
}

async function save() {
  if (!current || !user || !isOwner()) return;
  const url = urlInput.value.trim();
  if (!validHttps(url)) return;
  const t: Title = { ...current, source: { kind: 'file', url } };
  const editing = editingId;
  // Edits keep the original document id even if the title changes.
  t.id = editing ?? slugify(t.name, t.year);
  const add = $('preview').querySelector<HTMLButtonElement>('.btn--primary');
  const label = add?.textContent ?? '';
  if (add) {
    add.disabled = true;
    add.textContent = editing ? 'Saving…' : 'Adding…';
  }
  try {
    if (editing) {
      await updateTitle(t);
      toast(`Saved changes to ${t.name}.`, { href: '/', text: 'Open Babu →' });
    } else {
      await saveTitle(t, user.email ?? OWNER_EMAIL);
      toast(`${t.name} was added to Babu.`, { href: '/', text: 'Open Babu →' });
    }
    resetForm();
    await renderMine();
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    toast(
      code === 'permission-denied'
        ? 'Not allowed: this account can’t change movies.'
        : code === 'not-found'
          ? 'That movie no longer exists (it may have been deleted).'
          : 'Saving failed. Try again.',
    );
    if (add) {
      add.disabled = false;
      add.textContent = label;
    }
  }
}

// ---------- edit mode ----------

const heading = document.querySelector('h1')!;
const lead = document.querySelector('.lead')!;

function resetForm() {
  current = null;
  editingId = null;
  $('preview').hidden = true;
  $('results').hidden = true;
  urlInput.value = '';
  titleInput.value = '';
  yearInput.value = '';
  videoSeconds = null;
  setVideoStatus('A direct link to an .mp4 or .m3u8 file.', '');
  heading.textContent = 'Add a movie';
  lead.textContent = 'Paste a video link and the movie’s title. Babu finds the details and puts it on the homepage.';
  history.replaceState(null, '', location.pathname);
  highlightEditing();
}

function startEdit(t: Title) {
  editingId = t.id;
  current = structuredClone(t);
  urlInput.value = t.source.kind === 'jellyfin' ? '' : t.source.url;
  titleInput.value = t.name;
  yearInput.value = t.year ? String(t.year) : '';
  $('results').hidden = true;
  heading.textContent = `Edit “${t.name}”`;
  lead.textContent = 'Change the video URL or details, then Save changes. To re-match the film, use Find movie.';
  history.replaceState(null, '', `${location.pathname}?edit=${encodeURIComponent(t.id)}`);
  checkVideo();
  renderPreview();
  highlightEditing();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function stopEdit() {
  resetForm();
}

function highlightEditing() {
  for (const li of $('mine').querySelectorAll<HTMLLIElement>('li')) {
    li.classList.toggle('is-editing', li.dataset.id === editingId);
  }
}

// ---------- added movies ----------

async function renderMine() {
  const titles = await loadUserTitles();
  mineCache = titles;
  const card = $('mine-card');
  const list = $('mine');
  card.hidden = titles.length === 0;
  list.replaceChildren();
  for (const t of titles) {
    const li = h('li');
    if (t.poster) {
      const img = h('img');
      img.src = t.poster;
      img.alt = '';
      img.loading = 'lazy';
      li.append(img);
    } else {
      li.append(h('div', 'mine__ph'));
    }
    const text = h('div', 'mine__text');
    text.append(h('div', 'mine__name', t.name), h('div', 'mine__meta', [t.year, t.duration].filter(Boolean).join(' · ')));
    li.append(text);
    li.dataset.id = t.id;
    if (isOwner()) {
      li.append(button('Edit', 'btn btn--ghost btn--small', () => startEdit(t)));
      li.append(
        button('Delete', 'btn btn--danger btn--small', async () => {
          if (!confirm(`Remove “${t.name}” from Babu?`)) return;
          try {
            await deleteTitle(t.id);
            if (editingId === t.id) resetForm();
            toast(`${t.name} was removed.`);
            await renderMine();
          } catch {
            toast('Couldn’t remove it. Try again.');
          }
        }),
      );
    }
    list.append(li);
  }
  highlightEditing();

  // Open /upload?edit=<id> once we know who's signed in and the movie exists.
  if (pendingEditId && isOwner()) {
    const target = mineCache.find((t) => t.id === pendingEditId);
    pendingEditId = null;
    if (target) startEdit(target);
    else toast('That movie wasn’t found. It may have been deleted.');
  }
}

// ---------- Jellyfin server link ----------

const serverInput = $<HTMLInputElement>('server-url');
const serverSave = $<HTMLButtonElement>('server-save');
/** Link handed over by `npm run tunnel` as /upload#jellyfin=<url>; saved automatically once signed in. */
let pendingServer = (() => {
  const v = new URLSearchParams(location.hash.slice(1)).get('jellyfin');
  return v ? normalizeServerUrl(v) : null;
})();
if (pendingServer) serverInput.value = pendingServer;

function setServerStatus(text: string, state: '' | 'ok' | 'bad') {
  const el = $('server-status');
  el.textContent = text;
  el.className = `field__hint${state ? ` is-${state}` : ''}`;
}

async function renderServer() {
  const cur = $('server-current');
  const cfg = await loadJellyfinConfig();
  if (!cfg) {
    cur.textContent = 'No server link saved yet.';
  } else {
    cur.textContent = `Current: ${cfg.url}${cfg.updatedAt ? ` · updated ${cfg.updatedAt.toLocaleString()}` : ''} · checking…`;
    const probe = await probeJellyfin(cfg.url);
    cur.textContent = `Current: ${cfg.url} · ${probe.ok ? `✓ online (${probe.name}, Jellyfin ${probe.version})` : `✗ ${probe.reason}`}`;
    cur.className = `field__hint server__current ${probe.ok ? 'is-ok' : 'is-bad'}`;
  }
  serverSave.disabled = !isOwner();
  viewerSave.disabled = !isOwner() || !cfg;
  if (!isOwner()) setServerStatus(`Sign in as ${OWNER_EMAIL} to change the link.`, '');
  const vc = $('viewer-current');
  vc.textContent = cfg?.viewer
    ? `Babu signs in as “${cfg.viewer.userName}”.`
    : 'No viewer account yet. Visitors won’t see your Jellyfin library until you connect one.';
  vc.className = `field__hint server__current ${cfg?.viewer ? 'is-ok' : ''}`;
  if (!cfg) setViewerStatus('Save a server link first.', '');
  else if (!isOwner()) setViewerStatus(`Sign in as ${OWNER_EMAIL} to change it.`, '');
  if (pendingServer && isOwner()) {
    const url = pendingServer;
    pendingServer = null;
    history.replaceState(null, '', location.pathname + location.search);
    await saveServer(url);
  }
}

async function saveServer(raw: string) {
  const url = normalizeServerUrl(raw);
  if (!url) return setServerStatus('Enter an https:// link.', 'bad');
  serverSave.disabled = true;
  setServerStatus('Checking that Jellyfin answers at this link…', '');
  const probe = await probeJellyfin(url, 12000);
  if (!probe.ok) {
    serverSave.disabled = false;
    return setServerStatus(`✗ ${probe.reason}. Not saved.`, 'bad');
  }
  try {
    await saveJellyfinUrl(url);
    serverInput.value = '';
    setServerStatus(`✓ Saved. Babu now uses ${url} (${probe.name}).`, 'ok');
    toast('Jellyfin link updated on the live site.');
    await renderServer();
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    setServerStatus(code === 'permission-denied' ? 'Not allowed: the database rule for this setting isn’t deployed yet, or this account can’t change it.' : 'Saving failed. Try again.', 'bad');
  } finally {
    serverSave.disabled = !isOwner();
  }
}

serverSave.addEventListener('click', () => void saveServer(serverInput.value));
serverInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void saveServer(serverInput.value);
});

// ---------- Jellyfin viewer account ----------

const viewerUser = $<HTMLInputElement>('viewer-user');
const viewerPass = $<HTMLInputElement>('viewer-pass');
const viewerSave = $<HTMLButtonElement>('viewer-save');

function setViewerStatus(text: string, state: '' | 'ok' | 'bad') {
  const el = $('viewer-status');
  el.textContent = text;
  el.className = `field__hint${state ? ` is-${state}` : ''}`;
}

async function saveViewer() {
  const cfg = await loadJellyfinConfig();
  if (!cfg) return setViewerStatus('Save a server link first.', 'bad');
  const username = viewerUser.value.trim();
  if (!username) return viewerUser.focus();
  viewerSave.disabled = true;
  setViewerStatus('Signing in to Jellyfin…', '');
  try {
    const { viewer, canDelete } = await connectViewer(cfg.url, username, viewerPass.value);
    await saveJellyfinViewer(viewer);
    viewerPass.value = '';
    setViewerStatus(
      canDelete
        ? `✓ Connected as “${viewer.userName}”. Tip: turn off “Allow media deletion” for this user in Jellyfin.`
        : `✓ Connected as “${viewer.userName}”. Visitors now see your library without signing in.`,
      'ok',
    );
    toast('Jellyfin viewer account saved.');
    await renderServer();
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    setViewerStatus(
      code === 'permission-denied'
        ? 'Not allowed: deploy the babu_config database rule (pos-sytem) first.'
        : (err as Error).message || 'Couldn’t connect.',
      'bad',
    );
  } finally {
    viewerSave.disabled = !isOwner();
  }
}

viewerSave.addEventListener('click', () => void saveViewer());
viewerPass.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void saveViewer();
});
