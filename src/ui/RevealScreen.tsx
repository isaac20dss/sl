import { useEffect, useState } from "react";
import { playSnippet, stop } from "../game/audio";
import type { RoundState } from "../game/types";

interface Props {
  round: RoundState;
  wins: number;
  rounds: number;
  advancing: boolean;
  droppedNote?: string;
  onNext: () => void;
  onQuit: () => void;
}

export function RevealScreen({ round, wins, rounds, advancing, droppedNote, onNext, onQuit }: Props) {
  const [playing, setPlaying] = useState(false);
  const won = round.outcome === "won";
  const { track } = round;

  useEffect(() => () => stop(), []);

  const playFull = () => {
    if (playing) {
      stop();
      setPlaying(false);
      return;
    }
    if (!track.previewUrl) return;
    setPlaying(true);
    void playSnippet(track.previewUrl, 30, {
      onEnd: () => setPlaying(false),
      onError: () => setPlaying(false),
    });
  };

  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-4 py-8">
      <div className="animate-fade-up">
        <p
          className={`mb-4 text-center text-sm font-semibold uppercase tracking-widest ${
            won ? "text-accent" : "text-red-400"
          }`}
        >
          {won ? `Acertou na ${round.attempt + 1}ª tentativa` : "Não foi dessa vez"}
        </p>

        <div className="card overflow-hidden">
          {track.albumImageUrl ? (
            <img src={track.albumImageUrl} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center text-6xl text-zinc-700">
              ♪
            </div>
          )}
          <div className="p-5">
            <h2 className="text-xl font-bold leading-tight">{track.title}</h2>
            <p className="mt-1 text-zinc-400">{track.artist}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className="btn-ghost px-4 py-2 text-xs" onClick={playFull}>
                {playing ? "Parar" : "Ouvir a prévia inteira"}
              </button>
              <a
                className="btn-ghost px-4 py-2 text-xs"
                href={`https://open.spotify.com/track/${track.spotifyId}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir no Spotify
              </a>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-500">
          Acertos nesta sessão: <span className="font-semibold text-accent">{wins}</span> de {rounds}
        </p>

        <button className="btn-primary mt-5 w-full py-4 text-base" disabled={advancing} onClick={onNext}>
          {advancing ? "Carregando…" : "Próxima"}
        </button>

        <button className="btn-ghost mt-2 w-full py-2 text-xs" onClick={onQuit}>
          Trocar de playlists
        </button>

        {droppedNote && <p className="mt-4 text-center text-[11px] text-zinc-600">{droppedNote}</p>}
      </div>
    </main>
  );
}
