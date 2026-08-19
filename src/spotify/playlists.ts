import { spotifyGet } from "../auth/spotifyClient";
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

/** Every playlist of the logged-in user, following pagination. */
export async function fetchAllPlaylists(): Promise<SpotifyPlaylist[]> {
  let url: string | null = `${API}/me/playlists?limit=50`;
  const out: SpotifyPlaylist[] = [];

  while (url) {
    const page: Paged<any> = await spotifyGet<Paged<any>>(url);
    for (const p of page.items ?? []) {
      if (!p?.id) continue;
      out.push({
        id: p.id,
        name: p.name ?? "(sem nome)",
        imageUrl: p.images?.[0]?.url ?? "",
        total: p.tracks?.total ?? 0,
        owner: p.owner?.display_name ?? "",
      });
    }
    url = page.next;
  }

  return out;
}

/**
 * Real track count for one playlist.
 * `/me/playlists` sometimes reports `tracks.total: 0`, so the picker backfills
 * the count from the tracks endpoint (1 item, only the `total` field).
 */
export async function fetchPlaylistTotal(playlistId: string): Promise<number> {
  const base = `${API}/playlists/${playlistId}/tracks?limit=1`;

  const filtered = await spotifyGet<{ total?: number }>(`${base}&fields=total`);
  if (filtered.total) return filtered.total;

  // Some responses drop `total` once `fields` is applied — ask again unfiltered.
  const plain = await spotifyGet<{ total?: number }>(base);
  return plain.total ?? 0;
}

const FIELDS =
  "next,items(track(id,name,is_local,external_ids(isrc),artists(name),album(images)))";

export interface PlaylistTracks {
  tracks: Track[]; // playable candidates (have an id and an ISRC)
  seen: number; // every non-null track found, used for the "left out" stats
}

function toTrack(raw: any): Track | null {
  if (!raw?.id) return null;
  if (raw.is_local === true) return null;

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
  let url: string | null =
    `${API}/playlists/${playlistId}/tracks?limit=100&fields=${encodeURIComponent(FIELDS)}`;

  const tracks: Track[] = [];
  let seen = 0;

  while (url) {
    const page: Paged<any> = await spotifyGet<Paged<any>>(url);
    for (const item of page.items ?? []) {
      const raw = item?.track;
      if (!raw) continue; // removed / unavailable track
      seen++;
      const track = toTrack(raw);
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
 * `/me/tracks` lives outside the `/playlists/{id}/tracks` family, which this
 * Spotify app is forbidden from reading (403 for every playlist, any token).
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
