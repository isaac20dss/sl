export interface Track {
  spotifyId: string;
  title: string;
  artist: string; // artists.map(a => a.name).join(", ")
  albumImageUrl: string; // medium/small album art
  isrc: string;
  previewUrl?: string; // filled on demand by previewResolver
  previewSource?: "deezer" | "itunes";
  previewResolved?: boolean; // true even when nothing was found (do not retry)
}

export type GameStatus = "auth" | "selecting" | "preparing" | "playing" | "revealed";

export interface Guess {
  type: "wrong" | "skip";
  guessId?: string;
}

export interface RoundState {
  track: Track; // the answer
  attempt: number; // 0..5 (index of the current attempt)
  guesses: Guess[];
  outcome: "playing" | "won" | "lost";
}

export const LADDER = [1, 2, 4, 7, 11, 16]; // seconds unlocked per attempt
export const MAX_ATTEMPTS = LADDER.length; // 6

/** Seconds unlocked for an attempt index, clamped to the last rung. */
export const unlockedSeconds = (attempt: number) =>
  LADDER[Math.min(Math.max(attempt, 0), LADDER.length - 1)];
