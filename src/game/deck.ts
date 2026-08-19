import type { Track } from "./types";

/** Merges playlists into one pool, keeping the first occurrence of each track id. */
export function dedupById(lists: Track[][]): Track[] {
  const byId = new Map<string, Track>();
  for (const list of lists) {
    for (const track of list) {
      if (!byId.has(track.spotifyId)) byId.set(track.spotifyId, track);
    }
  }
  return [...byId.values()];
}

/** Fisher-Yates, non-mutating. */
export function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Reshuffles for a new lap: drops tracks already known to have no preview and
 * avoids starting with `avoid` (the track that just played).
 */
export function reshuffle(deck: Track[], avoid?: Track): Track[] {
  const alive = deck.filter((t) => !t.previewResolved || t.previewUrl);
  const next = shuffle(alive);
  if (avoid && next.length > 1 && next[0].spotifyId === avoid.spotifyId) {
    const swapWith = 1 + Math.floor(Math.random() * (next.length - 1));
    [next[0], next[swapWith]] = [next[swapWith], next[0]];
  }
  return next;
}
