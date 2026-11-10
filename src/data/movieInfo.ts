import type { MovieMeta, Title } from './types';

/**
 * Fills in movie details from:
 *  1. TMDB (https://developer.themoviedb.org) when VITE_TMDB_TOKEN is set and the title has a tmdbId:
 *     poster, backdrop, overview, tagline, genres, rating, runtime, director, cast with photos.
 *  2. Otherwise Wikipedia's REST summary (no key needed): longer synopsis + poster.
 * Local values in the catalog stay as fallbacks. Never throws.
 */

const TMDB_TOKEN = import.meta.env.VITE_TMDB_TOKEN;
const TMDB_IMG = 'https://image.tmdb.org/t/p/';

const cache = new Map<Title, Promise<void>>();

export function enrichTitle(t: Title): Promise<void> {
  let p = cache.get(t);
  if (!p) {
    p = load(t).catch(() => {});
    cache.set(t, p);
  }
  return p;
}

async function load(t: Title) {
  const m = t.meta;
  if (!m) return;
  if (TMDB_TOKEN && m.tmdbId && (await fromTmdb(t, m, m.tmdbId))) return;
  if (m.wikiTitle) await fromWikipedia(t, m, m.wikiTitle);
}

export function formatRuntime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function https(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

// ---------- TMDB ----------

interface TmdbMovie {
  title?: string;
  overview?: string;
  tagline?: string;
  release_date?: string;
  runtime?: number;
  vote_average?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: { name: string }[];
  credits?: {
    cast?: { name: string; character?: string; profile_path?: string | null }[];
    crew?: { name: string; job: string }[];
  };
  release_dates?: { results?: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
}

async function fromTmdb(t: Title, m: MovieMeta, id: number): Promise<boolean> {
  const res = await fetch(
    `https://api.themoviedb.org/3/movie/${id}?append_to_response=credits,release_dates&language=en-US`,
    { headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: 'application/json' } },
  );
  if (!res.ok) return false;
  const d = (await res.json()) as TmdbMovie;

  if (d.title) t.name = d.title;
  if (d.overview) t.description = d.overview;
  const year = parseInt(d.release_date?.slice(0, 4) ?? '', 10);
  if (year) t.year = year;
  if (d.runtime) t.duration = formatRuntime(d.runtime);
  if (d.poster_path) t.poster = `${TMDB_IMG}w500${d.poster_path}`;
  if (d.backdrop_path) t.backdrop = `${TMDB_IMG}w1280${d.backdrop_path}`;

  if (d.tagline) m.tagline = d.tagline;
  if (d.genres?.length) m.genres = d.genres.map((g) => g.name);
  if (d.vote_average) m.score = Math.round(d.vote_average * 10) / 10;

  const directors = d.credits?.crew?.filter((c) => c.job === 'Director').map((c) => c.name);
  if (directors?.length) m.director = directors.join(', ');

  const cast = d.credits?.cast?.slice(0, 12).map((c) => ({
    name: c.name,
    character: c.character || undefined,
    photo: c.profile_path ? `${TMDB_IMG}w185${c.profile_path}` : undefined,
  }));
  if (cast?.length) m.cast = cast;

  const us = d.release_dates?.results?.find((r) => r.iso_3166_1 === 'US');
  const cert = us?.release_dates.map((r) => r.certification).find(Boolean);
  if (cert) m.certification = cert;

  m.source = 'tmdb';
  return true;
}

// ---------- Wikipedia ----------

interface WikiSummary {
  extract?: string;
  originalimage?: { source: string; width: number; height: number };
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}

async function fromWikipedia(t: Title, m: MovieMeta, page: string) {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`);
  if (!res.ok) return;
  const d = (await res.json()) as WikiSummary;
  if (d.extract) m.about = d.extract;
  m.aboutUrl = https(d.content_urls?.desktop?.page) ?? m.aboutUrl;
  // Drop tracking query params; also lets the image loader detect the file type from the extension.
  const img = https((d.originalimage?.source ?? d.thumbnail?.source)?.split('?')[0]);
  // Film pages' lead image is the theatrical poster (portrait).
  if (img && !t.poster) t.poster = img;
  m.source = 'wikipedia';
}
