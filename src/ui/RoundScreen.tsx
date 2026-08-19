import { useEffect, useMemo, useRef, useState } from "react";
import { playSnippet, stop } from "../game/audio";
import { LADDER, MAX_ATTEMPTS, unlockedSeconds, type RoundState, type Track } from "../game/types";
import { filterTracks } from "./search";

interface Props {
  round: RoundState;
  pool: Track[];
  wins: number;
  rounds: number;
  droppedNote?: string;
  onGuess: (trackId: string) => void;
  onSkip: () => void;
  onQuit: () => void;
}

const TOTAL = LADDER[LADDER.length - 1]; // 16s — the full bar

export function RoundScreen({ round, pool, wins, rounds, droppedNote, onGuess, onSkip, onQuit }: Props) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Track | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [playedOnce, setPlayedOnce] = useState(false);
  const [audioError, setAudioError] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const unlocked = unlockedSeconds(round.attempt);

  // New round: reset everything and kill any audio still running.
  useEffect(() => {
    setQuery("");
    setPicked(null);
    setOpen(false);
    setHighlight(0);
    setPlaying(false);
    setPlayhead(0);
    setPlayedOnce(false);
    setAudioError(false);
    return () => stop();
  }, [round.track.spotifyId]);

  // A new attempt unlocks more time — stop whatever was playing.
  useEffect(() => {
    stop();
    setPlaying(false);
    setPlayhead(0);
  }, [round.attempt]);

  const alreadyGuessed = useMemo(
    () => new Set(round.guesses.map((g) => g.guessId).filter(Boolean) as string[]),
    [round.guesses],
  );

  const suggestions = useMemo(
    () => (picked ? [] : filterTracks(pool, query, alreadyGuessed)),
    [pool, query, picked, alreadyGuessed],
  );

  const play = () => {
    if (playing) {
      stop();
      setPlaying(false);
      return;
    }
    const url = round.track.previewUrl;
    if (!url) return;
    setAudioError(false);
    setPlaying(true);
    setPlayedOnce(true);
    void playSnippet(url, unlocked, {
      onTick: setPlayhead,
      onEnd: () => {
        setPlaying(false);
        setPlayhead(0);
      },
      onError: () => {
        setPlaying(false);
        setAudioError(true);
      },
    });
  };

  const choose = (track: Track) => {
    setPicked(track);
    setQuery(`${track.title} — ${track.artist}`);
    setOpen(false);
    inputRef.current?.blur();
  };

  const submit = () => {
    if (!picked) return;
    stop();
    onGuess(picked.spotifyId);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!open || suggestions.length === 0) return;
      e.preventDefault();
      setHighlight((h) => {
        const delta = e.key === "ArrowDown" ? 1 : -1;
        return (h + delta + suggestions.length) % suggestions.length;
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && suggestions.length > 0) choose(suggestions[highlight] ?? suggestions[0]);
      else if (picked) submit();
      return;
    }
    if (e.key === "Escape") setOpen(false);
  };

  const skipDelta =
    round.attempt < MAX_ATTEMPTS - 1
      ? unlockedSeconds(round.attempt + 1) - unlocked
      : 0;

  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col px-4 pb-8 pt-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onQuit}>
          ← Playlists
        </button>
        <div className="text-right text-xs text-zinc-500">
          <p>
            Acertos: <span className="font-semibold text-accent">{wins}</span>/{rounds}
          </p>
          <p>{pool.length} músicas no baralho</p>
        </div>
      </header>

      {/* Mystery card */}
      <section className="card mb-5 flex items-center gap-4 p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-ink-700 text-3xl text-zinc-600">
          <span className={playing ? "animate-pulse-ring" : ""}>♪</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-zinc-300">Música misteriosa</p>
          <p className="truncate text-sm text-zinc-500">
            Tentativa {Math.min(round.attempt + 1, MAX_ATTEMPTS)} de {MAX_ATTEMPTS} · {unlocked}s
            liberados
          </p>
        </div>
      </section>

      {/* Ladder bar */}
      <section className="mb-4">
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-700">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent/25 transition-[width] duration-300"
            style={{ width: `${(unlocked / TOTAL) * 100}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            style={{ width: `${(Math.min(playhead, unlocked) / TOTAL) * 100}%` }}
          />
          {LADDER.slice(0, -1).map((sec) => (
            <span
              key={sec}
              className="absolute inset-y-0 w-px bg-ink-900/80"
              style={{ left: `${(sec / TOTAL) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
          {LADDER.map((sec) => (
            <span key={sec} className={sec <= unlocked ? "text-accent" : undefined}>
              {sec}s
            </span>
          ))}
        </div>
      </section>

      {/* Play */}
      <section className="mb-5 flex flex-col items-center gap-2">
        <button
          onClick={play}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-black shadow-lg shadow-accent/20 transition hover:bg-accent-soft active:scale-95"
          aria-label={playing ? "Parar" : "Tocar trecho"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-1 h-9 w-9" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13l11-6.5-11-6.5z" />
            </svg>
          )}
        </button>
        <p className="text-xs text-zinc-500">
          {playing ? `Tocando ${unlocked}s…` : playedOnce ? `Ouvir de novo (${unlocked}s)` : `Tocar ${unlocked}s`}
        </p>
        {audioError && (
          <p className="text-xs text-red-300">Não consegui tocar essa prévia. Tente pular a faixa.</p>
        )}
      </section>

      {/* Attempt slots */}
      <section className="mb-5">
        <div className="flex gap-1.5">
          {Array.from({ length: MAX_ATTEMPTS }, (_, i) => {
            const guess = round.guesses[i];
            const isCurrent = i === round.attempt && round.outcome === "playing";
            const color = guess
              ? guess.type === "skip"
                ? "bg-zinc-500"
                : "bg-red-500"
              : isCurrent
                ? "bg-accent"
                : "bg-ink-600";
            return <span key={i} className={`h-1.5 flex-1 rounded-full ${color}`} />;
          })}
        </div>
        {round.guesses.length > 0 && (
          <ul className="mt-3 space-y-1">
            {round.guesses.map((guess, i) => {
              const track = guess.guessId ? pool.find((t) => t.spotifyId === guess.guessId) : undefined;
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-ink-800/70 px-3 py-2 text-xs text-zinc-400"
                >
                  <span className={guess.type === "skip" ? "text-zinc-500" : "text-red-400"}>
                    {guess.type === "skip" ? "↷" : "✕"}
                  </span>
                  <span className="truncate">
                    {guess.type === "skip"
                      ? "Pulou"
                      : track
                        ? `${track.title} — ${track.artist}`
                        : "Palpite errado"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Guess input */}
      <section className="relative mt-auto">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Digite o nome da música ou do artista…"
          className="w-full rounded-xl border border-ink-600 bg-ink-800 px-4 py-3.5 text-sm outline-none placeholder:text-zinc-500 focus:border-accent"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-autocomplete="list"
        />

        {open && suggestions.length > 0 && (
          <ul className="absolute bottom-full z-10 mb-2 max-h-72 w-full overflow-y-auto rounded-xl border border-ink-600 bg-ink-800 shadow-2xl">
            {suggestions.map((track, i) => (
              <li key={track.spotifyId}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(track)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                    i === highlight ? "bg-ink-600" : "hover:bg-ink-700"
                  }`}
                >
                  {track.albumImageUrl && (
                    <img src={track.albumImageUrl} alt="" className="h-9 w-9 rounded object-cover" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{track.title}</span>
                    <span className="block truncate text-xs text-zinc-500">{track.artist}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => { stop(); onSkip(); }}>
            {skipDelta > 0 ? `Pular (+${skipDelta}s)` : "Pular"}
          </button>
          <button className="btn-primary flex-1" disabled={!picked} onClick={submit}>
            Enviar palpite
          </button>
        </div>

        {droppedNote && <p className="mt-3 text-center text-[11px] text-zinc-600">{droppedNote}</p>}
      </section>
    </main>
  );
}
