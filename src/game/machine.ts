import { useCallback, useEffect, useReducer, useRef } from "react";
import { AuthError, logout as clearSession } from "../auth/pkce";
import {
  LIKED_ID,
  fetchLikedTracks,
  fetchPlaylistTracks,
  type SpotifyPlaylist,
} from "../spotify/playlists";
import { preload, stop as stopAudio } from "./audio";
import { dedupById, reshuffle, shuffle } from "./deck";
import { ensurePreview, prefetch } from "./previewResolver";
import { MAX_ATTEMPTS, type GameStatus, type RoundState, type Track } from "./types";

export interface PrepProgress {
  label: string;
  loaded: number;
  total: number;
}

export interface GameState {
  status: GameStatus;
  deck: Track[];
  deckIndex: number;
  round: RoundState | null;
  advancing: boolean;
  /** Unique tracks found across the selected playlists (before any filtering). */
  totalUnique: number;
  /** Dropped while reading the playlists: local files, no ISRC, removed tracks. */
  droppedMeta: number;
  /** Dropped at play time: no preview on Deezer nor iTunes. */
  droppedNoPreview: number;
  wins: number;
  rounds: number;
  prep: PrepProgress;
  error?: string;
}

type Action =
  | { type: "AUTH_OK" }
  | { type: "AUTH_LOST"; error?: string }
  | { type: "BACK_TO_SELECT"; error?: string }
  | { type: "PREPARE_START" }
  | { type: "PREPARE_PROGRESS"; prep: Partial<PrepProgress> }
  | { type: "DECK_READY"; deck: Track[]; totalUnique: number; droppedMeta: number }
  | { type: "ADVANCING"; advancing: boolean }
  | { type: "DROPPED_NO_PREVIEW" }
  | { type: "SET_DECK"; deck: Track[] }
  | { type: "ROUND_START"; track: Track; deckIndex: number }
  | { type: "GUESS_WRONG"; guessId: string }
  | { type: "GUESS_RIGHT" }
  | { type: "SKIP" };

const emptyPrep: PrepProgress = { label: "", loaded: 0, total: 0 };

const initialState: GameState = {
  status: "auth",
  deck: [],
  deckIndex: 0,
  round: null,
  advancing: false,
  totalUnique: 0,
  droppedMeta: 0,
  droppedNoPreview: 0,
  wins: 0,
  rounds: 0,
  prep: emptyPrep,
};

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "AUTH_OK":
      return { ...state, status: "selecting", error: undefined };

    case "AUTH_LOST":
      return { ...initialState, status: "auth", error: action.error };

    case "BACK_TO_SELECT":
      return {
        ...state,
        status: "selecting",
        deck: [],
        deckIndex: 0,
        round: null,
        advancing: false,
        prep: emptyPrep,
        error: action.error,
      };

    case "PREPARE_START":
      return {
        ...state,
        status: "preparing",
        error: undefined,
        deck: [],
        deckIndex: 0,
        round: null,
        droppedNoPreview: 0,
        prep: { label: "Lendo suas playlists…", loaded: 0, total: 0 },
      };

    case "PREPARE_PROGRESS":
      return { ...state, prep: { ...state.prep, ...action.prep } };

    case "DECK_READY":
      return {
        ...state,
        deck: action.deck,
        deckIndex: 0,
        totalUnique: action.totalUnique,
        droppedMeta: action.droppedMeta,
      };

    case "SET_DECK":
      return { ...state, deck: action.deck, deckIndex: 0 };

    case "ADVANCING":
      return { ...state, advancing: action.advancing };

    case "DROPPED_NO_PREVIEW":
      return { ...state, droppedNoPreview: state.droppedNoPreview + 1 };

    case "ROUND_START":
      return {
        ...state,
        status: "playing",
        advancing: false,
        deckIndex: action.deckIndex,
        rounds: state.rounds + 1,
        round: { track: action.track, attempt: 0, guesses: [], outcome: "playing" },
      };

    case "GUESS_RIGHT": {
      const round = state.round;
      if (!round || round.outcome !== "playing") return state;
      return {
        ...state,
        status: "revealed",
        wins: state.wins + 1,
        round: { ...round, outcome: "won" },
      };
    }

    case "GUESS_WRONG":
    case "SKIP": {
      const round = state.round;
      if (!round || round.outcome !== "playing") return state;

      const guesses = [
        ...round.guesses,
        action.type === "SKIP"
          ? ({ type: "skip" } as const)
          : ({ type: "wrong", guessId: action.guessId } as const),
      ];
      const attempt = round.attempt + 1;
      const lost = attempt >= MAX_ATTEMPTS;

      return {
        ...state,
        status: lost ? "revealed" : "playing",
        round: { ...round, guesses, attempt, outcome: lost ? "lost" : "playing" },
      };
    }

    default:
      return state;
  }
}

export function useGame() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Async work reads the freshest state through this ref.
  const stateRef = useRef(state);
  stateRef.current = state;

  const runId = useRef(0); // invalidates in-flight work when the user backs out

  useEffect(() => () => stopAudio(), []);

  const handleFailure = useCallback((error: unknown, fallback: string) => {
    if (error instanceof AuthError) {
      clearSession();
      dispatch({ type: "AUTH_LOST", error: "Sua sessão expirou. Entre de novo." });
      return;
    }
    dispatch({ type: "BACK_TO_SELECT", error: fallback });
  }, []);

  /**
   * Walks the shuffled deck from `fromIndex`, resolving previews on demand,
   * and starts a round on the first track that has one.
   */
  const advance = useCallback(
    async (deck: Track[], fromIndex: number, lastTrack?: Track) => {
      const myRun = ++runId.current;
      dispatch({ type: "ADVANCING", advancing: true });
      stopAudio();

      let currentDeck = deck;
      let index = fromIndex;
      let reshuffled = false;

      while (runId.current === myRun) {
        if (index >= currentDeck.length) {
          if (reshuffled) break; // a whole lap without a single preview
          reshuffled = true;
          currentDeck = reshuffle(currentDeck, lastTrack);
          index = 0;
          if (currentDeck.length === 0) break;
          dispatch({ type: "SET_DECK", deck: currentDeck });
          continue;
        }

        const track = currentDeck[index];
        await ensurePreview(track);

        if (track.previewUrl) {
          if (runId.current !== myRun) return;
          dispatch({ type: "ROUND_START", track, deckIndex: index + 1 });

          const upcoming = currentDeck.slice(index + 1, index + 3);
          prefetch(upcoming);
          const ready = upcoming.find((t) => t.previewUrl);
          if (ready?.previewUrl) preload(ready.previewUrl);
          return;
        }

        dispatch({ type: "DROPPED_NO_PREVIEW" });
        index++;
      }

      if (runId.current !== myRun) return;
      dispatch({
        type: "BACK_TO_SELECT",
        error: "Nenhuma faixa dessas playlists tem prévia disponível. Tente outra seleção.",
      });
    },
    [],
  );

  /** Reads the selected playlists, builds the deck and starts the first round. */
  const start = useCallback(
    async (playlists: SpotifyPlaylist[]) => {
      const myRun = ++runId.current;
      dispatch({ type: "PREPARE_START" });

      try {
        const lists: Track[][] = [];
        let seenTotal = 0;
        const totalTracks = playlists.reduce((sum, p) => sum + p.total, 0);
        let loaded = 0;

        for (const [i, playlist] of playlists.entries()) {
          dispatch({
            type: "PREPARE_PROGRESS",
            prep: {
              label: `Lendo "${playlist.name}" (${i + 1}/${playlists.length})`,
              total: totalTracks,
            },
          });

          const base = loaded;
          const onPage = (n: number) =>
            dispatch({ type: "PREPARE_PROGRESS", prep: { loaded: base + n } });

          const { tracks, seen } =
            playlist.id === LIKED_ID
              ? await fetchLikedTracks(onPage)
              : await fetchPlaylistTracks(playlist.id, onPage);

          if (runId.current !== myRun) return;
          lists.push(tracks);
          seenTotal += seen;
          loaded = base + tracks.length;
        }

        const pool = dedupById(lists);
        const uniqueSeen = Math.max(seenTotal, pool.length);
        const droppedMeta = Math.max(uniqueSeen - pool.length, 0);

        if (pool.length === 0) {
          dispatch({
            type: "BACK_TO_SELECT",
            error: "Essas playlists não têm nenhuma faixa utilizável (sem ISRC ou só arquivos locais).",
          });
          return;
        }

        const deck = shuffle(pool);
        dispatch({ type: "DECK_READY", deck, totalUnique: uniqueSeen, droppedMeta });
        dispatch({
          type: "PREPARE_PROGRESS",
          prep: { label: "Procurando a prévia da primeira música…", loaded: deck.length, total: deck.length },
        });

        await advance(deck, 0);
      } catch (error) {
        if (runId.current !== myRun) return;
        handleFailure(error, "Não consegui ler as playlists. Tente de novo.");
      }
    },
    [advance, handleFailure],
  );

  const guess = useCallback((trackId: string) => {
    const { round } = stateRef.current;
    if (!round || round.outcome !== "playing") return;
    if (trackId === round.track.spotifyId) {
      stopAudio();
      dispatch({ type: "GUESS_RIGHT" });
    } else {
      dispatch({ type: "GUESS_WRONG", guessId: trackId });
    }
  }, []);

  const skip = useCallback(() => {
    const { round } = stateRef.current;
    if (!round || round.outcome !== "playing") return;
    stopAudio();
    dispatch({ type: "SKIP" });
  }, []);

  const next = useCallback(() => {
    const { deck, deckIndex, round } = stateRef.current;
    void advance(deck, deckIndex, round?.track);
  }, [advance]);

  const backToSelect = useCallback(() => {
    runId.current++;
    stopAudio();
    dispatch({ type: "BACK_TO_SELECT" });
  }, []);

  const authOk = useCallback(() => dispatch({ type: "AUTH_OK" }), []);

  const authLost = useCallback((error?: string) => {
    runId.current++;
    stopAudio();
    clearSession();
    dispatch({ type: "AUTH_LOST", error });
  }, []);

  return { state, actions: { start, guess, skip, next, backToSelect, authOk, authLost } };
}

export type GameActions = ReturnType<typeof useGame>["actions"];
