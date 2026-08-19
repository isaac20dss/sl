import { CONFIG_OK, REDIRECT_URI, login } from "../auth/pkce";

export function LoginScreen({ error }: { error?: string }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      <div className="animate-fade-up">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-accent text-black shadow-lg shadow-accent/20">
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor" aria-hidden>
            <path d="M9 4v10.6A3.5 3.5 0 1 0 11 18V9.2l7-1.6V4L9 6z" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">Songless</h1>
        <p className="mt-2 text-balance text-zinc-400">
          Adivinhe a música ouvindo 1 segundo. Erre e ganhe mais tempo. O baralho vem das
          <span className="text-zinc-200"> suas playlists do Spotify</span>.
        </p>

        {error && (
          <p className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}

        {CONFIG_OK ? (
          <button className="btn-primary mt-8 w-full py-4 text-base" onClick={() => void login()}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.8.8 0 0 1-1.1.3c-3-1.8-6.7-2.2-11.1-1.2a.8.8 0 1 1-.3-1.5c4.8-1.1 9-.6 12.3 1.4.4.2.5.7.2 1zm1.2-2.8a1 1 0 0 1-1.3.3c-3.4-2.1-8.6-2.7-12.6-1.5a1 1 0 1 1-.6-1.9c4.6-1.4 10.3-.7 14.2 1.7.5.3.6 1 .3 1.4zm.1-2.9C14 8.2 7.7 8 4.3 9a1.2 1.2 0 1 1-.7-2.3C7.6 5.5 14.5 5.7 19 8.4a1.2 1.2 0 1 1-1.2 2z" />
            </svg>
            Entrar com Spotify
          </button>
        ) : (
          <div className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-left text-sm text-amber-100">
            <p className="font-semibold">Falta configurar o Client ID.</p>
            <p className="mt-2 text-amber-200/90">
              Crie <code className="rounded bg-black/40 px-1">.env.local</code> na raiz com:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-black/50 p-3 text-xs text-amber-100">
{`VITE_SPOTIFY_CLIENT_ID=seu_client_id
VITE_SPOTIFY_REDIRECT_URI=${REDIRECT_URI}`}
            </pre>
            <p className="mt-2 text-amber-200/90">Depois reinicie o servidor de dev.</p>
          </div>
        )}

        <p className="mt-6 text-xs text-zinc-500">
          Só leitura das suas playlists. Nada é salvo: fechou a aba, acabou a sessão.
        </p>
      </div>
    </main>
  );
}
