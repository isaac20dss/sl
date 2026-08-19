import type { Track } from "../game/types";

const DIACRITICS = /[̀-ͯ]/g;

export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(DIACRITICS, "").trim();

/**
 * Client-side autocomplete over the selected pool only — no API call per keystroke.
 * Title matches rank above artist matches, prefix matches above the rest.
 */
export function filterTracks(pool: Track[], query: string, exclude: Set<string>, limit = 8): Track[] {
  const q = norm(query);
  if (q.length < 1) return [];

  const scored: Array<{ track: Track; score: number }> = [];

  for (const track of pool) {
    if (exclude.has(track.spotifyId)) continue;

    const title = norm(track.title);
    const artist = norm(track.artist);

    let score = -1;
    if (title.startsWith(q)) score = 0;
    else if (title.includes(q)) score = 1;
    else if (artist.startsWith(q)) score = 2;
    else if (artist.includes(q)) score = 3;
    else if (`${artist} ${title}`.includes(q)) score = 4;

    if (score >= 0) scored.push({ track, score });
    if (scored.length > 400) break; // plenty to sort from on huge pools
  }

  return scored
    .sort((a, b) => a.score - b.score || a.track.title.localeCompare(b.track.title))
    .slice(0, limit)
    .map((s) => s.track);
}
