/**
 * Kiosk fullscreen helper. Requests fullscreen and locks the Escape key so it reaches the
 * page instead of exiting fullscreen, then watches for the station dropping out of fullscreen
 * (a hardware Esc, Alt+F4, an attached keyboard, ...) and re-enters on the next user gesture.
 * Every call is feature-detected and wrapped so it is a no-op in jsdom and never throws.
 */

async function lockEscape(): Promise<void> {
  try {
    await (navigator as unknown as { keyboard?: { lock?: (keys: string[]) => Promise<void> } }).keyboard?.lock?.([
      'Escape',
    ]);
  } catch {
    // Keyboard Lock is optional (desktop Chromium only); holding Esc still exits without it.
  }
}

/** Requests fullscreen, then locks Escape. Safe to call from anywhere; never throws or rejects. */
export async function enterFullscreen(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen?.();
  } catch {
    return; // not available, denied, or no user gesture: leave fullscreen as-is
  }
  await lockEscape();
}

/**
 * Starts watching for an unexpected fullscreen exit and re-requests it (plus the Escape lock)
 * on the next pointerdown/keydown, which browsers accept as the required user gesture.
 */
export function watchFullscreen(): void {
  let wantsFullscreen = false;
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) wantsFullscreen = true;
  });
  const retry = () => {
    if (!wantsFullscreen) return;
    wantsFullscreen = false;
    void enterFullscreen().catch(() => {});
  };
  window.addEventListener('pointerdown', retry);
  window.addEventListener('keydown', retry);
}
