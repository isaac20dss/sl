import { useEffect, useState } from "react";
import { AuthError, handleCallback, isLoggedIn, logout } from "./auth/pkce";
import { useGame } from "./game/machine";
import { LoginScreen } from "./ui/LoginScreen";
import { PlaylistPicker } from "./ui/PlaylistPicker";
import { PreparingScreen } from "./ui/PreparingScreen";
import { RevealScreen } from "./ui/RevealScreen";
import { RoundScreen } from "./ui/RoundScreen";

// Module scope: survives StrictMode's double effect in dev, so the
// authorization code is never exchanged twice.
let bootStarted = false;

const AUTH_MESSAGES: Record<string, string> = {
  access_denied: "Você cancelou o login do Spotify.",
  state_mismatch: "Login inválido (state não confere). Tente de novo.",
  missing_verifier: "Sessão de login perdida. Tente de novo.",
};

export default function App() {
  const { state, actions } = useGame();
  const [booting, setBooting] = useState(true);
  const [authError, setAuthError] = useState<string>();

  useEffect(() => {
    if (bootStarted) return;
    bootStarted = true;

    (async () => {
      try {
        const params = new URLSearchParams(location.search);
        const isCallback =
          location.pathname === "/callback" || params.has("code") || params.has("error");

        if (isCallback) {
          const ok = await handleCallback();
          if (ok) actions.authOk();
          else history.replaceState({}, "", "/");
        } else if (isLoggedIn()) {
          actions.authOk();
        }
      } catch (error) {
        logout();
        const code = error instanceof AuthError ? error.message : "";
        setAuthError(AUTH_MESSAGES[code] ?? "Não consegui concluir o login. Tente de novo.");
      } finally {
        setBooting(false);
      }
    })();
  }, [actions]);

  if (booting) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-ink-500 border-t-accent" />
      </div>
    );
  }

  const totalDropped = state.droppedMeta + state.droppedNoPreview;
  const droppedNote =
    totalDropped > 0 && state.totalUnique > 0
      ? `${totalDropped} de ${state.totalUnique} músicas ficaram de fora (sem prévia disponível).`
      : undefined;

  switch (state.status) {
    case "selecting":
      return (
        <PlaylistPicker
          error={state.error}
          onPlay={(playlists) => void actions.start(playlists)}
          onAuthLost={actions.authLost}
          onSignOut={() => {
            logout();
            actions.authLost();
          }}
        />
      );

    case "preparing":
      return <PreparingScreen prep={state.prep} onCancel={actions.backToSelect} />;

    case "playing":
      return (
        <RoundScreen
          round={state.round!}
          pool={state.deck}
          wins={state.wins}
          rounds={state.rounds}
          droppedNote={droppedNote}
          onGuess={actions.guess}
          onSkip={actions.skip}
          onQuit={actions.backToSelect}
        />
      );

    case "revealed":
      return (
        <RevealScreen
          round={state.round!}
          wins={state.wins}
          rounds={state.rounds}
          advancing={state.advancing}
          droppedNote={droppedNote}
          onNext={actions.next}
          onQuit={actions.backToSelect}
        />
      );

    default:
      return <LoginScreen error={state.error ?? authError} />;
  }
}
