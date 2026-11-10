import type { Catalog, Title, VideoSource } from './types';

/**
 * Direct stream URLs (.mp4 or .m3u8) for the real titles below.
 * See README "Adding your own video" for how to find one.
 *
 * Used only in local dev (`npm run dev`). Production builds (Firebase) play the demo
 * stream instead, and these strings are stripped from the bundle, so unlicensed copies
 * never ship on the public site. Swap in licensed URLs before removing the DEV check.
 */
const TREE_OF_LIFE_URL =
  'https://odd-silence-e10a.leland7a32f.workers.dev/z9HR0x7HM6Lb592ZDUd7NS5e8z92Np9y8r15b5w6S8_ZXs2d7z9XJo8x7a40c6Na4p90NDEd7NTp93ODx70Jm6Nb5Y0o8d7PTE0Nr14c6OS4b5NDt3f9Mq0Mb5Jm6Bb5PTEd7Jm6Nb5Y0Fm6PUNIUp99NRSZb5z9m6l59NDMn7y8XM9MTt31Lq0Ib5Nr141NS4c6NSZ0v5XBo8PTMn7x72o8m6PUJm6SFJCSo8FPTo8RZJn7N0PTAn7w6XJh1x7a405NS4c6Nq0Mf9Ma4Uf9Nq0Qn7Y2c6k4ZW50VHo8d7ZT0d7Jm6k4a4PTQa4Jn7o8p9PTQa4MDx7c6Mq0Q0OTE4Jm6Jj3x7q004/MTx75NDMb5Na4x75Nd7/6202_rebmevoN_01-%5BANONMP4.TO%5D.mp4';
const ODYSSEY_URL =
  'https://odd-silence-e10a.leland7a32f.workers.dev/z9HR0x7HM6Lb592ZDY2Nb55e8z92Np9y8r15b5w6S8_ZXs2d7z9XJo8x7a40c6Na4p90NDEa4NTx70OTYd7Jm6Nb5Y0o8d7PTE0Nr14c6OS4b5NDt3f9Mq0Mb5Jm6Bb5PTEd7Jm6Nb5Y0Fm6PUNIUp99NRSZb5z9m6l59NDMn7y8XM9MTx74Lq0Ia4Nb54b5Mb54c6OCZ0v5XBo8PTQn7x72o8m6PWJ4v5Xw6e8Ua4x72Nq0Vi2Jn7N0PTI3Jm6Vb5y8HM9MTx72Lq0Ec6Mr14c6Na4If9MCZq0y8Go8o8y8m6RUv5XBo8PTAn7v5m6M9NDMn7z9WQ9Mq0A1Nq0Yd7NTE2NTQc6NTEn7x7n7k4b5PTt3/MTx75NDMa4MDx73NA/6202_rebmevoN_01-%5BANONMP4.TO%5D.mp4';

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
 * Local details are the fallback; movieInfo.ts layers TMDB (with a token) or
 * Wikipedia (synopsis + poster, no key) on top at startup.
 */
const treeOfLife: Title = {
  id: 'the-tree-of-life',
  name: 'The Tree of Life',
  description:
    'In 1950s Texas, a boy grows up between a stern father and a gentle mother. Decades later, the grown son searches those memories for meaning, set against the birth of the universe itself.',
  year: 2011,
  duration: '2h 19m',
  color: 0x3f6b52,
  source: import.meta.env.DEV ? { kind: 'file', url: TREE_OF_LIFE_URL } : DEMO_HLS,
  meta: {
    tmdbId: 8967,
    wikiTitle: 'The_Tree_of_Life_(film)',
    genres: ['Drama'],
    certification: 'PG-13',
    director: 'Terrence Malick',
    cast: [
      { name: 'Brad Pitt', character: 'Mr. O’Brien' },
      { name: 'Jessica Chastain', character: 'Mrs. O’Brien' },
      { name: 'Sean Penn', character: 'Jack' },
      { name: 'Hunter McCracken', character: 'Young Jack' },
      { name: 'Laramie Eppler', character: 'R.L.' },
      { name: 'Tye Sheridan', character: 'Steve' },
    ],
    facts: [
      { label: 'Written by', value: 'Terrence Malick' },
      { label: 'Music', value: 'Alexandre Desplat' },
      { label: 'Cinematography', value: 'Emmanuel Lubezki' },
      { label: 'Awards', value: 'Palme d’Or (Cannes 2011) · 3 Academy Award nominations' },
    ],
  },
};

const odyssey: Title = {
  id: 'the-odyssey-2026',
  name: 'The Odyssey',
  description:
    'Ten years after the fall of Troy, Odysseus, king of Ithaca, fights his way home across monster-haunted seas, while his wife Penelope and son Telemachus hold off the suitors circling his throne.',
  year: 2026,
  duration: '2h 53m',
  color: 0x1d3557,
  source: import.meta.env.DEV ? { kind: 'file', url: ODYSSEY_URL } : DEMO_HLS,
  meta: {
    tmdbId: 1368337,
    wikiTitle: 'The_Odyssey_(2026_film)',
    genres: ['Epic', 'Action', 'Fantasy'],
    director: 'Christopher Nolan',
    cast: [
      { name: 'Matt Damon', character: 'Odysseus' },
      { name: 'Tom Holland', character: 'Telemachus' },
      { name: 'Anne Hathaway', character: 'Penelope' },
      { name: 'Robert Pattinson', character: 'Antinous' },
      { name: 'Zendaya', character: 'Athena' },
      { name: 'Lupita Nyong’o' },
      { name: 'Charlize Theron', character: 'Calypso' },
      { name: 'Samantha Morton', character: 'Circe' },
      { name: 'Jon Bernthal', character: 'Menelaus' },
      { name: 'John Leguizamo', character: 'Eumaeus' },
      { name: 'Himesh Patel', character: 'Eurylochus' },
      { name: 'Benny Safdie', character: 'Agamemnon' },
    ],
    facts: [
      { label: 'Written by', value: 'Christopher Nolan' },
      { label: 'Based on', value: 'Homer’s Odyssey' },
      { label: 'Music', value: 'Ludwig Göransson' },
      { label: 'Cinematography', value: 'Hoyte van Hoytema' },
      { label: 'Editing', value: 'Jennifer Lame' },
    ],
  },
};

const featured = treeOfLife;

export const catalog: Catalog = {
  featured,
  shelves: [
    { id: 'trending', label: 'Trending Now', items: [odyssey, treeOfLife, ...range(0, 8)] },
    { id: 'new', label: 'New Releases', items: [odyssey, ...range(4, 9)] },
    { id: 'continue', label: 'Continue Watching', items: range(9, 6) },
    { id: 'picks', label: 'Top Picks for You', items: range(2, 12) },
  ],
};

/** Every distinct title in the catalog (featured + shelves). */
export function allTitles(c: Catalog): Title[] {
  return [...new Set([c.featured, ...c.shelves.flatMap((s) => s.items)])];
}
