/**
 * Where a title's video comes from.
 * - file:  a direct stream URL (.mp4 or HLS .m3u8), played in Babu's own <video> player.
 * - embed: a third-party player page, shown in an iframe (use only when no direct URL exists).
 */
export type VideoSource = { kind: 'file'; url: string } | { kind: 'embed'; url: string };

export interface CastMember {
  name: string;
  character?: string;
  photo?: string;
}

export interface Fact {
  label: string;
  value: string;
}

/** Extra movie details, filled locally and/or from TMDB / Wikipedia (see movieInfo.ts). */
export interface MovieMeta {
  /** themoviedb.org id, used when VITE_TMDB_TOKEN is set. */
  tmdbId?: number;
  /** Wikipedia page title, used for synopsis + poster without an API key. */
  wikiTitle?: string;
  tagline?: string;
  genres?: string[];
  certification?: string;
  /** TMDB user score, 0–10. */
  score?: number;
  director?: string;
  cast?: CastMember[];
  facts?: Fact[];
  /** Longer encyclopedia summary (Wikipedia). */
  about?: string;
  aboutUrl?: string;
  /** Which remote source filled in the details, for attribution. */
  source?: 'tmdb' | 'wikipedia';
}

export interface Title {
  id: string;
  name: string;
  description: string;
  year?: number;
  duration?: string;
  /** Placeholder color, used until (or instead of) artwork. */
  color: number;
  /** Portrait artwork (2:3). */
  poster?: string;
  /** Landscape artwork (16:9). */
  backdrop?: string;
  meta?: MovieMeta;
  source: VideoSource;
}

export interface Shelf {
  id: string;
  label: string;
  items: Title[];
}

export interface Catalog {
  featured: Title;
  shelves: Shelf[];
}
