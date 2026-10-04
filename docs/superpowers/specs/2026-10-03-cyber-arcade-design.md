# Cyber Arcade — Design Spec

**Date:** 2026-10-03
**Event:** Sophomore Day, 2026-10-08 (5 days out)
**Repo:** git@github.com:Timothy815/cyberarcade.git → `https://timothy815.github.io/cyberarcade/`
**Predecessor:** https://timothy815.github.io/Mini-Arcade/ (kept playable as "Classic '25")

## 1. Purpose

A polished, synthwave-styled arcade hub for an open house that showcases the
school's cybersecurity, Python, and network engineering programs. Primarily
entertaining; the learning games teach a real concept through their core
mechanic. It must look clearly more sophisticated than last year's arcade.

**Audience & setting:** visiting sophomores, new to cybersecurity. Groups rotate
every 25 minutes through a lab of Windows 11 PCs (~3 years old, Chrome/Edge),
keyboard + mouse, one player per station. Each game run lasts 2–4 minutes.

**Success criteria**
- All shipped games run smoothly (60 fps target) on the lab PCs for a full event day without a reload.
- No game can leave a station on a frozen or broken screen.
- Every game reads as one product: same palette, fonts, transitions, sound style.
- Deployable to GitHub Pages, with an offline USB fallback.

**Non-goals:** shared or network leaderboards, accounts, mobile/touch support,
gamepad support, cipher games (the Cipher Museum covers those).

## 2. Visual direction — Neon Synthwave

- Retro-future 80s arcade: striped neon sun, perspective grid floor (slowly
  scrolling), chrome-gradient logo, cyan (`#00f0ff`) and hot-pink (`#ff2e88`)
  neon on deep purple/black (`#0e0020` → `#2a0750`), sun yellow `#ffe259`.
- Fonts (self-hosted, OFL): **Audiowide** (display), **Space Grotesk** (UI/body),
  **JetBrains Mono** (code, data, HUD).
- Graphics are drawn in code (vector shapes, glow, particles). No sprite sheets.
- Palette and fonts are defined once in `src/core/theme.ts` and mirrored as CSS
  custom properties, so Phaser and HTML games share exactly the same values.
- Layout targets 1920×1080 and scales down cleanly to 1366×768.

## 3. Architecture

Vite + TypeScript, no UI framework. Hybrid rendering: the hub and the learning
games use HTML/CSS (crisp text, real inputs); the action games use **Phaser 3**
(physics, tweens, particles, built-in glow/bloom post-FX), lazy-loaded only when
an action game starts.

```
cyberarcade/
├─ index.html
├─ src/
│  ├─ main.ts               boot: shell + hub
│  ├─ core/
│  │  ├─ theme.ts           palette, fonts, shared constants
│  │  ├─ input.ts           keyboard/mouse helpers, any-input events
│  │  ├─ audio.ts           ZzFX sfx, procedural synthwave music, global mute
│  │  ├─ scores.ts          per-station top-10 + initials (localStorage)
│  │  ├─ idle.ts            inactivity timer → hub → attract mode
│  │  ├─ shell.ts           game registry, mount/unmount, fullscreen, transitions, crash guard
│  │  └─ ui/                shared HTML screens: title card, game over, initials entry, leaderboard
│  ├─ hub/                  carousel + animated background + attract loop
│  └─ games/
│     ├─ invaders/  runner/  defense/          (Phaser)
│     └─ phish/  port/  password/  bughunt/    (HTML/TS)
├─ public/                  fonts, any static assets
└─ tests/                   vitest unit tests, playwright smoke tests
```

### Game module contract

```ts
interface GameModule {
  id: string;                 // 'invaders', 'phish', ...
  title: string;
  tagline: string;            // one-line description shown in hub
  category: 'arcade' | 'learn';
  controls: string[];         // e.g. ['← → Move', 'SPACE Fire']
  mount(container: HTMLElement, ctx: GameContext): void | Promise<void>;
  unmount(): void;            // must release all listeners, timers, Phaser instance, audio nodes
}

interface GameContext {
  audio: Audio;               // shared sfx/music, respects mute
  input: Input;
  endRun(score: number): void; // hands off to shared game-over → initials → leaderboard flow
  exit(): void;                // back to hub
}
```

Registry entries hold a lazy `import()` so each game (and Phaser) is code-split.

### Flow

```
Hub carousel ──Enter──▶ Title card (controls) ──▶ Play ──▶ Game Over
     ▲                                                     │
     │                    top-10? ──yes──▶ Initials (3 letters, word filter)
     │                                                     │
     └──────────── Leaderboard ◀───────────────────────────┘
Esc from any game → hub.  Idle 60 s in a game → hub.  Idle 30 s in hub → attract mode.
```

## 4. The hub

- **Carousel:** the selected cabinet is large and centered (icon, title, category
  tag, tagline, station top score). Two neighbors are visible on each side, smaller and dimmed.
  Infinite wraparound over 8 cabinets.
- **Controls:** ← → rotate, Enter play; mouse click a side cabinet to rotate it to
  center, click the center cabinet to play. M toggles mute. Footer shows key hints.
- **Background:** animated neon sun + scrolling perspective grid floor, plus logo.
- **Attract mode:** after 30 s idle the carousel auto-advances every few seconds,
  "PRESS ANY KEY" pulses; any input exits attract mode.
- **First load:** a "CLICK TO START" splash (needed anyway to unlock browser
  audio) that also requests fullscreen.
- **Classic '25 cabinet:** opens https://timothy815.github.io/Mini-Arcade/ in the
  same tab. Last year's arcade has no way back, so the hub is reached again by browser Back (noted
  on the cabinet: "Press Alt+← to return").

## 5. Games

All games share: neon glow, particle bursts, screen shake on impacts, ZzFX sound
effects, the shared title/game-over/initials/leaderboard screens, difficulty
that ramps so runs end in 2–4 minutes.

### Action (Phaser)

1. **Malware Invaders** — Wave shooter. Enemy types: *virus* (basic),
   *worm* (splits into two when hit), *trojan* (disguised as a harmless icon until
   it is close). Power-ups: *Patch* (spread shot), *Antivirus* (shield), *Backup*
   (extra life). Ransomware boss every 5 waves. Controls: ← → move, Space fire.
2. **Packet Runner** — 3-lane endless runner through a neon network tunnel at
   increasing speed. Dodge DDoS floods and corrupted nodes, collect ACK tokens.
   Router gates show a destination IP; choose the lane whose subnet label matches.
   Controls: ← → or A/D.
3. **Firewall Defense** — Tower defense on a circuit-board map, 10 waves, final
   wave is a DDoS swarm. Towers: *Firewall* (steady single-target damage),
   *IDS* (reveals stealth attackers in range), *Honeypot* (lures and slows),
   *Rate Limiter* (area slow). Credits earned per kill. Controls: mouse.

### Learning (HTML/TS)

4. **Phish or Legit** — Emails/texts/URLs appear one at a time; ← phish, → legit,
   on a shrinking timer. Combo multiplier. On a mistake, the telltale sign is
   highlighted for 2 s (lookalike domain, mismatched sender, urgency, bad link).
   ~60 hand-written items tagged by difficulty; difficulty ramps.
5. **Port Guardian** — Packets arrive with source IP, destination port, protocol.
   A rulebook panel lists the current rules (e.g. allow 443, deny 23, block
   10.66.0.0/16). ALLOW / DENY (← / → or click). Rulebook changes each "shift."
   Three wrong calls = breach, game over. Uses real ports 22, 23, 25, 53, 80, 443, 3389.
6. **Password Smash** — *(Replaced by Password Cracker: see `2026-10-03-password-cracker-design.md`.)* Player types a password; a "cracking rig" animation runs
   and reveals estimated crack time via **zxcvbn**, with feedback (dictionary word,
   pattern, too short). Score derives from crack time; bonus challenge rounds
   (e.g. "under 16 characters, survives 1000 years"). Passwords never leave the page
   and are never stored; an on-screen notice says so. The input is cleared after each round.
7. **Bug Hunt** — A 6–12 line Python snippet with exactly one bug (off-by-one,
   wrong operator, missing return, `=` vs `==`, wrong indentation, etc.) shown with
   syntax highlighting. Click the buggy line before the timer expires; the fix is then
   shown. ~40 snippets tagged by difficulty.

### Classic '25

Link-out cabinet to last year's Mini-Arcade (see §4).

## 6. Shared systems

- **Scores (`scores.ts`):** per-game top 10 `{initials, score, date}` in
  localStorage under one namespaced key. All reads/writes are wrapped in
  try/catch; on failure, games run and scores are simply not kept. Initials: 3 letters A–Z,
  checked against a small blocklist (rejected entries become "???").
  Hidden **Ctrl+Alt+X** in the hub (not Ctrl+Shift+R, which is the browser hard-reload) clears all boards (with an on-screen confirm).
  Storage access is isolated so a shared backend could replace it later.
- **Audio (`audio.ts`):** ZzFX sound effects; a procedural synthwave loop (bass,
  arpeggio, drums) generated with WebAudio. Global mute on M, saved to localStorage.
  Audio context unlocked by the start splash.
- **Idle (`idle.ts`):** any key/mouse input resets the timer. 60 s in a game → exit to hub;
  30 s in the hub → attract mode.
- **Shell crash guard:** game mount and runtime errors (window `error` /
  `unhandledrejection` while a game is active) trigger unmount, a brief
  "SYSTEM ERROR // REBOOTING" screen, then the hub.
- **Fullscreen:** requested from the start splash; F11 also works.

## 7. Deployment

- GitHub Actions workflow builds with Vite and publishes to GitHub Pages on push to
  `main`. Vite `base: '/cyberarcade/'`.
- **Offline fallback:** a build variant with relative paths that is zipped as a release
  asset; runs from a USB stick by double-clicking
  `serve.bat`, which starts a local server (Python `http.server`) and opens the browser to it.

## 8. Testing

- **Vitest unit tests:** scores (insert/rank/trim/blocklist/storage failure), idle
  timer, Port Guardian rule evaluation, Password Smash scoring, question-bank
  validation (every Phish item has a label and a highlight; every Bug Hunt snippet has
  exactly one valid bug line and a fix).
- **Playwright smoke tests:** load the hub, launch each game, simulate input for a
  few seconds, Esc to hub; assert no console errors and that the DOM/canvas is cleaned up.
  A loop test cycles all games 20× to catch leaks.
- **Performance:** check frame rate with 4× CPU throttling in Chrome DevTools; target 60 fps.
- **Manual playtest checklist** to run on one real lab PC before the event.

## 9. Build order (5-day timeline)

A working version is deployed at the end of each step; later games are cut if
time runs out.

1. Project scaffold, core systems, shared UI screens, hub carousel + attract mode,
   Classic '25 cabinet, Pages deploy.
2. Phish or Legit, Password Smash, Malware Invaders.
3. Port Guardian, Bug Hunt.
4. Packet Runner.
5. Firewall Defense (stretch).
6. Polish pass, offline build, playtest checklist.
