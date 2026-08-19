import { useEffect, useMemo, useRef, useState } from "react";
import { AuthError, grantedScopes } from "../auth/pkce";
import {
  LIKED_ID,
  fetchAllPlaylists,
  fetchLikedTotal,
  fetchPlaylistTotal,
  likedCard,
  type SpotifyPlaylist,
} from "../spotify/playlists";
import { Diagnostics } from "./Diagnostics";

interface Props {
  error?: string;
  onPlay: (playlists: SpotifyPlaylist[]) => void;
  onAuthLost: (error?: string) => void;
  onSignOut: () => void;
}

export function PlaylistPicker({ error, onPlay, onAuthLost, onSignOut }: Props) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string>();
  const [counting, setCounting] = useState(false);
  const [countError, setCountError] = useState<string>();
  const [likedError, setLikedError] = useState<string>();
  const [query, setQuery] = useState("");
  const alive = useRef(true);
  const counted = useRef<Set<string>>(new Set());

  useEffect(() => {
    alive.current = true;

    // Liked Songs is the only source this Spotify app can still read, so it is
    // shown immediately and never gated behind the playlist listing.
    setPlaylists([likedCard()]);

    void fetchLikedTotal()
      .then((total) => {
        if (!alive.current) return;
        setPlaylists((prev) =>
          prev ? prev.map((p) => (p.id === LIKED_ID ? { ...p, total } : p)) : prev,
        );
      })
      .catch((e) => {
        if (alive.current) setLikedError(e instanceof Error ? e.message : String(e));
      });

    (async () => {
      try {
        await fetchAllPlaylists((batch) => {
          if (!alive.current) return;
          setPlaylists((prev) => [...(prev ?? [likedCard()]), ...batch]);
        });
      } catch (e) {
        if (!alive.current) return;
        if (e instanceof AuthError) {
          onAuthLost("Sua sessão expirou. Entre de novo.");
          return;
        }
        // Losing the playlist listing must not hide the deck that works.
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      alive.current = false;
    };
  }, [onAuthLost]);

  const visible = useMemo(() => {
    if (!playlists) return [];
    const q = query.trim().toLowerCase();
    return q ? playlists.filter((p) => p.name.toLowerCase().includes(q)) : playlists;
  }, [playlists, query]);

  const chosen = useMemo(
    () => (playlists ?? []).filter((p) => selected.has(p.id)),
    [playlists, selected],
  );
  const totalTracks = chosen.reduce((sum, p) => sum + p.total, 0);

  /**
   * Counting every playlist up front used to fire dozens of requests at once and
   * got the whole session rate limited. The count is only needed for the playlists
   * actually picked, so it is fetched one at a time, on selection.
   */
  const countIfNeeded = (playlist: SpotifyPlaylist) => {
    if (playlist.total > 0 || playlist.id === LIKED_ID || counted.current.has(playlist.id)) return;
    counted.current.add(playlist.id);

    setCounting(true);
    void fetchPlaylistTotal(playlist.id)
      .then((total) => {
        if (!alive.current) return;
        setPlaylists((prev) =>
          prev ? prev.map((p) => (p.id === playlist.id ? { ...p, total } : p)) : prev,
        );
      })
      .catch((e) => {
        // the deck does not depend on this count — surface the reason and move on
        console.warn("[songless] contagem falhou", playlist.id, e);
        if (alive.current) setCountError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive.current) setCounting(false);
      });
  };

  const toggle = (playlist: SpotifyPlaylist) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(playlist.id) ? next.delete(playlist.id) : next.add(playlist.id);
      return next;
    });
    countIfNeeded(playlist);
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pb-32 pt-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Escolha as playlists</h1>
          <p className="mt-1 text-sm text-zinc-400">1 = só ela · 2+ = soma tudo (sem repetir faixa)</p>
        </div>
        <button className="btn-ghost px-4 py-2 text-xs" onClick={onSignOut}>
          Sair
        </button>
      </header>

      {error && (
        <p className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {loadError && (
        <p className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Não consegui listar suas playlists ({loadError}). Músicas Curtidas continua jogável.
        </p>
      )}

      {likedError && (
        <p className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Não consegui ler as Músicas Curtidas: {likedError}
        </p>
      )}

      {countError && (
        <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p>Não consegui ler as faixas: {countError}</p>
          <p className="mt-1 text-xs text-amber-200/80">
            Scopes concedidos: <code>{grantedScopes() || "(nenhum)"}</code>
          </p>
        </div>
      )}

      <Diagnostics />

      {playlists === null && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="card h-56 animate-pulse bg-ink-700/50" />
          ))}
        </div>
      )}

      {playlists !== null && playlists.length === 0 && (
        <p className="card p-6 text-zinc-400">Sua conta não tem playlists para jogar.</p>
      )}

      {playlists !== null && playlists.length > 0 && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar playlists…"
            className="mb-5 w-full rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-accent"
          />

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((playlist) => {
              const active = selected.has(playlist.id);
              return (
                <li key={playlist.id}>
                  <button
                    onClick={() => toggle(playlist)}
                    aria-pressed={active}
                    className={`card group w-full overflow-hidden p-3 text-left transition ${
                      active
                        ? "border-accent bg-accent/10 ring-2 ring-accent/60"
                        : "hover:border-zinc-600 hover:bg-ink-700"
                    }`}
                  >
                    <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-xl bg-ink-700">
                      {playlist.imageUrl ? (
                        <img
                          src={playlist.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className={`flex h-full w-full items-center justify-center text-4xl ${
                            playlist.id === LIKED_ID ? "bg-gradient-to-br from-accent/30 to-ink-700 text-accent" : "text-zinc-600"
                          }`}
                        >
                          {playlist.id === LIKED_ID ? "♥" : "♪"}
                        </div>
                      )}
                      {active && (
                        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-black">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M4 12.5 9.5 18 20 6.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm font-semibold">{playlist.name}</p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {playlist.total > 0
                        ? `${playlist.total} ${playlist.total === 1 ? "faixa" : "faixas"}`
                        : counting
                          ? "contando…"
                          : "? faixas"}
                      {playlist.owner ? ` · ${playlist.owner}` : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-ink-600 bg-ink-900/90 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <p className="text-sm text-zinc-400">
            {chosen.length === 0 ? (
              "Nenhuma playlist selecionada"
            ) : (
              <>
                <span className="font-semibold text-zinc-100">{chosen.length}</span>{" "}
                {chosen.length === 1 ? "playlist" : "playlists"} ·{" "}
                <span className="font-semibold text-zinc-100">{totalTracks}</span> faixas
                {counting && "…"}
              </>
            )}
          </p>
          <button
            className="btn-primary px-8"
            disabled={chosen.length === 0}
            onClick={() => onPlay(chosen)}
          >
            Jogar
          </button>
        </div>
      </div>
    </main>
  );
}
