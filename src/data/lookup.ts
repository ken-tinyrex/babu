/**
 * Find a movie by title and build a full Title from the movie databases.
 * - With VITE_TMDB_TOKEN: TMDB search + details (posters, backdrops, cast photos, rating).
 * - Without: Wikipedia search + the film article's infobox and Cast section (no key needed).
 */
import { formatRuntime, fromTmdb, hasTmdb } from './movieInfo';
import type { CastMember, Fact, MovieMeta, Title, VideoSource } from './types';
import { colorFor, slugify } from './userTitles';

export interface Candidate {
  source: 'tmdb' | 'wikipedia';
  /** TMDB id or Wikipedia page title. */
  ref: number | string;
  name: string;
  year?: number;
  poster?: string;
  blurb?: string;
}

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const TMDB_IMG = 'https://image.tmdb.org/t/p/';

export async function searchMovies(q: string, year?: number): Promise<Candidate[]> {
  q = q.trim();
  if (!q) return [];
  if (hasTmdb) {
    const r = await searchTmdb(q, year).catch(() => []);
    if (r.length) return r;
  }
  return searchWikipedia(q, year);
}

export async function buildTitle(c: Candidate, source: VideoSource): Promise<Title> {
  const t: Title = {
    id: slugify(c.name, c.year),
    name: c.name,
    description: c.blurb ?? '',
    year: c.year,
    color: colorFor(c.name),
    poster: c.poster,
    source,
    meta: {},
  };
  const m = t.meta!;
  if (c.source === 'tmdb') {
    m.tmdbId = c.ref as number;
    await fromTmdb(t, m, m.tmdbId);
  } else {
    m.wikiTitle = c.ref as string;
    await fillFromWikipedia(t, m, m.wikiTitle);
  }
  t.id = slugify(t.name, t.year);
  return t;
}

// ---------- TMDB ----------

interface TmdbSearch {
  results?: { id: number; title: string; release_date?: string; poster_path?: string | null; overview?: string }[];
}

async function searchTmdb(q: string, year?: number): Promise<Candidate[]> {
  const params = new URLSearchParams({ query: q, include_adult: 'false', language: 'en-US' });
  if (year) params.set('year', String(year));
  const res = await fetch(`https://api.themoviedb.org/3/search/movie?${params}`, {
    headers: { Authorization: `Bearer ${import.meta.env.VITE_TMDB_TOKEN}`, accept: 'application/json' },
  });
  if (!res.ok) return [];
  const d = (await res.json()) as TmdbSearch;
  return (d.results ?? []).slice(0, 8).map((r) => ({
    source: 'tmdb' as const,
    ref: r.id,
    name: r.title,
    year: parseInt(r.release_date?.slice(0, 4) ?? '', 10) || undefined,
    poster: r.poster_path ? `${TMDB_IMG}w342${r.poster_path}` : undefined,
    blurb: r.overview || undefined,
  }));
}

// ---------- Wikipedia ----------

interface WikiSummary {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  originalimage?: { source: string };
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}

const wikiJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  return (await res.json()) as T;
};

const summary = (page: string) => wikiJson<WikiSummary>(WIKI_REST + encodeURIComponent(page.replace(/ /g, '_')));

const cleanImg = (url?: string) => url?.split('?')[0];

async function searchWikipedia(q: string, year?: number): Promise<Candidate[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: `${q} ${year ?? ''} film`.replace(/\s+/g, ' '),
    srlimit: '10',
    format: 'json',
    origin: '*',
  });
  const d = await wikiJson<{ query?: { search?: { title: string }[] } }>(`${WIKI_API}?${params}`);
  const titles = (d.query?.search ?? []).map((r) => r.title);
  const sums = await Promise.all(titles.map((t) => summary(t).catch(() => null)));
  const out: Candidate[] = [];
  sums.forEach((s, i) => {
    if (!s || s.type === 'disambiguation') return;
    const desc = s.description ?? '';
    // "2010 film by Christopher Nolan", "2006 Japanese anime film" — but not "film score by…", "film producer".
    const isFilm = /\b(film|movie)(\s+(by|directed by|from)\s+[^,]+)?$/i.test(desc) || /\((\d{4} )?film\)$/.test(titles[i]);
    if (!isFilm) return;
    const y = parseInt(desc.match(/\b(18|19|20)\d{2}\b/)?.[0] ?? titles[i].match(/\((\d{4}) film\)/)?.[1] ?? '', 10) || undefined;
    if (year && y && Math.abs(y - year) > 1) return;
    out.push({
      source: 'wikipedia',
      ref: titles[i],
      name: titles[i].replace(/\s*\((\d{4} )?(American |British )?film\)$/i, ''),
      year: y,
      poster: cleanImg(s.thumbnail?.source),
      blurb: desc,
    });
  });
  return out.slice(0, 8);
}

async function fillFromWikipedia(t: Title, m: MovieMeta, page: string) {
  const [s, wt] = await Promise.all([
    summary(page),
    wikiJson<{ parse?: { wikitext?: { '*': string } } }>(
      `${WIKI_API}?${new URLSearchParams({ action: 'parse', page, prop: 'wikitext', format: 'json', origin: '*', redirects: '1' })}`,
    ).then((r) => r.parse?.wikitext?.['*'] ?? ''),
  ]);

  const extract = s.extract ?? '';
  m.about = extract || undefined;
  m.aboutUrl = s.content_urls?.desktop?.page;
  m.source = 'wikipedia';
  t.poster = cleanImg(s.originalimage?.source ?? s.thumbnail?.source) ?? t.poster;
  t.description = shortSynopsis(extract) || t.description;

  const box = infobox(wt);
  const field = (...keys: string[]) => keys.map((k) => box[k]).find(Boolean);

  const year = field('released')?.match(/\b(18|19|20)\d{2}\b/)?.[0];
  if (year) t.year = parseInt(year, 10);
  const runtime = parseInt(field('runtime')?.match(/(\d+)\s*min/)?.[1] ?? '', 10);
  if (runtime) t.duration = formatRuntime(runtime);

  const genres = genresFrom(extract);
  if (genres.length) m.genres = genres;

  const list = (k: string[]) => listify(field(...k) ?? '');
  const director = list(['director']).join(', ');
  if (director) m.director = director;

  const facts: Fact[] = [];
  const add = (label: string, keys: string[]) => {
    const v = list(keys).join(', ');
    if (v) facts.push({ label, value: v });
  };
  add('Written by', ['screenplay', 'writer']);
  add('Based on', ['based_on']);
  add('Music', ['music']);
  add('Cinematography', ['cinematography']);
  add('Editing', ['editing']);
  if (facts.length) m.facts = facts;

  const cast = castFrom(wt);
  m.cast = cast.length ? cast : list(['starring']).slice(0, 12).map((name) => ({ name }));
}

/**
 * ~2 sentences of plot from the summary: skips the opening "X is a 2026 film…" sentence
 * and cast-list sentences ("It stars A, B, C, D…") when there's something better.
 */
function shortSynopsis(extract: string): string {
  const sentences = extract.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((x) => x.trim()) ?? [];
  const isCastList = (sn: string) => /\bstars?\b|\bcast\b/i.test(sn) && (sn.match(/,/g)?.length ?? 0) >= 3;
  let rest = sentences.length > 2 ? sentences.slice(1) : sentences;
  const plot = rest.filter((sn) => !isCastList(sn));
  if (plot.length) rest = plot;
  let out = '';
  for (const sn of rest) {
    if ((out + ' ' + sn).length > 320 && out) break;
    out = out ? `${out} ${sn}` : sn;
  }
  return out;
}

const NATIONALITIES =
  /^(american|british|english|scottish|irish|welsh|canadian|australian|french|german|italian|spanish|japanese|korean|south|chinese|indian|mexican|filipino|independent|\d{4}|[a-z]+-(american|british|french|canadian))$/i;

/** Multi-word genres kept together when splitting "2019 South Korean black comedy thriller film". */
const COMPOUND_GENRES = ['science fiction', 'black comedy', 'dark comedy', 'romantic comedy', 'film noir', 'martial arts', 'coming of age'];

function genresFrom(extract: string): string[] {
  const m = extract.match(/\bis an? ([\w\s'-]+?) film\b/i);
  if (!m) return [];
  let phrase = m[1].toLowerCase();
  for (const g of COMPOUND_GENRES) phrase = phrase.replace(g, g.replace(/ /g, '_'));
  return phrase
    .split(/\s+/)
    .map((w) => w.replace(/_/g, ' '))
    .filter((w) => w.length > 2 && !NATIONALITIES.test(w))
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
}

// ---------- Wikitext helpers ----------

function stripMarkup(s: string): string {
  let out = s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  // Unwrap simple templates like {{nowrap|X}}, {{ill|X|...}}; drop the rest (refs, efn, ...).
  for (let i = 0; i < 5; i++) {
    out = out.replace(/\{\{\s*(?:nowrap|nobr|small|ill|lang\|[a-z-]+)\s*\|([^{}|]*)[^{}]*\}\}/gi, '$1');
    out = out.replace(/\{\{\s*(?:plain ?list|ubl|unbulleted list|flatlist|hlist)\s*\|([^{}]*)\}\}/gi, (_m, inner: string) =>
      inner.includes('*') ? inner : inner.split('|').map((x) => `* ${x}`).join('\n'),
    );
    out = out.replace(/\{\{[^{}]*\}\}/g, '');
  }
  return out;
}

function listify(value: string): string[] {
  const v = stripMarkup(value);
  const items = v.includes('*') ? v.split('\n').filter((l) => l.trim().startsWith('*')) : v.split(/\n|,(?![^(]*\))/);
  return items
    .map((x) => x.replace(/^\s*\*+\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((x) => x && x.length < 120);
}

/** `| key = value` pairs of the first {{Infobox film ...}}. */
function infobox(wt: string): Record<string, string> {
  const start = wt.search(/\{\{\s*Infobox film/i);
  if (start < 0) return {};
  let depth = 0;
  let end = start;
  for (let i = start; i < wt.length - 1; i++) {
    if (wt[i] === '{' && wt[i + 1] === '{') { depth++; i++; }
    else if (wt[i] === '}' && wt[i + 1] === '}') { depth--; i++; if (depth === 0) { end = i; break; } }
  }
  const body = wt.slice(start, end);
  const out: Record<string, string> = {};
  const re = /\n\s*\|\s*([a-z_ ]+?)\s*=([\s\S]*?)(?=\n\s*\|\s*[a-z_ ]+?\s*=|$)/gi;
  for (const m of body.matchAll(re)) out[m[1].toLowerCase().replace(/ /g, '_')] = m[2].trim();
  return out;
}

/** "* Matt Damon as Odysseus, the king..." lines from the Cast section. */
function castFrom(wt: string): CastMember[] {
  const sec = wt.match(/\n==\s*Cast\s*==([\s\S]*?)(?=\n==[^=])/i)?.[1] ?? '';
  const out: CastMember[] = [];
  for (const raw of sec.split('\n')) {
    if (!/^\*[^*]/.test(raw)) continue;
    const line = stripMarkup(raw).replace(/^\*\s*/, '').trim();
    const m = line.match(/^(.+?)\s+(?:as\s+(.+)|in an? .*role.*)$/i);
    const name = (m?.[1] ?? line.split(/[,–—(]/)[0]).trim();
    if (!name || name.length > 60) continue;
    const role = m?.[2]
      ?.split(/,|;|\s\(|:\s|\.\s/)[0]
      .replace(/^(the|a|an)\s+/i, (x) => (/^the$/i.test(x.trim()) ? x : x))
      .trim();
    out.push({ name, character: role && role.length <= 60 ? role : undefined });
    if (out.length >= 15) break;
  }
  return out;
}
