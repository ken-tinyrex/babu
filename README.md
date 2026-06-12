# babu

A personal React Native media player app for your Jellyfin server.

## What it does

Connects to your Jellyfin media server and lets you browse and stream your movies, TV shows, and music from anywhere — on your iPhone, over local WiFi or remotely via Cloudflare Tunnel.

## Infrastructure

| Component | Status | Details |
|---|---|---|
| Jellyfin Server | Done | Running on macOS at `localhost:8096` |
| Local Network | Done | `http://192.168.100.2:8096` |
| Tailscale VPN | Done | Mac Tailscale IP: `100.107.229.85` |
| Cloudflare Tunnel | Done | Auto-started via `npm run dev` |
| Permanent Tunnel URL | Pending | Needs a domain name |
| EAS OTA Updates | Done | Auto-checks on app load |

## App screens

- **Login** — auto-discovers Jellyfin servers on the local network; falls back to a hardcoded remote URL; multi-step flow: pick server → enter credentials
- **Register** — self-registration via the proxy server (rate-limited, no admin token exposed to client)
- **Home** — Netflix-style library view: featured carousel + one horizontal row per library (Movies, TV Shows, etc.)
- **Detail** — poster, title, year, rating, runtime, genres, overview, and a Play button
- **Player** — full-screen video player with native controls and buffering indicator

## Tech stack

- [Expo](https://expo.dev) (SDK 54) + React Native 0.81
- TypeScript 5.9
- [React Navigation](https://reactnavigation.org) v7 — native stack navigator
- [@jellyfin/sdk](https://github.com/jellyfin/jellyfin-sdk-typescript) ^0.13 — Jellyfin REST API client
- [expo-video](https://docs.expo.dev/versions/v54.0.0/sdk/video/) — video playback (new Expo video API)
- [expo-secure-store](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/) — persists login session securely
- [expo-linear-gradient](https://docs.expo.dev/versions/v54.0.0/sdk/linear-gradient/) — UI gradients
- [expo-screen-orientation](https://docs.expo.dev/versions/v54.0.0/sdk/screen-orientation/) — landscape lock during playback
- [expo-updates](https://docs.expo.dev/versions/v54.0.0/sdk/updates/) — OTA updates via EAS
- Node.js/Express proxy server — handles user registration without exposing admin credentials

## Project structure

```
babu/
├── App.tsx                          # Navigation container + auth-based routing
├── server/
│   └── index.js                     # Express proxy: /register endpoint, rate limiting
├── scripts/
│   └── start-tunnels.js             # Starts Cloudflare tunnels for Jellyfin + proxy
└── src/
    ├── api/
    │   └── jellyfin.ts              # SDK client factory, image/stream URL helpers
    ├── components/
    │   └── FeaturedCarousel.tsx     # Hero carousel for featured content
    ├── context/
    │   └── AuthContext.tsx          # Auth state, login/logout, SecureStore persistence
    ├── hooks/
    │   └── useJellyfinDiscovery.ts  # Auto-discovers Jellyfin servers on local network
    └── screens/
        ├── LoginScreen.tsx          # Server discovery + credential entry (multi-step)
        ├── RegisterScreen.tsx       # New user registration via proxy
        ├── HomeScreen.tsx
        ├── DetailScreen.tsx
        └── PlayerScreen.tsx
```

## Getting started

### Prerequisites

- Node.js
- Expo Go app on your iPhone (from the App Store), or a dev build
- Jellyfin running on your Mac
- A `.env` file in `server/` with `JELLYFIN_URL` and `JELLYFIN_ADMIN_TOKEN`

### Install dependencies

```bash
npm install
cd server && npm install
```

### Run everything (app + proxy server + tunnels)

```bash
npm run dev
```

This starts the proxy server, Expo dev server, and both Cloudflare tunnels concurrently.

Or run just the Expo app:

```bash
npm start
```

### Build a preview APK (Android)

```bash
eas build --profile preview --platform android
```

This produces an internal-distribution APK you can install directly on an Android device. Requires an [Expo account](https://expo.dev) and `eas-cli` (`npm install -g eas-cli`).

Press `i` for the iOS simulator, or scan the QR code with Expo Go on your iPhone.

## Accessing Jellyfin remotely

| Scenario | Server URL to use |
|---|---|
| Same WiFi | Auto-discovered or `http://192.168.100.2:8096` |
| Via Tailscale (any network) | `http://100.107.229.85:8096` |
| Via Cloudflare Tunnel | Your tunnel URL (rotates on restart) |

### Starting tunnels manually

```bash
npm run tunnel
```

This starts a tunnel for Jellyfin (`localhost:8096`) and one for the proxy server (`localhost:3000`). URLs change every restart; for permanent URLs you need a domain name and a named Cloudflare tunnel.

## Proxy server

The `server/` directory contains a small Express app that fronts user registration so the Jellyfin admin token never leaves the server.

**Required env vars** (`server/.env`):

```
JELLYFIN_URL=http://localhost:8096
JELLYFIN_ADMIN_TOKEN=your_admin_api_token
```

The `/register` endpoint is rate-limited to 5 requests per 15 minutes per IP.

## Roadmap

- [x] Jellyfin server running on macOS
- [x] Local and remote network access
- [x] Tailscale VPN
- [x] Cloudflare Tunnel (auto-started with `npm run dev`)
- [x] React Native app — Login, Home, Detail, Player screens
- [x] Self-registration (Register screen + proxy server)
- [x] Local server auto-discovery
- [x] Featured carousel on Home
- [x] EAS OTA updates
- [ ] Permanent Cloudflare Tunnel URL (requires domain ~$10/yr)
- [ ] Episode browser for TV series
- [ ] Search
- [ ] Offline downloads
