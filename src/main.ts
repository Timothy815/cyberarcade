import '@fontsource/audiowide/400.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles/base.css';
import './styles/screens.css';
import './hub/hub.css';
import './games/phish/phish.css';
import './games/password/password.css';

import { createAudio } from './core/audio';
import { watchFullscreen } from './core/fullscreen';
import { createInput, isTextEntry } from './core/input';
import { createScores } from './core/scores';
import { createShell } from './core/shell';
import { applyTheme } from './core/theme';
import { el } from './core/ui/dom';
import { createMuteIndicator } from './core/ui/mute-indicator';
import { getCabinets } from './games/registry';
import { createBackground } from './hub/background';
import { createHub } from './hub/hub';
import { showSplash } from './hub/splash';

declare global {
  interface Window {
    __arcadeDebug?: { handlerCount(): number };
  }
}

applyTheme();
const app = document.getElementById('app')!;
const hubLayer = el('div.layer.hub-layer');
const gameLayer = el('div.layer.game-layer');
gameLayer.append(createBackground()); // backdrop for title / results screens
app.append(hubLayer, gameLayer);

const input = createInput(window);
const audio = createAudio();
const scores = createScores();
const mute = createMuteIndicator(audio);
app.append(mute.el);

const shell = createShell({ layer: gameLayer, audio, input, scores, onExit: () => hub.show() });
const hub = createHub({
  layer: hubLayer,
  cabinets: getCabinets(),
  audio,
  input,
  scores,
  onLaunch: (cab) => void shell.launch(cab),
});

input.onKey((e) => {
  if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.altKey && !e.metaKey && !isTextEntry(e)) {
    audio.toggleMute();
    mute.update();
  }
});

// Audio can fail to unlock (a dropped first gesture) or get auto-suspended by the OS/browser;
// retry on the next real input so a station never stays silent for the rest of the session.
input.onAny((e) => {
  if (e.type === 'pointermove') return;
  if (!audio.unlocked) void audio.unlock().catch(() => {});
  else if (!audio.running) audio.resume();
});

watchFullscreen();

if (new URLSearchParams(location.search).has('selftest')) {
  window.__arcadeDebug = { handlerCount: () => input.handlerCount() };
}

showSplash(app, audio, () => hub.show());
