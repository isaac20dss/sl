const AUTH = "https://accounts.spotify.com";
const SCOPES = "playlist-read-private playlist-read-collaborative user-library-read";
const STORAGE_KEY = "songless_tokens";

// Public by design: the PKCE flow has no client secret, so the client ID ships in the
// bundle either way. The env var still wins when it is set.
const DEFAULT_CLIENT_ID = "6f5ffbcf76c44ddba9df6cb867291203";

export const CLIENT_ID = (
  import.meta.env.VITE_SPOTIFY_CLIENT_ID || DEFAULT_CLIENT_ID
).trim();
export const REDIRECT_URI = (
  import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? `${location.origin}/callback`
).trim();

/** True when VITE_SPOTIFY_CLIENT_ID is set — the login screen warns when it is not. */
export const CONFIG_OK = CLIENT_ID.length > 0;

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string; // scopes Spotify actually granted — not necessarily the ones asked for
}

/** Scopes granted to the current session, for diagnosing 403s. */
export function grantedScopes(): string {
  return load()?.scope ?? "";
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

const rand = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)))
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join("");

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

// Tokens live in memory + sessionStorage: they die when the tab closes.
let memory: Tokens | null = null;

function load(): Tokens | null {
  if (memory) return memory;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    memory = JSON.parse(raw) as Tokens;
    return memory;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveTokens(payload: any) {
  if (!payload?.access_token) throw new AuthError("token_response_invalid");
  const previous = load();
  const tokens: Tokens = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? previous?.refresh_token,
    expires_at: Date.now() + (Number(payload.expires_in) || 3600) * 1000,
    scope: payload.scope ?? previous?.scope,
  };
  memory = tokens;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function clearTokens() {
  memory = null;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function isLoggedIn(): boolean {
  return load() !== null;
}

export async function login() {
  if (!CONFIG_OK) throw new Error("missing VITE_SPOTIFY_CLIENT_ID");
  const verifier = rand(64);
  const state = rand(16);
  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("pkce_state", state);

  const challenge = b64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );

  // Built by hand: URLSearchParams encodes the scope separator as "+", and the
  // authorize endpoint expects "%20".
  const params = [
    ["client_id", CLIENT_ID],
    ["response_type", "code"],
    ["redirect_uri", REDIRECT_URI],
    ["scope", SCOPES],
    ["code_challenge_method", "S256"],
    ["code_challenge", challenge],
    ["state", state],
    // Force the consent screen so a session with missing scopes can be fixed.
    ["show_dialog", "true"],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  location.href = `${AUTH}/authorize?${params}`;
}

/** Handles the `/callback` URL. Returns true when a session was established. */
export async function handleCallback(): Promise<boolean> {
  const q = new URLSearchParams(location.search);

  const denied = q.get("error");
  if (denied) {
    history.replaceState({}, "", "/");
    throw new AuthError(denied);
  }

  const code = q.get("code");
  if (!code) return false;

  if (q.get("state") !== sessionStorage.getItem("pkce_state")) {
    history.replaceState({}, "", "/");
    throw new AuthError("state_mismatch");
  }

  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) {
    history.replaceState({}, "", "/");
    throw new AuthError("missing_verifier");
  }

  const res = await fetch(`${AUTH}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });

  sessionStorage.removeItem("pkce_verifier");
  sessionStorage.removeItem("pkce_state");

  if (!res.ok) {
    history.replaceState({}, "", "/");
    throw new AuthError(`token_exchange_failed_${res.status}`);
  }

  saveTokens(await res.json());
  history.replaceState({}, "", "/"); // drop ?code from the URL
  return true;
}

let refreshing: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const tokens = load();
  if (!tokens?.refresh_token) {
    clearTokens();
    throw new AuthError("no_refresh_token");
  }

  const res = await fetch(`${AUTH}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: CLIENT_ID,
    }),
  });

  if (!res.ok) {
    clearTokens();
    throw new AuthError(`refresh_failed_${res.status}`);
  }

  saveTokens(await res.json());
  return load()!.access_token;
}

/** Refreshes the access token — concurrent callers share one request. */
export function refresh(): Promise<string> {
  if (!refreshing) {
    refreshing = doRefresh();
    refreshing.then(
      () => {
        refreshing = null;
      },
      () => {
        refreshing = null;
      },
    );
  }
  return refreshing;
}

/** Valid access token, refreshing transparently when it is about to expire. */
export async function getAccessToken(): Promise<string> {
  const tokens = load();
  if (!tokens) throw new AuthError("no_session");
  if (Date.now() < tokens.expires_at - 60_000) return tokens.access_token;
  return refresh();
}

export function logout() {
  clearTokens();
  sessionStorage.removeItem("pkce_verifier");
  sessionStorage.removeItem("pkce_state");
}
