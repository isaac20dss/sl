# Songless — das minhas playlists

Jogo estilo Songless: toca 1s de uma música, você adivinha; a cada erro/pulo o trecho cresce
(1 → 2 → 4 → 7 → 11 → 16s, 6 tentativas). O baralho vem das **suas playlists do Spotify**.

- Spotify: só login (OAuth PKCE), leitura de playlists e metadados.
- Áudio: prévia de 30s do **Deezer via ISRC**, com **iTunes Search** como reserva (`/api/preview`).
- Sem banco de dados, sem localStorage, sem client secret.

Spec completa em [SPEC.md](SPEC.md).

## 1. Setup no dashboard do Spotify

1. https://developer.spotify.com/dashboard → **Create app**.
2. Copie o **Client ID** (o Client Secret não é usado).
3. **Redirect URIs**:
   - dev: `http://127.0.0.1:5173/callback` (o Spotify não aceita mais `http://localhost`)
   - prod: `https://SEU-APP.vercel.app/callback`
4. **APIs used**: marque **Web API**.
5. **User Management**: adicione o e-mail Spotify de cada amigo (o app fica em modo dev, limite de 25 pessoas).

## 2. Rodar local

```bash
npm install
```

Preencha o `.env.local` na raiz:

```
VITE_SPOTIFY_CLIENT_ID=seu_client_id_aqui
VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
```

```bash
npm run dev
```

Abra **http://127.0.0.1:5173** (não use `localhost`, o redirect do Spotify quebra).
Em dev, `/api/preview` é servido por um middleware do Vite que usa exatamente o mesmo
resolvedor da função serverless — não precisa de `vercel dev`.

## 3. Deploy no Vercel

1. Importe o repositório no Vercel (framework: Vite; build `npm run build`; output `dist`).
2. Env vars do projeto:
   - `VITE_SPOTIFY_CLIENT_ID` = seu client id
   - `VITE_SPOTIFY_REDIRECT_URI` = `https://SEU-APP.vercel.app/callback`
3. Adicione essa mesma URL de callback nos Redirect URIs do app no Spotify.
4. `api/preview.ts` vira a função serverless automaticamente — não precisa de nenhuma env var.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Vite em `127.0.0.1:5173` + `/api/preview` local |
| `npm run build` | typecheck + build de produção em `dist/` |
| `npm run typecheck` | só o `tsc --noEmit` |
| `npm run preview` | serve o build (sem `/api`) |

## Estrutura

```
api/preview.ts        função serverless (Deezer → iTunes)
api/_resolve.ts       lógica compartilhada com o dev server
src/auth/             PKCE + cliente autenticado do Spotify
src/spotify/          leitura paginada de playlists e faixas
src/game/             tipos, baralho, resolver de prévia, áudio, máquina de estados
src/ui/               telas: login, seleção, preparo, rodada, revelação
```
