import { useState } from "react";
import { CLIENT_ID, REDIRECT_URI, getAccessToken, grantedScopes } from "../auth/pkce";

interface Line {
  label: string;
  value: string;
  ok?: boolean;
}

/**
 * On-screen check of the Spotify setup: which scopes the token actually carries
 * and what the API answers for each endpoint the game needs.
 */
export function Diagnostics() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run() {
    setRunning(true);
    setCopied(false);
    const out: Line[] = [];
    const push = (label: string, value: string, ok?: boolean) => out.push({ label, value, ok });

    try {
      const token = await getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const call = async (url: string) => {
        const res = await fetch(url, { headers });
        let body: any = null;
        try {
          body = await res.json();
        } catch {
          /* empty body */
        }
        return { status: res.status, msg: res.ok ? "" : (body?.error?.message ?? ""), body };
      };

      const scopes = grantedScopes();
      push("Client ID", CLIENT_ID ? `${CLIENT_ID.slice(0, 6)}…${CLIENT_ID.slice(-4)}` : "(vazio)", !!CLIENT_ID);
      push("Redirect URI", REDIRECT_URI);
      push("Scopes concedidos", scopes || "(NENHUM)", scopes.includes("playlist-read-private"));

      const me = await call("https://api.spotify.com/v1/me");
      push("GET /me", `${me.status}${me.msg ? ` — ${me.msg}` : ""}`, me.status === 200);
      if (me.status === 200) push("Conta logada", `${me.body?.display_name ?? "?"} · ${me.body?.country ?? "?"}`);

      const lists = await call("https://api.spotify.com/v1/me/playlists?limit=10");
      push(
        "GET /me/playlists",
        `${lists.status}${lists.msg ? ` — ${lists.msg}` : ""} · ${lists.body?.items?.length ?? 0} itens`,
        lists.status === 200,
      );

      const items: any[] = lists.body?.items ?? [];
      const target = items.find((p) => p?.public) ?? items.find((p) => p?.id);

      if (target) {
        push(
          "Playlist testada",
          `${target.name} · ${target.public ? "PÚBLICA" : "privada"} · dono ${target.owner?.display_name ?? "?"}`,
        );
        push("tracks.total no resumo", String(target.tracks?.total ?? "(campo ausente)"));

        const tracks = await call(`https://api.spotify.com/v1/playlists/${target.id}/tracks?limit=1`);
        push(
          "GET /playlists/{id}/tracks",
          `${tracks.status}${tracks.msg ? ` — ${tracks.msg}` : ""}`,
          tracks.status === 200,
        );
        if (tracks.status === 200) push("Total real de faixas", String(tracks.body?.total ?? "?"));
      } else {
        push("Playlist testada", "(nenhuma playlist retornada)", false);
      }

      // Plano B: Musicas Curtidas usam outro endpoint, fora da familia /playlists.
      const liked = await call("https://api.spotify.com/v1/me/tracks?limit=1");
      push(
        "GET /me/tracks (curtidas)",
        `${liked.status}${liked.msg ? ` — ${liked.msg}` : ` · ${liked.body?.total ?? "?"} curtidas`}`,
        liked.status === 200,
      );
    } catch (e) {
      push("Falhou", e instanceof Error ? e.message : String(e), false);
    }

    setLines(out);
    setRunning(false);
  }

  const asText = (lines ?? []).map((l) => `${l.label}: ${l.value}`).join("\n");

  return (
    <section className="mb-6 rounded-xl border border-ink-600 bg-ink-800/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-ghost px-4 py-2 text-xs" onClick={() => void run()} disabled={running}>
          {running ? "Testando…" : "Rodar diagnóstico do Spotify"}
        </button>
        {lines && (
          <button
            className="btn-ghost px-4 py-2 text-xs"
            onClick={() => {
              void navigator.clipboard.writeText(asText);
              setCopied(true);
            }}
          >
            {copied ? "Copiado" : "Copiar resultado"}
          </button>
        )}
        <span className="text-xs text-zinc-500">Mostra scopes e o que a API responde</span>
      </div>

      {lines && (
        <dl className="mt-4 space-y-1 font-mono text-xs">
          {lines.map((line, i) => (
            <div key={i} className="flex flex-wrap gap-x-2 border-b border-ink-700 pb-1">
              <dt className="text-zinc-500">{line.label}:</dt>
              <dd
                className={
                  line.ok === undefined ? "text-zinc-300" : line.ok ? "text-accent" : "text-red-400"
                }
              >
                {line.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
