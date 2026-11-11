import type { Catalog, Title, VideoSource } from './types';

// Public test streams for local development.
const DEMO_HLS: VideoSource = { kind: 'file', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' };
const DEMO_MP4: VideoSource = {
  kind: 'file',
  url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
};

const PALETTE = [0x6c5ce7, 0x00b894, 0xe17055, 0x0984e3, 0xfdcb6e, 0xd63031, 0x00cec9, 0xe84393, 0x2d3436];

const NAMES = [
  'Midnight Harbor', 'Paper Comets', 'The Long Quiet', 'Neon Orchard', 'Saltwater Kings',
  'Glass Mountain', 'After the Rain', 'Static Hearts', 'Wild Signal', 'North of Nowhere',
  'Copper Sky', 'The Last Ferry', 'Velvet Engine', 'Small Gods', 'Ember Road', 'Lantern Street',
];

function demoTitle(i: number): Title {
  return {
    id: `demo-${i}`,
    name: NAMES[i % NAMES.length],
    description: 'Placeholder description. Replace the demo catalog with your own titles.',
    year: 2018 + (i % 8),
    duration: `${1 + (i % 2)}h ${10 + ((i * 7) % 50)}m`,
    color: PALETTE[i % PALETTE.length],
    source: i % 2 === 0 ? DEMO_HLS : DEMO_MP4,
  };
}

const range = (start: number, n: number) => Array.from({ length: n }, (_, i) => demoTitle(start + i));

/**
 * Shown as the hero until real content exists. Movies added on /upload (Firestore)
 * or the Jellyfin library replace it at startup (see main.ts).
 */
const welcome: Title = {
  id: 'demo-welcome',
  name: 'Welcome to Babu',
  description: 'Add movies on the /upload page, or connect Jellyfin there, and they will show up here.',
  color: 0xff4d6d,
  source: DEMO_HLS,
};

export const catalog: Catalog = {
  featured: welcome,
  shelves: [
    { id: 'trending', label: 'Trending Now', items: range(0, 10) },
    { id: 'new', label: 'New Releases', items: range(4, 10) },
    { id: 'continue', label: 'Continue Watching', items: range(9, 6) },
    { id: 'picks', label: 'Top Picks for You', items: range(2, 12) },
  ],
};

/** Every distinct title in the catalog (featured + shelves). */
export function allTitles(c: Catalog): Title[] {
  return [...new Set([c.featured, ...c.shelves.flatMap((s) => s.items)])];
}
