/**
 * Shared preview resolver — used by the Vercel function (`api/preview.ts`)
 * and by the Vite dev middleware, so local and prod behave the same.
 * Files prefixed with `_` are not exposed as routes by Vercel.
 */

export interface PreviewResult {
  previewUrl: string;
  source: "deezer" | "itunes";
}

export interface PreviewQuery {
  isrc: string;
  artist?: string;
  title?: string;
}

const TIMEOUT_MS = 6000;

const DIACRITICS = /[̀-ͯ]/g;

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(DIACRITICS, "").replace(/[^a-z0-9]/g, "");

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Loose containment match on normalized strings. */
function matches(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export async function resolvePreview({
  isrc,
  artist = "",
  title = "",
}: PreviewQuery): Promise<PreviewResult | null> {
  // 1) Deezer by ISRC — exact same recording as the Spotify track.
  try {
    const dj = await getJson(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`);
    if (dj && !dj.error && typeof dj.preview === "string" && dj.preview.length > 0) {
      return { previewUrl: dj.preview, source: "deezer" };
    }
  } catch {
    // fall through to iTunes
  }

  // 2) iTunes Search fallback by artist + title.
  try {
    const term = `${artist} ${title}`.trim();
    if (term) {
      const ij = await getJson(
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5&country=BR`,
      );
      const results: any[] = Array.isArray(ij?.results) ? ij.results : [];
      const wantTitle = norm(title);
      // Artists come joined ("A, B") — match against the first one.
      const wantArtist = norm(artist.split(",")[0] ?? "");

      const withPreview = results.filter((r) => typeof r?.previewUrl === "string" && r.previewUrl);
      const hit =
        withPreview.find(
          (r) =>
            matches(norm(r.trackName ?? ""), wantTitle) &&
            matches(norm(r.artistName ?? ""), wantArtist),
        ) ??
        withPreview.find((r) => matches(norm(r.trackName ?? ""), wantTitle)) ??
        withPreview[0];

      if (hit) return { previewUrl: hit.previewUrl, source: "itunes" };
    }
  } catch {
    // fall through to not_found
  }

  return null;
}
