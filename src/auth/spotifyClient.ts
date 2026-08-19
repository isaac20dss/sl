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
      // Retry-After is not exposed to JavaScript on a cross-origin response, so a
      // missing header says nothing about how long the block lasts — it used to read
      // as "1 second" and trigger five more calls, spending quota already exhausted.
      const header = Number(res.headers.get("retry-after"));
      const retryAfter = Number.isFinite(header) && header > 0 ? header : 0;

      // Waiting minutes inside a click handler helps nobody — say how long instead.
      if (retryAfter > 30 || attempt >= 1) {
        throw new SpotifyError(
          429,
          retryAfter
            ? `cota estourada, tente de novo em ${retryAfter}s`
            : "cota deste tipo de requisição estourada — espere antes de tentar de novo",
        );
      }
      await sleep((retryAfter || 2) * 1000 + 250);
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
