/**
 * Minimal Jellyfin client for Babu (Jellyfin 10.11 API).
 * Jellyfin serves the files and library metadata; Babu provides the UI.
 */
import { loadJellyfinConfig, type JellyfinConfig } from '../data/serverConfig';
import type { CastMember, Title } from '../data/types';
import { formatRuntime } from '../data/movieInfo';

const CLIENT = 'Babu';
const VERSION = '0.1.0';
const SESSION_KEY = 'babu.jellyfin.session';
const DEVICE_KEY = 'babu.jellyfin.device';
const OVERRIDE_KEY = 'babu.jellyfin.server';
const TICKS_PER_SECOND = 10_000_000;

export interface Session {
  server: string;
  token: string;
  userId: string;
  userName: string;
}

// ---------- storage (localStorage can throw in private modes) ----------

function readJson<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function deviceId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_KEY);
  } catch {
    /* ignore */
  }
  if (!id) {
    id = crypto.randomUUID();
    write(DEVICE_KEY, id);
  }
  return id;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Web';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

function authHeader(token?: string): string {
  const parts = [`Client="${CLIENT}"`, `Device="${deviceName()}"`, `DeviceId="${deviceId()}"`, `Version="${VERSION}"`];
  if (token) parts.push(`Token="${token}"`);
  return `MediaBrowser ${parts.join(', ')}`;
}

// ---------- server address ----------

let configPromise: Promise<JellyfinConfig | null> | null = null;
const config = () => (configPromise ??= loadJellyfinConfig());

/** Current Jellyfin address: a per-browser override if set, else the one saved in Firestore. */
export async function getServerUrl(): Promise<string | null> {
  return readJson<string>(OVERRIDE_KEY) ?? (await config())?.url ?? null;
}

export function setServerOverride(url: string | null) {
  write(OVERRIDE_KEY, url ? JSON.stringify(url) : null);
}

// ---------- session ----------

export function getSession(): Session | null {
  return readJson<Session>(SESSION_KEY);
}

export async function signIn(server: string, username: string, password: string): Promise<Session> {
  const res = await fetch(`${server}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  if (res.status === 401) throw new Error('Wrong username or password.');
  if (!res.ok) throw new Error(`Jellyfin answered ${res.status}.`);
  const d = (await res.json()) as { AccessToken: string; User: { Id: string; Name: string } };
  const session: Session = { server, token: d.AccessToken, userId: d.User.Id, userName: d.User.Name };
  write(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function signOut(): Promise<void> {
  const s = getSession();
  write(SESSION_KEY, null);
  if (s) await api(s, '/Sessions/Logout', { method: 'POST' }).catch(() => {});
}

/**
 * Session Babu uses: a personal one if this browser signed in, otherwise the shared viewer
 * account configured on /upload (so visitors never see a login). Always follows the current
 * server link, since the tunnel address changes on restart. Null if neither exists.
 */
export async function activeSession(): Promise<Session | null> {
  const server = await getServerUrl();
  const own = getSession();
  if (own) {
    if (server && server !== own.server) {
      own.server = server;
      write(SESSION_KEY, JSON.stringify(own));
    }
    return own;
  }
  const v = (await config())?.viewer;
  return server && v ? { server, token: v.token, userId: v.userId, userName: v.userName } : null;
}

async function api<T = unknown>(s: Session, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${s.server}${path}`, {
    ...init,
    headers: { Authorization: authHeader(s.token), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401) {
    write(SESSION_KEY, null); // token revoked or expired
    throw new Error('Signed out by Jellyfin');
  }
  if (!res.ok) throw new Error(`Jellyfin ${res.status} for ${path}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

// ---------- library → Babu titles ----------

interface JfPerson {
  Id: string;
  Name: string;
  Role?: string;
  Type?: string;
  PrimaryImageTag?: string;
}

interface JfItem {
  Id: string;
  Name: string;
  Overview?: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  OfficialRating?: string;
  CommunityRating?: number;
  Genres?: string[];
  Taglines?: string[];
  People?: JfPerson[];
  ImageTags?: { Primary?: string };
  BackdropImageTags?: string[];
  UserData?: { PlaybackPositionTicks?: number; Played?: boolean };
}

const FIELDS = 'Overview,Genres,People,Taglines,OfficialRating,CommunityRating,ProductionYear,RunTimeTicks';

const PALETTE = [0x6c5ce7, 0x00b894, 0xe17055, 0x0984e3, 0xd63031, 0x00a8a8, 0xe84393, 0x3f6b52, 0x1d3557];

function toTitle(s: Session, it: JfItem): Title {
  const img = (path: string) => `${s.server}${path}`;
  const people = it.People ?? [];
  const cast: CastMember[] = people
    .filter((p) => p.Type === 'Actor')
    .slice(0, 15)
    .map((p) => ({
      name: p.Name,
      character: p.Role || undefined,
      photo: p.PrimaryImageTag ? img(`/Items/${p.Id}/Images/Primary?fillHeight=240&quality=85&tag=${p.PrimaryImageTag}`) : undefined,
    }));
  const crew = (type: string) => [...new Set(people.filter((p) => p.Type === type).map((p) => p.Name))].join(', ');
  const facts = [
    { label: 'Written by', value: crew('Writer') },
    { label: 'Produced by', value: crew('Producer') },
    { label: 'Music', value: crew('Composer') },
  ].filter((f) => f.value);

  let h = 0;
  for (const ch of it.Id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;

  return {
    id: `jf-${it.Id}`,
    name: it.Name,
    description: it.Overview ?? '',
    year: it.ProductionYear,
    duration: it.RunTimeTicks ? formatRuntime(Math.round(it.RunTimeTicks / TICKS_PER_SECOND / 60)) : undefined,
    color: PALETTE[h % PALETTE.length],
    poster: it.ImageTags?.Primary ? img(`/Items/${it.Id}/Images/Primary?fillHeight=750&quality=90&tag=${it.ImageTags.Primary}`) : undefined,
    backdrop: it.BackdropImageTags?.[0]
      ? img(`/Items/${it.Id}/Images/Backdrop/0?fillWidth=1600&quality=85&tag=${it.BackdropImageTags[0]}`)
      : undefined,
    meta: {
      tagline: it.Taglines?.[0],
      genres: it.Genres?.slice(0, 4),
      certification: it.OfficialRating,
      score: it.CommunityRating ? Math.round(it.CommunityRating * 10) / 10 : undefined,
      director: crew('Director') || undefined,
      cast,
      facts,
    },
    source: { kind: 'jellyfin', itemId: it.Id, resumeSeconds: (it.UserData?.PlaybackPositionTicks ?? 0) / TICKS_PER_SECOND || undefined },
  };
}

export interface Library {
  resume: Title[];
  latest: Title[];
  byGenre: { genre: string; items: Title[] }[];
}

export async function loadLibrary(s: Session): Promise<Library> {
  const common = `userId=${s.userId}&fields=${FIELDS}&enableUserData=true&imageTypeLimit=1&enableImageTypes=Primary,Backdrop`;
  const [resume, all] = await Promise.all([
    api<{ Items: JfItem[] }>(s, `/UserItems/Resume?${common}&mediaTypes=Video&includeItemTypes=Movie&limit=20`).catch(() => ({ Items: [] })),
    api<{ Items: JfItem[] }>(
      s,
      `/Items?${common}&includeItemTypes=Movie&recursive=true&sortBy=DateCreated&sortOrder=Descending&limit=300`,
    ),
  ]);
  const latest = all.Items.map((it) => toTitle(s, it));

  // Up to 4 genre rows, biggest first (each needs 3+ movies).
  const counts = new Map<string, Title[]>();
  for (const t of latest) for (const g of t.meta?.genres ?? []) counts.set(g, [...(counts.get(g) ?? []), t]);
  const byGenre = [...counts.entries()]
    .filter(([, items]) => items.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4)
    .map(([genre, items]) => ({ genre, items }));

  return { resume: resume.Items.map((it) => toTitle(s, it)), latest, byGenre };
}

// ---------- playback ----------

/** What this browser can play natively; Jellyfin transcodes everything else to HLS (H.264/AAC). */
function deviceProfile() {
  const v = document.createElement('video');
  const hevc = v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') !== '';
  const videoCodecs = ['h264', ...(hevc ? ['hevc'] : [])].join(',');
  return {
    Name: 'Babu web',
    MaxStreamingBitrate: 40_000_000,
    MaxStaticBitrate: 100_000_000,
    DirectPlayProfiles: [
      { Container: 'mp4,m4v', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: 'aac,mp3,ac3,eac3,flac,opus' },
      { Container: 'webm', Type: 'Video', VideoCodec: 'vp8,vp9,av1', AudioCodec: 'vorbis,opus' },
    ],
    TranscodingProfiles: [
      {
        Container: 'ts',
        Type: 'Video',
        VideoCodec: 'h264',
        AudioCodec: 'aac',
        Protocol: 'hls',
        Context: 'Streaming',
        MaxAudioChannels: '2',
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: [{ Format: 'vtt', Method: 'External' }],
  };
}

export interface PlaybackHandle {
  url: string;
  isHls: boolean;
  startAt: number;
  /** Call with the <video> once it's playing to report progress to Jellyfin. */
  attach(video: HTMLVideoElement): void;
  /** Report "stopped" (saves the resume point). */
  stop(): void;
}

export async function startPlayback(itemId: string, resumeSeconds = 0): Promise<PlaybackHandle> {
  const s = await activeSession();
  if (!s) throw new Error('Sign in to Jellyfin to play this.');

  const info = await api<{
    PlaySessionId: string;
    MediaSources: { Id: string; ETag?: string; Container?: string; SupportsDirectPlay?: boolean; SupportsDirectStream?: boolean; TranscodingUrl?: string }[];
    ErrorCode?: string;
  }>(s, `/Items/${itemId}/PlaybackInfo?userId=${s.userId}`, {
    method: 'POST',
    body: JSON.stringify({ UserId: s.userId, DeviceProfile: deviceProfile(), MaxStreamingBitrate: 40_000_000, AutoOpenLiveStream: true }),
  });
  if (info.ErrorCode) throw new Error(`Jellyfin can’t play this (${info.ErrorCode}).`);
  const src = info.MediaSources[0];
  if (!src) throw new Error('No playable file for this movie.');

  const direct = src.SupportsDirectPlay || src.SupportsDirectStream;
  let url: string;
  let method: 'DirectPlay' | 'DirectStream' | 'Transcode';
  if (direct || !src.TranscodingUrl) {
    const q = new URLSearchParams({
      static: 'true',
      mediaSourceId: src.Id,
      playSessionId: info.PlaySessionId,
      deviceId: deviceId(),
      api_key: s.token,
    });
    if (src.ETag) q.set('tag', src.ETag);
    url = `${s.server}/Videos/${itemId}/stream?${q}`;
    method = src.SupportsDirectPlay ? 'DirectPlay' : 'DirectStream';
  } else {
    url = `${s.server}${src.TranscodingUrl}`;
    if (!/[?&](api_key|ApiKey)=/i.test(url)) url += `${url.includes('?') ? '&' : '?'}api_key=${s.token}`;
    method = 'Transcode';
  }

  const base = { ItemId: itemId, MediaSourceId: src.Id, PlaySessionId: info.PlaySessionId, PlayMethod: method, CanSeek: true };
  const ticks = (v: HTMLVideoElement) => Math.round(v.currentTime * TICKS_PER_SECOND);
  let video: HTMLVideoElement | null = null;
  let timer = 0;
  let stopped = false;

  const report = (path: string, extra: Record<string, unknown> = {}) =>
    api(s, path, { method: 'POST', body: JSON.stringify({ ...base, ...extra }), keepalive: true }).catch(() => {});

  return {
    url,
    isHls: method === 'Transcode' || /\.m3u8(\?|$)/i.test(url),
    startAt: resumeSeconds > 30 ? resumeSeconds : 0,
    attach(v) {
      video = v;
      void report('/Sessions/Playing', { PositionTicks: ticks(v), IsPaused: v.paused });
      timer = window.setInterval(() => {
        if (video) void report('/Sessions/Playing/Progress', { PositionTicks: ticks(video), IsPaused: video.paused, IsMuted: video.muted });
      }, 10_000);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      if (video) void report('/Sessions/Playing/Stopped', { PositionTicks: ticks(video) });
    },
  };
}
