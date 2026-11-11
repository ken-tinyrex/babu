import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import { db } from '../firebase';

/**
 * Babu settings stored in Firestore (babu_config/jellyfin), so the live site can follow
 * a changing Cloudflare quick-tunnel link without a redeploy.
 * Public read; only the owner can write (rule lives in the pos-sytem repo).
 */
const ref = () => doc(db, 'babu_config', 'jellyfin');

export interface JellyfinConfig {
  url: string;
  updatedAt?: Date;
  /**
   * Shared viewer account Babu uses automatically (no visitor sign-in).
   * Only the access token is stored, never the password; it must be a non-admin user,
   * because anyone can read this document.
   */
  viewer?: { token: string; userId: string; userName: string };
}

/** Normalizes a pasted link to "https://host[:port]" (no trailing slash/path). Null if invalid. */
export function normalizeServerUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return null;
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '').replace(/\/web(\/.*)?$/, '')}`;
  } catch {
    return null;
  }
}

export async function loadJellyfinConfig(): Promise<JellyfinConfig | null> {
  try {
    const snap = await getDoc(ref());
    const d = snap.data();
    const url = typeof d?.url === 'string' ? normalizeServerUrl(d.url) : null;
    if (!url) return null;
    const ts = d?.updatedAt as { toDate?: () => Date } | undefined;
    const v = d?.viewer as Record<string, unknown> | undefined;
    const viewer =
      v && typeof v.token === 'string' && typeof v.userId === 'string' && typeof v.userName === 'string'
        ? { token: v.token, userId: v.userId, userName: v.userName }
        : undefined;
    return { url, updatedAt: ts?.toDate?.(), viewer };
  } catch {
    return null;
  }
}

export async function saveJellyfinUrl(url: string): Promise<void> {
  await setDoc(ref(), { url, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveJellyfinViewer(viewer: { token: string; userId: string; userName: string }): Promise<void> {
  await setDoc(ref(), { viewer, viewerUpdatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Signs in to Jellyfin as the viewer account and returns its token. Rejects admin accounts:
 * the token becomes public, and an admin token would give anyone control of the server.
 */
export async function connectViewer(server: string, username: string, password: string) {
  const res = await fetch(`${server}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `MediaBrowser Client="Babu", Device="Babu website", DeviceId="babu-website", Version="0.1.0"`,
    },
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  if (res.status === 401) throw new Error('Wrong username or password.');
  if (!res.ok) throw new Error(`Jellyfin answered ${res.status}.`);
  const d = (await res.json()) as {
    AccessToken: string;
    User: { Id: string; Name: string; Policy?: { IsAdministrator?: boolean; EnableContentDeletion?: boolean } };
  };
  if (d.User.Policy?.IsAdministrator) {
    // Don't leave a live admin token behind.
    await fetch(`${server}/Sessions/Logout`, {
      method: 'POST',
      headers: { Authorization: `MediaBrowser Client="Babu", Device="Babu website", DeviceId="babu-website", Version="0.1.0", Token="${d.AccessToken}"` },
    }).catch(() => {});
    throw new Error(`“${d.User.Name}” is a Jellyfin administrator. Create a separate non-admin user for Babu.`);
  }
  return {
    viewer: { token: d.AccessToken, userId: d.User.Id, userName: d.User.Name },
    canDelete: !!d.User.Policy?.EnableContentDeletion,
  };
}

/** Checks that a Jellyfin server answers at this address (and that the browser may call it). */
export async function probeJellyfin(url: string, timeoutMs = 8000): Promise<{ ok: true; name: string; version: string } | { ok: false; reason: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/System/Info/Public`, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, reason: `Server answered ${res.status}` };
    const info = (await res.json()) as { ServerName?: string; Version?: string; ProductName?: string };
    if (!info.Version) return { ok: false, reason: 'That address is not a Jellyfin server' };
    return { ok: true, name: info.ServerName ?? 'Jellyfin', version: info.Version };
  } catch (err) {
    return { ok: false, reason: (err as Error).name === 'AbortError' ? 'No answer (is the tunnel running?)' : 'Can’t reach it (tunnel down or link changed?)' };
  } finally {
    clearTimeout(timer);
  }
}
