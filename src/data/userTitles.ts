import {
  collection, deleteDoc, deleteField, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore/lite';
import { db } from '../firebase';
import type { CastMember, Fact, MovieMeta, Title } from './types';

/** Movies added from /upload live in this Firestore collection. */
const COLLECTION = 'babu_titles';

const PALETTE = [0x6c5ce7, 0x00b894, 0xe17055, 0x0984e3, 0xd63031, 0x00a8a8, 0xe84393, 0x3f6b52, 0x1d3557];

export function colorFor(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function slugify(name: string, year?: number): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return year ? `${base}-${year}` : base || `title-${Date.now()}`;
}

/** Newest first. Resolves to [] on any failure so the homepage still loads. */
export async function loadUserTitles(): Promise<Title[]> {
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(200)));
    return snap.docs.map((d) => fromDoc(d.id, d.data())).filter((t): t is Title => t !== null);
  } catch (err) {
    console.warn('Could not load added titles', err);
    return [];
  }
}

export async function saveTitle(t: Title, addedBy: string): Promise<void> {
  // Firestore rejects `undefined`; a JSON round-trip drops those fields.
  const data = JSON.parse(JSON.stringify(t)) as Record<string, unknown>;
  delete data.id;
  await setDoc(doc(db, COLLECTION, t.id), { ...data, addedBy, createdAt: serverTimestamp() });
}

/**
 * Saves edits to an existing title. Keeps its id, createdAt (position in "Recently Added")
 * and addedBy; optional fields that were cleared are removed from the document.
 */
export async function updateTitle(t: Title): Promise<void> {
  const data = JSON.parse(JSON.stringify(t)) as Record<string, unknown>;
  delete data.id;
  const patch: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() };
  for (const k of ['description', 'year', 'duration', 'poster', 'backdrop', 'meta']) {
    if (!(k in data)) patch[k] = deleteField();
  }
  await updateDoc(doc(db, COLLECTION, t.id), patch);
}

export async function deleteTitle(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

// ---------- Validation: documents are data, never trusted as-is ----------

const str = (v: unknown, max = 5000): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function https(v: unknown): string | undefined {
  const s = str(v, 4000);
  if (!s) return undefined;
  try {
    return new URL(s).protocol === 'https:' ? s : undefined;
  } catch {
    return undefined;
  }
}

function fromDoc(id: string, d: Record<string, unknown>): Title | null {
  const name = str(d.name, 200);
  const src = d.source as { kind?: unknown; url?: unknown } | undefined;
  const url = https(src?.url);
  if (!name || !url) return null;

  const m = (d.meta ?? {}) as Record<string, unknown>;
  const cast = Array.isArray(m.cast)
    ? (m.cast as Record<string, unknown>[])
        .map((c): CastMember | null => {
          const n = str(c?.name, 120);
          return n ? { name: n, character: str(c?.character, 120), photo: https(c?.photo) } : null;
        })
        .filter((c): c is CastMember => c !== null)
        .slice(0, 20)
    : undefined;
  const facts = Array.isArray(m.facts)
    ? (m.facts as Record<string, unknown>[])
        .map((f): Fact | null => {
          const label = str(f?.label, 60);
          const value = str(f?.value, 300);
          return label && value ? { label, value } : null;
        })
        .filter((f): f is Fact => f !== null)
    : undefined;
  const meta: MovieMeta = {
    tmdbId: num(m.tmdbId),
    wikiTitle: str(m.wikiTitle, 300),
    tagline: str(m.tagline, 300),
    genres: Array.isArray(m.genres) ? m.genres.map((g) => str(g, 40)).filter((g): g is string => !!g).slice(0, 6) : undefined,
    certification: str(m.certification, 20),
    score: num(m.score),
    director: str(m.director, 200),
    cast,
    facts,
    about: str(m.about, 4000),
    aboutUrl: https(m.aboutUrl),
    source: m.source === 'tmdb' || m.source === 'wikipedia' ? m.source : undefined,
  };

  return {
    id,
    name,
    description: str(d.description, 1200) ?? '',
    year: num(d.year),
    duration: str(d.duration, 20),
    color: num(d.color) ?? colorFor(name),
    poster: https(d.poster),
    backdrop: https(d.backdrop),
    meta,
    source: src?.kind === 'embed' ? { kind: 'embed', url } : { kind: 'file', url },
  };
}
