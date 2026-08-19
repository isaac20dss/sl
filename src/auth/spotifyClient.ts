import { AuthError, getAccessToken, refresh } from "./pkce";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Carries Spotify's own error message — without it a 403 says nothing useful. */
export class SpotifyError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail ? `spotify_${status}: ${detail}` : `spotify_${status}`);
    this.name = "SpotifyError";
  }
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message ?? body?.error_description ?? "";
  } catch {
    return "";
  }
}

/**
 * Authenticated GET against the Spotify Web API.
 * Refreshes on 401, backs off on 429, throws AuthError when the session is gone.
 */
export async function spotifyGet<T>(url: string): Promise<T> {
  let refreshed = false;

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = await getAccessToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 401) {
      if (refreshed) throw new AuthError("unauthorized");
      refreshed = true;
      await refresh(); // throws AuthError when it cannot recover
      continue;
    }

    if (res.status === 429) {
      const header = Number(res.headers.get("retry-after") ?? "1");
      const retryAfter = Number.isFinite(header) ? header : 1;
      // Waiting minutes inside a click handler helps nobody — say how long instead.
      if (retryAfter > 30) {
        throw new SpotifyError(429, `cota estourada, tente de novo em ${retryAfter}s`);
      }
      await sleep(retryAfter * 1000 + 250);
      continue;
    }

    if (res.status >= 500) {
      await sleep(400 * (attempt + 1));
      continue;
    }

    if (!res.ok) throw new SpotifyError(res.status, await errorDetail(res));
    return (await res.json()) as T;
  }

  throw new SpotifyError(429, "cota do app estourada, espere alguns minutos");
}
