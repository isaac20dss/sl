let element: HTMLAudioElement | null = null;
let stopTimer: number | null = null;
let frame: number | null = null;

function audio(): HTMLAudioElement {
  if (!element) {
    element = new Audio();
    element.preload = "auto";
    // No crossOrigin: a media element plays CDN audio without CORS.
  }
  return element;
}

function clearTimers() {
  if (stopTimer !== null) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (frame !== null) {
    cancelAnimationFrame(frame);
    frame = null;
  }
}

/** Stops playback immediately and drops any pending stop timer. */
export function stop() {
  clearTimers();
  if (element) element.pause();
}

export interface PlayOptions {
  onTick?: (currentSeconds: number) => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

/**
 * Plays `url` from 0s and stops exactly at `seconds`.
 * Must be called from a user gesture (autoplay policy).
 */
export async function playSnippet(url: string, seconds: number, options: PlayOptions = {}) {
  const el = audio();
  clearTimers();

  if (el.src !== url) {
    el.src = url;
    el.load();
  }

  try {
    el.currentTime = 0;
  } catch {
    // metadata not loaded yet — playback still starts at 0
  }

  const finish = () => {
    clearTimers();
    el.pause();
    options.onEnd?.();
  };

  try {
    await el.play();
  } catch (error) {
    clearTimers();
    options.onError?.(error);
    return;
  }

  try {
    el.currentTime = 0;
  } catch {
    // ignore
  }

  stopTimer = window.setTimeout(finish, seconds * 1000);

  const tick = () => {
    if (el.currentTime >= seconds) {
      finish();
      return;
    }
    options.onTick?.(el.currentTime);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

/** Downloads the next preview so the round starts instantly. */
export function preload(url: string) {
  const el = new Audio();
  el.preload = "auto";
  el.src = url;
}
