import type { Catalog, Title, VideoSource } from './types';

/**
 * The featured video. Paste the direct stream URL of your video here
 * (an address ending in .mp4 or .m3u8, see README "Adding your own video").
 * Until then it falls back to a public HLS test stream.
 */
const FEATURED_VIDEO_URL =
  'https://odd-silence-e10a.leland7a32f.workers.dev/z9HR0x7HM6Lb592ZDUd7NS5e8z92Np9y8r15b5w6S8_ZXs2d7z9XJo8x7a40c6Na4p90NDEd7NTp93ODx70Jm6Nb5Y0o8d7PTE0Nr14c6OS4b5NDt3f9Mq0Mb5Jm6Bb5PTEd7Jm6Nb5Y0Fm6PUNIUp99NRSZb5z9m6l59NDMn7y8XM9MTt31Lq0Ib5Nr141NS4c6NSZ0v5XBo8PTMn7x72o8m6PUJm6SFJCSo8FPTo8RZJn7N0PTAn7w6XJh1x7a405NS4c6Nq0Mf9Ma4Uf9Nq0Qn7Y2c6k4ZW50VHo8d7ZT0d7Jm6k4a4PTQa4Jn7o8p9PTQa4MDx7c6Mq0Q0OTE4Jm6Jj3x7q004/MTx75NDMb5Na4x75Nd7/6202_rebmevoN_01-%5BANONMP4.TO%5D.mp4';

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

const featured: Title = {
  id: 'featured',
  name: 'Babu Presents',
  description: 'Streaming from FEATURED_VIDEO_URL in src/data/catalog.ts.',
  color: 0xff4d6d,
  source: FEATURED_VIDEO_URL ? { kind: 'file', url: FEATURED_VIDEO_URL } : DEMO_HLS,
};

export const catalog: Catalog = {
  featured,
  shelves: [
    { id: 'trending', label: 'Trending Now', items: [featured, ...range(0, 9)] },
    { id: 'new', label: 'New Releases', items: range(4, 10) },
    { id: 'continue', label: 'Continue Watching', items: range(9, 6) },
    { id: 'picks', label: 'Top Picks for You', items: range(2, 12) },
  ],
};
