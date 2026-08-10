// Local blob cache for chat media (images / files) so they stay viewable and
// downloadable while offline. Blobs live in IndexedDB via idb-keyval; object
// URLs are memoised per session.
import { createStore, get, set, keys, del } from "idb-keyval";

const store = createStore("youandme-media", "blobs");

const objectUrls = new Map<string, string>();

/** Max number of cached media blobs kept around. */
const MAX_ENTRIES = 300;

export async function getCachedBlob(path: string): Promise<Blob | null> {
  try {
    return ((await get(path, store)) as Blob | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Returns an object URL for a locally cached blob, or null if not cached. */
export async function getCachedUrl(path: string): Promise<string | null> {
  const existing = objectUrls.get(path);
  if (existing) return existing;
  const blob = await getCachedBlob(path);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(path, url);
  return url;
}

export async function putCachedBlob(path: string, blob: Blob): Promise<string> {
  try {
    await set(path, blob, store);
    void trim();
  } catch {
    /* quota / private mode — fall back to in-memory url only */
  }
  const prev = objectUrls.get(path);
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(blob);
  objectUrls.set(path, url);
  return url;
}

/**
 * Downloads `remoteUrl` once and caches it under `path`.
 * Returns a local object URL, or null when the fetch fails (e.g. offline).
 */
export async function cacheRemote(path: string, remoteUrl: string): Promise<string | null> {
  const cached = await getCachedUrl(path);
  if (cached) return cached;
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    return await putCachedBlob(path, blob);
  } catch {
    return null;
  }
}

async function trim() {
  try {
    const all = await keys(store);
    if (all.length <= MAX_ENTRIES) return;
    const excess = all.slice(0, all.length - MAX_ENTRIES);
    await Promise.all(excess.map((k) => del(k, store)));
  } catch {
    /* ignore */
  }
}
