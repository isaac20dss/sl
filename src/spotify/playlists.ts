import { SpotifyError, spotifyGet } from "../auth/spotifyClient";
import type { Track } from "../game/types";

const API = "https://api.spotify.com/v1";

export interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string;
  total: number;
  owner: string;
}

interface Paged<T> {
  items: T[];
  next: string | null;
}

/**
 * Every playlist of the logged-in user, following pagination.
 * `onPage` receives each page as it lands, so a failure halfway through
 * (a 429, typically) still leaves the caller with the playlists already read.
 */
export async function fetchAllPlaylists(
  onPage?: (batch: SpotifyPlaylist[]) => void,
): Promise<SpotifyPlaylist[]> {
  let url: string | null = `${API}/me/playlists?limit=50`;
  const out: SpotifyPlaylist[] = [];

  while (url) {
    const page: Paged<any> = await spotifyGet<Paged<any>>(url);
    const batch: SpotifyPlaylist[] = [];
    for (const p of page.items ?? []) {
      if (!p?.id) continue;
      batch.push({
        id: p.id,
        name: p.name ?? "(sem nome)",
        imageUrl: p.images?.[0]?.url ?? "",
        total: p.items?.total ?? p.tracks?.total ?? 0,
        owner: p.owner?.display_name ?? "",
      });
    }
    out.push(...batch);
    if (batch.length > 0) onPage?.(batch);
    url = page.next;
  }

  return out;
}

/**
 * Real track count for one playlist.
 * `/me/playlists` sometimes reports the total as 0, so the picker backfills
 * the count from the items endpoint (1 item, only the `total` field).
 */
export async function fetchPlaylistTotal(playlistId: string): Promise<number> {
  const base = `${API}/playlists/${playlistId}/items?limit=1`;

  const filtered = await spotifyGet<{ total?: number }>(`${base}&fields=total`);
  if (filtered.total) return filtered.total;

  // Some responses drop `total` once `fields` is applied — ask again unfiltered.
  const plain = await spotifyGet<{ total?: number }>(base);
  return plain.total ?? 0;
}

/**
 * Since the February 2026 API change the playlist contents live under `/items`,
 * and each entry carries the track as `item` — `track` survives as a deprecated
 * alias. Both are requested so the reader keeps working whichever one is served.
 */
const ITEM_SHAPE = "id,name,is_local,external_ids(isrc),artists(name),album(images)";
const FIELDS = `next,items(is_local,item(${ITEM_SHAPE}),track(${ITEM_SHAPE}))`;

export interface PlaylistTracks {
  tracks: Track[]; // playable candidates (have an id and an ISRC)
  seen: number; // every non-null track found, used for the "left out" stats
}

function toTrack(raw: any, isLocalEntry = false): Track | null {
  if (!raw?.id) return null;
  if (isLocalEntry || raw.is_local === true) return null;

  const isrc: string | undefined = raw.external_ids?.isrc;
  if (!isrc) return null;

  const images: any[] = raw.album?.images ?? [];
  // images come [640, 300, 64] — prefer the middle one.
  const albumImageUrl = images[1]?.url ?? images[0]?.url ?? "";

  const artist = (raw.artists ?? [])
    .map((a: any) => a?.name)
    .filter(Boolean)
    .join(", ");

  return {
    spotifyId: raw.id,
    title: raw.name ?? "",
    artist,
    albumImageUrl,
    isrc,
  };
}

/** All tracks of one playlist. `onProgress` reports the running candidate count. */
export async function fetchPlaylistTracks(
  playlistId: string,
  onProgress?: (loaded: number) => void,
): Promise<PlaylistTracks> {
  // 50 is the maximum the items endpoint accepts.
  const base = `${API}/playlists/${playlistId}/items?limit=50`;
  let url: string | null = `${base}&fields=${encodeURIComponent(FIELDS)}`;
  let filtered = true;

  const tracks: Track[] = [];
  let seen = 0;

  while (url) {
    let page: Paged<any>;
    try {
      page = await spotifyGet<Paged<any>>(url);
    } catch (error) {
      // A rejected `fields` filter must not cost the whole playlist — ask again unfiltered.
      if (filtered && error instanceof SpotifyError && error.status === 400) {
        filtered = false;
        url = base;
        continue;
      }
      throw error;
    }

    for (const entry of page.items ?? []) {
      const raw = entry?.item ?? entry?.track;
      if (!raw) continue; // removed / unavailable track
      seen++;
      const track = toTrack(raw, entry?.is_local === true);
      if (track) tracks.push(track);
    }
    onProgress?.(tracks.length);
    url = page.next;
  }

  return { tracks, seen };
}

/** Pseudo-playlist id for the user's Liked Songs. */
export const LIKED_ID = "__liked__";

/**
 * Liked Songs as a playable list.
 * `/me/tracks` was never touched by the February 2026 playlist migration, which
 * is why this was the only readable source while the code still called `/tracks`.
 */
export async function fetchLikedTracks(
  onProgress?: (loaded: number) => void,
): Promise<PlaylistTracks> {
  let url: string | null = `${API}/me/tracks?limit=50`;
  const tracks: Track[] = [];
  let seen = 0;

  while (url) {
    const page: Paged<any> = await spotifyGet<Paged<any>>(url);
    for (const item of page.items ?? []) {
      const raw = item?.track;
      if (!raw) continue;
      seen++;
      const track = toTrack(raw);
      if (track) tracks.push(track);
    }
    onProgress?.(tracks.length);
    url = page.next;
  }

  return { tracks, seen };
}

export async function fetchLikedTotal(): Promise<number> {
  const page = await spotifyGet<{ total?: number }>(`${API}/me/tracks?limit=1`);
  return page.total ?? 0;
}

/** The Liked Songs card shown alongside the playlists. */
export function likedCard(total = 0): SpotifyPlaylist {
  return { id: LIKED_ID, name: "Músicas Curtidas", imageUrl: "", total, owner: "você" };
}
