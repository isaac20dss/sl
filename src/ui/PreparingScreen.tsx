import type { PrepProgress } from "../game/machine";

export function PreparingScreen({ prep, onCancel }: { prep: PrepProgress; onCancel: () => void }) {
  const pct = prep.total > 0 ? Math.min(100, Math.round((prep.loaded / prep.total) * 100)) : 0;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="w-full animate-fade-up">
        <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-ink-500 border-t-accent" />

        <h2 className="text-lg font-semibold">Montando o baralho…</h2>
        <p className="mt-1 h-5 truncate text-sm text-zinc-400">{prep.label}</p>

        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-ink-700">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${prep.total > 0 ? pct : 15}%` }}
          />
        </div>

        {prep.total > 0 && (
          <p className="mt-2 text-xs text-zinc-500">
            {prep.loaded} de {prep.total} faixas
          </p>
        )}

        <button className="btn-ghost mt-8 px-6 py-2 text-xs" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </main>
  );
}
