import type { Track } from "./types";

interface CacheEntry {
  previewUrl?: string;
  previewSource?: "deezer" | "itunes";
}

// Cached by spotifyId so the same track never hits /api/preview twice.
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<void>>();

function apply(track: Track, entry: CacheEntry) {
  track.previewUrl = entry.previewUrl;
  track.previewSource = entry.previewSource;
  track.previewResolved = true;
}

async function fetchPreview(track: Track): Promise<void> {
  const entry: CacheEntry = {};
  try {
    const url = new URL("/api/preview", location.origin);
    url.searchParams.set("isrc", track.isrc);
    url.searchParams.set("artist", track.artist);
    url.searchParams.set("title", track.title);

    const res = await fetch(url.toString());
    if (res.ok) {
      const json = await res.json();
      if (typeof json?.previewUrl === "string" && json.previewUrl) {
        entry.previewUrl = json.previewUrl;
        entry.previewSource = json.source;
      }
    }
  } catch {
    // network hiccup — treated as "no preview", track gets discarded
  }
  cache.set(track.spotifyId, entry);
  apply(track, entry);
}

/** Resolves the preview URL for a track. Safe to call repeatedly. */
export async function ensurePreview(track: Track): Promise<Track> {
  if (track.previewResolved) return track;

  const cached = cache.get(track.spotifyId);
  if (cached) {
    apply(track, cached);
    return track;
  }

  let pending = inflight.get(track.spotifyId);
  if (!pending) {
    pending = fetchPreview(track).finally(() => inflight.delete(track.spotifyId));
    inflight.set(track.spotifyId, pending);
  }
  await pending;
  return track;
}

/** Warms up the next tracks in the background — errors are irrelevant here. */
export function prefetch(tracks: Track[]) {
  for (const track of tracks) {
    if (!track.previewResolved) void ensurePreview(track).catch(() => {});
  }
}
