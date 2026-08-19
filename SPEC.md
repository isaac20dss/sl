# Spec — Jogo "Songless" das minhas playlists do Spotify

> Documento de especificação para implementação via Claude Code.
> Coloque este arquivo na raiz do repositório (ou em `docs/SPEC.md`) e aponte o Claude Code pra ele.

---

## 1. Objetivo

Um web app (jogo) no estilo **Songless / lessgames**: toca um trecho curto de uma música
que vai aumentando de duração a cada erro/pulo, e o jogador tenta adivinhar qual é.

Diferença do original: o baralho de músicas vem das **minhas próprias playlists do Spotify**.
- Se eu selecionar **1** playlist → jogo aleatoriza só com ela.
- Se eu selecionar **2+** → soma todas as músicas e aleatoriza o conjunto (sem duplicar faixas repetidas entre playlists).
- Modo **ilimitado** (rodadas infinitas, não é "uma por dia").

---

## 2. Decisões já travadas (não reabrir)

| Tema | Decisão |
|------|---------|
| Fonte do áudio | **Prévia de 30s do Deezer via lookup por ISRC**, com **iTunes Search como reserva**. NÃO usar `preview_url` do Spotify (foi descontinuado para apps novos em 27/11/2024). |
| Papel do Spotify | Só **login (OAuth PKCE)**, **ler playlists** e pegar **metadados** (título, artista, capa, ISRC, id). Não toca áudio pelo Spotify. |
| Palpite | Busca com autocomplete **só dentro do pool selecionado** (filtro client-side, sem chamada de API por tecla). Comparação de acerto por **id da faixa**, não por texto. |
| Persistência | **Nenhuma.** Jogo puro. Sem banco de dados, sem localStorage de estatística, sem backend com estado. |
| Backend | **Uma única** função serverless (`/api/preview`) que resolve a prévia (Deezer → iTunes). Sem segredos/env keys. |
| Stack | React + Vite + TypeScript + Tailwind. Deploy estático + serverless no **Vercel**. |
| Auth | **Authorization Code + PKCE** (sem client secret, roda no navegador). |
| Tentativas | 6. |
| Escada de tempo | 1s → 2s → 4s → 7s → 11s → 16s (o trecho sempre começa em 0s). |
| Faixas sem prévia | São **descartadas** do baralho. Mostrar no fim do preparo um aviso: "X de Y ficaram de fora". |

---

## 3. Estrutura de pastas

```
songless-playlist/
├─ api/
│  └─ preview.ts            # função serverless (Vercel Node) — Deezer + iTunes
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx               # roteia entre as telas conforme o estado
│  ├─ auth/
│  │  ├─ pkce.ts            # geração de code_verifier/challenge, login, callback, refresh
│  │  └─ spotifyClient.ts   # fetch autenticado + refresh automático de token
│  ├─ spotify/
│  │  └─ playlists.ts       # GET /me/playlists e /playlists/{id}/tracks (paginado)
│  ├─ game/
│  │  ├─ types.ts           # Track, Pool, GameState, etc.
│  │  ├─ deck.ts            # merge, dedup, shuffle, avançar sem repetir
│  │  ├─ previewResolver.ts # chama /api/preview com cache em memória + prefetch
│  │  ├─ audio.ts           # tocar 0→Ns e parar exatamente
│  │  └─ machine.ts         # máquina de estados do jogo
│  └─ ui/
│     ├─ LoginScreen.tsx
│     ├─ PlaylistPicker.tsx
│     ├─ PreparingScreen.tsx
│     ├─ RoundScreen.tsx
│     └─ RevealScreen.tsx
├─ index.html
├─ .env.local              # só variáveis públicas (ver §5)
├─ vite.config.ts
├─ tailwind.config.js
└─ vercel.json             # opcional (rewrites do SPA)
```

---

## 4. Setup do app no Spotify (fazer antes de rodar)

1. Entrar em https://developer.spotify.com/dashboard e criar um app.
2. Copiar o **Client ID** (não precisa do Client Secret — PKCE não usa).
3. Em **Redirect URIs**, adicionar:
   - Dev local: `http://127.0.0.1:5173/callback`
     ⚠️ O Spotify **não aceita mais `http://localhost`** — use o IP `127.0.0.1` explicitamente. Rode o Vite com `--host 127.0.0.1`.
   - Produção: `https://SEU-APP.vercel.app/callback`
4. Em **APIs used**, marcar **Web API**.
5. O app fica em **modo desenvolvimento**: só até **25 pessoas** cadastradas conseguem logar.
   Em **User Management**, adicionar o e-mail Spotify de cada amigo que for jogar (e o seu).

Scopes necessários: `playlist-read-private playlist-read-collaborative`.

---

## 5. Variáveis de ambiente

Só variáveis **públicas** (PKCE não tem segredo). Em `.env.local` e nas env vars do Vercel:

```
VITE_SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxx
VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback   # trocar p/ a URL do Vercel em prod
```

A função `/api/preview` **não precisa de nenhuma env var** (Deezer e iTunes são APIs públicas).

---

## 6. Autenticação (PKCE) — contrato

Fluxo:
1. `login()`: gera `code_verifier` (aleatório, 64 chars) e `code_challenge = base64url(SHA-256(verifier))`. Guarda o verifier em `sessionStorage`. Redireciona para:
   ```
   https://accounts.spotify.com/authorize
     ?client_id=...&response_type=code&redirect_uri=...
     &scope=playlist-read-private%20playlist-read-collaborative
     &code_challenge_method=S256&code_challenge=...&state=<aleatório>
   ```
2. `/callback`: lê `code` da URL, valida `state`, troca por token em
   `POST https://accounts.spotify.com/api/token` com
   `grant_type=authorization_code, code, redirect_uri, client_id, code_verifier`.
   Guarda `access_token`, `refresh_token`, `expires_at`.
3. `refresh()`: `POST .../api/token` com `grant_type=refresh_token, refresh_token, client_id`.
4. `spotifyClient` intercepta 401 / token perto de expirar e faz refresh transparente; se o refresh falhar, volta pra tela de login.

Tokens ficam em memória + `sessionStorage` (some ao fechar a aba — coerente com "jogo puro").

### Referência — `src/auth/pkce.ts` (funções utilitárias)

```ts
const AUTH = "https://accounts.spotify.com";
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
const SCOPES = "playlist-read-private playlist-read-collaborative";

const rand = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)))
    .map((b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[b % 66])
    .join("");

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function login() {
  const verifier = rand(64);
  const state = rand(16);
  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("pkce_state", state);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const p = new URLSearchParams({
    client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT_URI,
    scope: SCOPES, code_challenge_method: "S256", code_challenge: challenge, state,
  });
  location.href = `${AUTH}/authorize?${p}`;
}

export async function handleCallback(): Promise<boolean> {
  const q = new URLSearchParams(location.search);
  const code = q.get("code");
  if (!code) return false;
  if (q.get("state") !== sessionStorage.getItem("pkce_state")) throw new Error("state mismatch");
  const verifier = sessionStorage.getItem("pkce_verifier")!;
  const r = await fetch(`${AUTH}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID, code_verifier: verifier,
    }),
  });
  const t = await r.json();
  saveTokens(t);              // access_token, refresh_token, expires_in
  history.replaceState({}, "", "/"); // limpa o ?code da URL
  return true;
}
```
(Implementar `saveTokens`, `getAccessToken` com refresh automático, e `refresh` seguindo o mesmo padrão.)

---

## 7. Leitura das playlists

- Listar: `GET https://api.spotify.com/v1/me/playlists?limit=50`, paginar seguindo `next`.
  Guardar: `id`, `name`, `images[0].url`, `tracks.total`.
- Ao confirmar a seleção, para cada playlist:
  `GET https://api.spotify.com/v1/playlists/{id}/tracks?limit=100&fields=next,items(track(id,name,is_local,external_ids(isrc),artists(name),album(images)))`,
  paginar seguindo `next`.
- De cada item, montar um `Track` (ver §8).
- **Descartar** faixas onde: `track` é `null` (removida), `is_local === true`, ou não tem `external_ids.isrc`.
- **Dedup** por `track.id` ao somar playlists.

---

## 8. Modelo de dados — `src/game/types.ts`

```ts
export interface Track {
  spotifyId: string;
  title: string;
  artist: string;         // artists.map(a => a.name).join(", ")
  albumImageUrl: string;  // usar uma imagem média/pequena
  isrc: string;
  previewUrl?: string;    // preenchido sob demanda por previewResolver
  previewSource?: "deezer" | "itunes";
  previewResolved?: boolean; // true mesmo quando não achou (pra não tentar de novo)
}

export type GameStatus =
  | "auth" | "selecting" | "preparing" | "playing" | "revealed";

export interface RoundState {
  track: Track;           // a resposta
  attempt: number;        // 0..5 (índice da tentativa atual)
  guesses: Array<{ type: "wrong" | "skip"; guessId?: string }>;
  outcome: "playing" | "won" | "lost";
}

export const LADDER = [1, 2, 4, 7, 11, 16]; // segundos por tentativa
export const MAX_ATTEMPTS = LADDER.length;   // 6
```

---

## 9. Função serverless — `api/preview.ts` (contrato + referência)

**Rota:** `GET /api/preview?isrc=USRC17607839&artist=Queen&title=Bohemian%20Rhapsody`
- `isrc` (obrigatório), `artist` + `title` (usados só no fallback iTunes).

**Resposta 200:** `{ "previewUrl": "https://cdns-preview-...mp3", "source": "deezer" }`
**Resposta 404:** `{ "error": "not_found" }` (nenhuma fonte tem prévia → o cliente descarta a faixa).

Detalhes:
- Deezer por ISRC: `GET https://api.deezer.com/track/isrc:${isrc}` → se `json.preview` for não-vazio, retornar (match exato da mesma gravação).
- Fallback iTunes: `GET https://itunes.apple.com/search?term=${artist} ${title}&entity=song&limit=5&country=BR` → escolher o resultado cujo `trackName`/`artistName` melhor casa (normalizando acento/caixa) e que tenha `previewUrl`.
- Sem CORS a resolver: a função é same-origin (`/api`). O `<audio>` toca a URL da prévia direto do CDN (media element não exige CORS).
- Cache: setar `Cache-Control: public, s-maxage=2592000, stale-while-revalidate=86400` (a prévia por ISRC é estável; evita rebater as APIs).

```ts
// api/preview.ts  (Vercel Node function, runtime node 18+)
import type { VercelRequest, VercelResponse } from "@vercel/node";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const isrc = String(req.query.isrc || "").trim();
  const artist = String(req.query.artist || "");
  const title = String(req.query.title || "");
  if (!isrc) return res.status(400).json({ error: "missing_isrc" });

  res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=86400");

  // 1) Deezer por ISRC (match exato)
  try {
    const d = await fetch(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`);
    const dj: any = await d.json();
    if (dj && dj.preview && !dj.error) {
      return res.status(200).json({ previewUrl: dj.preview, source: "deezer" });
    }
  } catch {}

  // 2) Fallback iTunes por artista + título
  try {
    const term = encodeURIComponent(`${artist} ${title}`.trim());
    const i = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=5&country=BR`);
    const ij: any = await i.json();
    const want = norm(title);
    const hit = (ij.results || []).find(
      (r: any) => r.previewUrl && (norm(r.trackName).includes(want) || want.includes(norm(r.trackName)))
    ) || (ij.results || []).find((r: any) => r.previewUrl);
    if (hit) return res.status(200).json({ previewUrl: hit.previewUrl, source: "itunes" });
  } catch {}

  return res.status(404).json({ error: "not_found" });
}
```

---

## 10. Resolução de prévia (lazy) — `src/game/previewResolver.ts`

- **Não** resolver o baralho inteiro no preparo (seria lento e tomaria rate limit). Embaralhar primeiro e resolver **sob demanda**.
- Antes de mostrar uma rodada, garantir a prévia da faixa atual **e** pré-carregar a próxima 1–2.
- Cache em memória por `spotifyId` (evita rebater `/api/preview`).
- Se `/api/preview` retornar 404, marcar a faixa como `previewResolved=true, previewUrl=undefined` e **pular** pra próxima do baralho embaralhado. Contabilizar em `descartadas` pra estatística do aviso.

---

## 11. Áudio — `src/game/audio.ts`

- Um único `<audio>` (ou `new Audio()`), `src = previewUrl`.
- Tocar o trecho: `audio.currentTime = 0; audio.play();` e agendar `setTimeout(() => audio.pause(), segundos * 1000)`.
- Guardar o timer e limpá-lo se o usuário clicar de novo / mudar de rodada (evitar tocar além do liberado).
- "Ouvir de novo" reproduz a duração **atualmente liberada** (LADDER[attempt]).
- Tratar `play()` rejeitado (autoplay policy): só tocar em resposta a clique do usuário (já é o caso — botão play).

---

## 12. Máquina de estados do jogo — `src/game/machine.ts`

```
auth ──login ok──▶ selecting
selecting ──confirma seleção (>=1 playlist)──▶ preparing
preparing ──baralho pronto (>=1 faixa com prévia)──▶ playing
preparing ──0 faixas com prévia──▶ selecting (com mensagem de erro)
playing ──acertou──▶ revealed(won)
playing ──6º erro/pulo──▶ revealed(lost)
revealed ──"Próxima"──▶ playing (próxima do baralho; reembaralha ao esgotar)
qualquer ──token inválido irrecuperável──▶ auth
```

Regras da rodada `playing`:
- Palpite certo = `guessId === round.track.spotifyId` → `won`.
- Palpite errado ou **pular** → registra em `guesses`, `attempt++`, libera `LADDER[attempt]`.
- Ao chegar em `attempt === MAX_ATTEMPTS` sem acertar → `lost`.
- "Próxima" pega o próximo índice do baralho embaralhado; quando acabar, reembaralha e recomeça (sem repetir a última pra não emendar igual).

---

## 13. Telas (UI)

1. **Login** — botão "Entrar com Spotify" → `login()`. Rota `/callback` chama `handleCallback()` e vai pra seleção.
2. **Seleção de playlists** — grid de cards (capa, nome, nº de faixas), multi-seleção (toggle). Rodapé com "Jogar" (habilitado com ≥1 selecionada). Texto: "1 = só ela · 2+ = soma tudo".
3. **Preparo** — carrega faixas das playlists, monta/dedup/embaralha o baralho, resolve as primeiras prévias. Barra/spinner de progresso. Ao terminar, se houve descartes, banner: "12 de 214 músicas ficaram de fora (sem prévia disponível)".
4. **Rodada** (ver mockup aprovado) — música misteriosa escondida; barra com marcadores 1/2/4/7/11/16s e o "tocando agora"; botão play; 6 slots de tentativa (errado=vermelho, atual=verde, restante=cinza); busca com autocomplete do pool; botões "Pular (+Xs)" e "Enviar palpite".
5. **Revelação** — capa + título + artista da faixa; "Acertou na Nª tentativa" ou "Não foi dessa vez"; botão "Próxima". (Opcional, volátil em memória: contador "acertos nesta sessão" — sem persistir.)

Estilo: escuro, acento verde (referência Spotify), mobile-first. Autocomplete filtra localmente por título/artista, mostra até ~8 sugestões, navegável por teclado.

---

## 14. Tratamento de erros

| Situação | Comportamento |
|----------|---------------|
| Token expira | Refresh transparente; se falhar, volta ao login. |
| Faixa sem ISRC / local file | Descartada na leitura da playlist. |
| `/api/preview` 404 | Faixa descartada do baralho, conta pro aviso, segue pra próxima. |
| Deezer/iTunes fora do ar / rate limit | `try/catch` na função → 404 daquela faixa; nunca trava o jogo. |
| Seleção sem nenhuma faixa com prévia | Volta pra seleção com mensagem clara. |
| `play()` bloqueado por autoplay | Só tocar em clique do usuário (já garantido pelo botão). |

---

## 15. Critérios de aceitação

- [ ] Login Spotify por PKCE funciona (sem client secret) local e em prod.
- [ ] Lista minhas playlists e deixa selecionar 1 ou várias.
- [ ] 1 playlist → baralho só dela; 2+ → soma e deduplica por id.
- [ ] Baralho é embaralhado; não repete faixa até esgotar.
- [ ] Trecho toca de 0s até a duração da tentativa e **para** exatamente; "ouvir de novo" respeita o tempo liberado.
- [ ] Escada 1/2/4/7/11/16s e 6 tentativas; pular gasta tentativa.
- [ ] Acerto comparado por id da faixa.
- [ ] Autocomplete filtra só o pool, client-side, sem chamada de API por tecla.
- [ ] Faixas sem prévia são descartadas e reportadas no aviso.
- [ ] Prévia via Deezer(ISRC)→iTunes, resolvida sob demanda com prefetch da próxima.
- [ ] Zero banco de dados, zero segredos em env. Deploy estático + 1 função no Vercel.
- [ ] Funciona no navegador do celular.

---

## 16. Fora de escopo (não implementar agora)

Ranking entre amigos, estatísticas persistidas, modo diário, busca no catálogo inteiro do Spotify,
integração com Web Playback SDK. (Ficam pra depois; a arquitetura sem banco facilita adicionar ranking no futuro.)

---

## 17. Prompt inicial sugerido para o Claude Code

> Implemente o projeto descrito em `SPEC.md`. Stack: React + Vite + TypeScript + Tailwind,
> deploy Vercel (estático + a função `api/preview.ts`). Siga as decisões travadas da §2 sem reabrir.
> Comece pela estrutura de pastas da §3, depois: (1) auth PKCE (§6), (2) leitura de playlists (§7),
> (3) função serverless de prévia (§9), (4) resolver + áudio + máquina de estados (§10–12),
> (5) as telas (§13). Use os critérios de aceitação da §15 como checklist. Não adicione banco de
> dados, segredos, nem nada da §16. Peça o `VITE_SPOTIFY_CLIENT_ID` quando for testar.
