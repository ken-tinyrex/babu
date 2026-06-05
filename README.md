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
| Cloudflare Tunnel | Done | Temporary URL via `cloudflared` |
| Permanent Tunnel URL | Pending | Needs a domain name |

## App screens

- **Login** — enter your server URL and Jellyfin credentials (server URL defaults to your local IP)
- **Home** — Netflix-style library view: one horizontal row per library (Movies, TV Shows, etc.)
- **Detail** — poster, title, year, rating, runtime, genres, overview, and a Play button
- **Player** — full-screen video player with native controls and buffering indicator

## Tech stack

- [Expo](https://expo.dev) (SDK 56) + React Native
- TypeScript
- [React Navigation](https://reactnavigation.org) — native stack navigator
- [@jellyfin/sdk](https://github.com/jellyfin/jellyfin-sdk-typescript) — Jellyfin REST API client
- [expo-av](https://docs.expo.dev/versions/latest/sdk/av/) — video playback
- [@react-native-async-storage/async-storage](https://react-native-async-storage.github.io/async-storage/) — persists login session

## Project structure

```
babu/
├── App.tsx                      # Navigation container + auth-based routing
├── src/
│   ├── api/
│   │   └── jellyfin.ts          # SDK client factory, image/stream URL helpers
│   ├── context/
│   │   └── AuthContext.tsx      # Auth state, login/logout, AsyncStorage persistence
│   └── screens/
│       ├── LoginScreen.tsx
│       ├── HomeScreen.tsx
│       ├── DetailScreen.tsx
│       └── PlayerScreen.tsx
```

## Getting started

### Prerequisites

- Node.js
- Expo CLI (`npm install -g expo-cli`)
- Expo Go app on your iPhone (from the App Store)
- Jellyfin running on your Mac

### Install dependencies

```bash
npm install
```

### Run the app

```bash
npx expo start
```

Press `i` for the iOS simulator, or scan the QR code with Expo Go on your iPhone.

Make sure your phone is on the same WiFi as your Mac, then sign in with your Jellyfin credentials.

## Accessing Jellyfin remotely

| Scenario | Server URL to use |
|---|---|
| Same WiFi | `http://192.168.100.2:8096` |
| Via Tailscale (any network) | `http://100.107.229.85:8096` |
| Via Cloudflare Tunnel | Your tunnel URL (see below) |

### Starting the Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:8096
```

The tunnel URL changes every time you restart. For a permanent URL, you need a domain name and a named Cloudflare tunnel (Phase 4).

## Roadmap

- [x] Jellyfin server running on macOS
- [x] Local and remote network access
- [x] Tailscale VPN
- [x] Cloudflare Tunnel (temporary URL)
- [x] React Native app — Login, Home, Detail, Player screens
- [ ] Permanent Cloudflare Tunnel URL (requires domain ~$10/yr)
- [ ] Episode browser for TV series
- [ ] Search
- [ ] Offline downloads
