/**
 * Where a title's video comes from.
 * - file:  a direct stream URL (.mp4 or HLS .m3u8), played in Babu's own <video> player.
 * - embed: a third-party player page, shown in an iframe (use only when no direct URL exists).
 */
export type VideoSource = { kind: 'file'; url: string } | { kind: 'embed'; url: string };

export interface Title {
  id: string;
  name: string;
  description: string;
  year?: number;
  duration?: string;
  /** Placeholder poster color, used until (or instead of) a thumbnail. */
  color: number;
  thumbnail?: string;
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
