# Firewall Defense — Design

**Status:** approved in brainstorming, 2026-10-04
**Parent spec:** `docs/superpowers/specs/2026-10-03-cyber-arcade-design.md` (§2 Firewall Defense, §9 build order step 5)
**Deadline:** Sophomore Day, 2026-10-08

## 1. Summary

Firewall Defense is a short tower-defense game, about 3–4 minutes per run, played on a neon circuit-board map. Attackers travel along one circuit trace from INTERNET to the SERVER. The player builds defenses on fixed pads beside the trace.

The teaching core is **counters**: each attacker type is best stopped by one specific defense. The first time a new attacker type appears, a one-line callout explains the real-world idea. Students learn defense in depth because they need it to win.

Controls: the mouse builds and upgrades. Keys 1–4 pick a tower, U upgrades, S sells and N sends the next wave. Esc exits through the shell as usual.

## 2. Gameplay

All numbers are starting values to tune in playtest.

### Map
- One circuit trace snakes from INTERNET (left) to SERVER (right).
- There are 12 build pads beside the trace, and none of them overlaps it.
- The server starts with **20 integrity**.

### Towers
Each tower can be upgraded once. An upgrade costs `round(1.5 × build cost)`. Selling refunds 60% of everything spent on the tower, rounded down.

| Tower | Cost | Effect | Upgrade |
|---|---|---|---|
| Firewall | 50 | Shoots one target at a steady rate. It picks the attacker furthest along the path that is in range and targetable. | Faster fire rate and more damage |
| IDS | 40 | Does no damage. Stealth attackers inside its range become targetable. | Bigger range |
| Honeypot | 60 | Holds one brute-force bot in range for 2 s; the held bot doesn't move. Other attackers in range are slowed by 30%. | Holds 2 bots at once |
| Rate Limiter | 70 | Slows every attacker in range by 50%, and DDoS packets by 70%. | Bigger range |

- Slows don't stack: an attacker gets only the strongest slow it is under.
- A brute-force bot is held only once per honeypot, so it can't be held forever.

### Attackers
| Attacker | Behavior | Counter | Integrity damage if it leaks |
|---|---|---|---|
| Malware | Normal speed and health | Firewall | 1 |
| Stealth intruder | Cannot be targeted unless an IDS covers it | IDS + Firewall | 2 |
| Brute-force bot | Fast and tough | Honeypot holds it while Firewalls hit it | 1 |
| DDoS packet | Swarms of 12–40, low health, very fast | Rate Limiter + Firewalls | 1 each |

### Lesson callouts
The first time each attacker type spawns in a run, a DOM banner shows its callout. The banner pauses nothing and fades after about 4 s.

| Attacker | Callout |
|---|---|
| Malware | "MALWARE — malicious code trying to reach the server. Firewalls block it." |
| Stealth | "STEALTH ATTACK — firewalls can't block what they can't see. Place an IDS." |
| Brute force | "BRUTE FORCE — a bot hammering logins. A honeypot traps it while you strike." |
| DDoS | "DDoS — a flood of junk traffic. Rate limiting slows the flood so your defenses can keep up." |

### Waves
- There are **10 waves**, each about 15–25 s long.
- Between waves there is an **8 s build pause** with a countdown. Before wave 1 the pause is **12 s**.
- **SEND NOW** (button or N) ends the pause early and pays **+1 credit per whole second skipped**.

| Wave | Composition | Lesson |
|---|---|---|
| 1 | 8 malware | Place Firewalls |
| 2 | 12 malware | |
| 3 | 8 malware + 4 stealth | IDS |
| 4 | 10 malware + 6 stealth | |
| 5 | 8 malware + 4 brute-force | Honeypot |
| 6 | 10 malware + 5 stealth + 4 brute-force | Defense in depth |
| 7 | 12 malware + 6 stealth + 6 brute-force | |
| 8 | 8 malware + 12 DDoS | Rate Limiter |
| 9 | 14 malware + 8 stealth + 6 brute-force + 16 DDoS | Build-up |
| 10 | **DDoS SWARM:** 40 DDoS + 6 stealth + 4 brute-force | Finale |

- Waves 1–2 have a fixed spawn order and fixed timing.
- Waves 3+ keep the composition in the table, but the seeded rng shuffles their spawn order and jitters the gaps between spawns.
- A wave is cleared when all of its attackers have been killed or have leaked.

### Economy and scoring
| Source | Credits | Score |
|---|---|---|
| Starting credits | 120 | — |
| Malware kill | 5 | 50 |
| Stealth intruder kill | 8 | 80 |
| Brute-force bot kill | 10 | 100 |
| DDoS packet kill | 2 | 20 |
| Wave clear | 25 | 100 × wave number |
| Win (wave 10 cleared) | — | 50 × remaining integrity |

Every kill scores 10 × its credit value.

### End of a run
- If integrity reaches 0, the run ends with **SERVER BREACHED**.
- If the player clears wave 10, the run ends with **SYSTEM SECURED**.
- Either way, after a short end delay, as in Invaders, the game calls `ctx.endRun(score)`.
- **HUD:** wave X/10, integrity, credits and score.

## 3. Architecture

Phaser 3.90, with the same split as Malware Invaders and Packet Runner: rules live in pure logic, the scene only draws, and the overlays are DOM.

| File | Responsibility |
|---|---|
| `src/games/defense/path.ts` | Pure map data: path waypoints, the 12 pad positions with their x,y, the total path length, and `pointAt(distance)`, which turns a distance along the path into x,y. |
| `src/games/defense/waves.ts` | The 10 wave definitions and `buildWave(n, rng): Spawn[]`, where `Spawn = { kind, delay }`. Waves 1–2 are fixed. Waves 3+ are shuffled and jittered with the rng. |
| `src/games/defense/logic.ts` | Pure `World`. No Phaser and no DOM. It runs on a **fixed 1/120 s timestep**, accumulating clamped frame dt as Packet Runner does.<br>**Actions:** `build(pad, kind)`, `upgrade(pad)`, `sell(pad)` and `sendNow()`. Each returns success as a boolean.<br>**Rules:** attacker movement along the path, targeting, honeypot holds, slows (strongest only), IDS reveal, leaks, credits and score.<br>**Events from `step(dt)`:** `GameEvent[]` (`kill`, `leak`, `shot`, `waveStart`, `waveClear`, `firstSeen`, `win`, `breach`).<br>It takes an `Rng`. |
| `src/games/defense/scene.ts` | `DefenseScene`. It draws the circuit board, the trace, the pads, towers (with a range ring on hover or selection), attackers (stealth ones shimmer and turn solid once revealed), beams and slow fields. Every frame mirrors the World. |
| `src/games/defense/textures.ts` | Neon textures made in code with the shared `phaser-util` helpers. No image files. |
| `src/games/defense/index.ts` | `createGame()`, mount and unmount.<br>**Overlays (DOM):** the HUD (`createHud`), the build/upgrade menu, the lesson callouts, the countdown with a SEND NOW button and the end banner.<br>**Pads:** invisible DOM buttons positioned over the canvas, so clicks are hit-tested in the DOM.<br>**Keys:** through `ctx.input.onKey`.<br>**Sound:** events map to `ctx.audio.sfx`.<br>**For e2e:** the root exposes `data-wave`, `data-phase` (`build`, `wave` or `over`), and each pad exposes `data-pad` and `data-tower`. |
| `src/games/defense/defense.css` | Styling for the overlays, using the theme tokens. |
| `src/games/registry.ts` | The `defense` cabinet gets `load: () => import('./defense/index').then((m) => m.createGame())`. Its controls become `[['MOUSE', 'Build & upgrade'], ['1–4 / N', 'Tower / Next wave']]`. |

### Determinism
`?seed=N` drives every random choice. A given seed and input sequence always give the same run, whatever the frame rate.

### Teardown
`unmount()` does all of the following:
- removes every listener, the DOM overlays, the timers and the end delay
- restores any window handlers it changed
- destroys the Phaser game through `destroyGame()`

Mounting and unmounting repeatedly must not leak WebGL contexts.

## 4. Testing

**Unit tests (Vitest, seeded rng)**

`tests/unit/defense-logic.test.ts`:
- Building costs credits. It fails on an occupied pad or when credits are short.
- Upgrade costs work, upgrades are limited to one, and sell refunds 60%.
- Attackers follow the path, and a leak costs integrity by type.
- A Firewall targets the attacker furthest along and never targets an unrevealed stealth attacker.
- An IDS reveal makes a stealth attacker killable.
- A Honeypot holds a brute-force bot for 2 s, only once per honeypot, and slows other attackers by 30%.
- The Rate Limiter slows by 50%, or 70% for DDoS, and slows don't stack.
- Kill credits and score, and wave-clear credits and score.
- SEND NOW pays its bonus and starts the next wave.
- At 0 integrity the run breaches. Clearing wave 10 wins with the integrity bonus. `step` does nothing after the run is over.
- `firstSeen` fires once per type.
- **Determinism:** the same seed and the same builds at a 1/60 s, 1/144 s and jittered dt give identical event logs and end state.

`tests/unit/defense-waves.test.ts`:
- Each wave's composition matches the table.
- Waves 1–2 are identical across seeds.
- Shuffled waves keep their composition over 200+ seeds.

`tests/unit/defense-path.test.ts`:
- `pointAt` hits the waypoints and the total length is correct.
- No pad overlaps the path.

**E2E (Playwright, `tests/e2e/games.spec.ts`):**
- Defense boots a canvas.
- Clicking a pad and choosing Firewall sets `data-tower` and takes 50 credits.
- N starts wave 1, and the score rises.
- Esc tears the canvas down.
- A seeded run with Firewalls pre-built reaches `data-wave` 2.
- `defense` is added to the existing 20-cycle mount/unmount leak loop and its WebGL-context tracker.

**COMING SOON tests:** once Defense is built, no unbuilt cabinet is left.
- The carousel and hub unit tests switch to a fake unbuilt registry entry, so the feature stays covered.
- The e2e test that walked to the COMING SOON cabinet instead walks to Firewall Defense and launches it.

## 5. Out of scope
- Multiple maps, more than one upgrade per tower, and a speed-up (fast-forward) button
- Touch controls and saving between runs
- Mouse availability on the lab PCs gets checked at the playtest.
