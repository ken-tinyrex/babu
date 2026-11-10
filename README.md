# Babu

A simple, responsive streaming website. The browse UI (header, hero, poster shelves) is rendered with **PixiJS 8**; playback streams MP4 / HLS in a native `<video>` player. Works on desktop browsers, Android Chrome and iOS Safari.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN for phone testing)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

To test on a phone, open the `Network:` URL that `npm run dev` prints, from a device on the same Wi-Fi.

## Deploy

Hosted on Firebase as the `babutv` site in the `pokecard-summoner` project: https://babutv.web.app

```bash
firebase login          # once
npm run deploy          # build + firebase deploy --only hosting
```

## Project layout

```
index.html            viewport / iOS meta tags, player overlay markup
src/
  main.ts             boots Pixi, wires HomeScreen + Player
  style.css           full-screen canvas, safe-area insets, player overlay
  theme.ts            colors + responsive metrics (mobile < 640 ≤ tablet < 1024 ≤ desktop)
  safeArea.ts         reads iOS notch / home-indicator insets
  data/
    types.ts          Title, Shelf, Catalog, VideoSource
    catalog.ts        catalog: real titles (video URL + details) and demo placeholders
    movieInfo.ts      movie details from TMDB (optional key) or Wikipedia (no key)
  details/Details.ts  movie details page (DOM sheet over the canvas)
  player/Player.ts    DOM player: MP4, HLS (native on Safari, hls.js elsewhere), optional embed iframe
  ui/
    HomeScreen.ts     page layout + unified touch / mouse-drag / wheel scrolling
    Scroller.ts       momentum + rubber-band scroll model
    Header.ts, Hero.ts, Row.ts, PosterCard.ts
    gradient.ts       vertical gradient helper
```

## Video sources

Each `Title` has a `source`:

```ts
{ kind: 'file', url: 'https://…/video.mp4' }       // direct MP4 or HLS (.m3u8): streamed in Babu's player
{ kind: 'embed', url: 'https://…/embed/…' }        // another site's player page in an iframe (fallback)
```

MP4s stream progressively: the browser fetches byte ranges as you watch, so playback starts right away and seeking works, as long as the server supports HTTP range requests (most CDNs do).

## Adding your own video

Babu needs the **direct** video URL, not the address of a watch page (a page like `https://site/v/<id>` is HTML, not video). To find it:

1. Open the watch page in desktop Chrome and start the video.
2. Open DevTools (`Cmd+Opt+I`) → **Network** tab → filter **Media** (or type `mp4` / `m3u8` in the filter box).
3. Right-click the request → **Copy → Copy URL**.
4. In `src/data/catalog.ts`, copy an existing real title (e.g. `odyssey`), set `source: { kind: 'file', url }` to your URL, and add it to a shelf.

If it doesn't play in Babu, the host is probably blocking it:
- **Expiring / signed URL** (long `?token=`/`?expires=` query): it works for a while, then stops. You'll need a stable link from the host, or host the file yourself.
- **Hotlink protection** (only plays on the host's own site): use the host's embed player via `{ kind: 'embed', url }`, or host the file yourself.

For reliable streaming you control, upload the file to storage with a CDN (e.g. Cloudflare R2, Bunny, S3 + CloudFront) and use that URL.

## Movie details

Tapping a poster or **More info** opens a details page. Details come from, in order:

1. **TMDB**, if `VITE_TMDB_TOKEN` is set in `.env.local` (free "API Read Access Token" from https://www.themoviedb.org/settings/api) and the title has `meta.tmdbId`. Adds backdrop, rating, tagline, genres and cast photos.
2. **Wikipedia** (no key), if the title has `meta.wikiTitle`. Adds the poster and an "About the film" summary.
3. The title's own `meta` in `catalog.ts` (director, cast, credits, rating), used as the fallback.

`VITE_` variables end up in the website bundle, so the TMDB token is public. It's read-only, but if that matters, fetch TMDB from a small server instead.

## Mobile notes

- The canvas takes all touch input (`touch-action: none`). A drag is routed to the shelf under the finger when it's mostly horizontal, otherwise to the page. Taps that end a drag are ignored.
- Render resolution is capped at 2× for fill-rate on high-DPI phones.
- The Pixi ticker stops while the player is open to save battery.
- `<video playsinline>` keeps iOS from forcing fullscreen; the native controls still offer fullscreen and AirPlay.
