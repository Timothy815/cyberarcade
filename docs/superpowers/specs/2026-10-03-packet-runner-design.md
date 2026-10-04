# Packet Runner — Design

**Status:** approved in brainstorming, 2026-10-03
**Parent spec:** `docs/superpowers/specs/2026-10-03-cyber-arcade-design.md` (§2 Packet Runner, §9 build order step 4)
**Deadline:** Sophomore Day, 2026-10-08

## 1. Summary

Packet Runner is a 3-lane endless runner seen from behind the player. The player is a data packet racing down a neon network tunnel. It dodges DDoS floods and corrupted nodes and collects ACK tokens. At each router gate it steers into the lane whose subnet label matches the gate's destination IP. The gates are the teaching core. They begin as plain prefix matching and step up to /24 CIDR, so a sophomore who has never seen CIDR learns it during the run.

Controls: ← → or A/D to switch lanes. Esc exits, through the shell as usual.

## 2. Gameplay

### Lanes and movement
- There are 3 lanes, numbered 0–2, and the player starts in lane 1. ← / A moves one lane left and → / D one lane right. Both clamp at the edges.
- The visual slide between lanes takes about 120 ms. For collisions, the logic uses the target lane as soon as the key is pressed.
- Speed starts at a base value and rises about 4% every 10 s, up to a cap of about 2.2× the base. Tune both numbers in playtest.

### Hazards and pickups
| Object | Lanes | Effect |
|---|---|---|
| DDoS flood | a wide red wall across 1 or 2 adjacent lanes | −1 life |
| Corrupted node | 1 lane, a glitchy block | −1 life |
| ACK token | 1 lane | +10 score |

- The player has 3 lives. A hit starts about 1 s of invulnerability, shown by a flicker, and any hits during it are ignored.
- Spawn rows are generated from the seeded rng. A row never blocks all 3 lanes, so there is always an open lane.
- Spawn density rises with speed.

### Router gates
- A gate arrives every 15–20 s of run time.
- About 3 s before a gate reaches the player, a **ROUTER AHEAD** banner shows `DEST <ip>`. Each lane's label appears on the incoming gate arch.
- The spawner keeps a clear zone of about 2 s before every gate and about 0.5 s after it. A gate is never combined with a forced hazard hit.
- When the gate reaches the player, the player's current lane is checked:
  - Correct: +100 × the gate number (1st gate +100, 2nd +200, …), a success sound and a "ROUTED" flash.
  - Wrong: −1 life and a "PACKET DROPPED" flash. Invulnerability does not protect against a wrong gate, because it's a decision, not a collision.
- **Difficulty tiers by gate number:**
  | Gates | Tier | Labels look like | Distractors |
  |---|---|---|---|
  | 1–3 | `prefix` | `192.168.4.x` | different first or second octets, e.g. `10.0.0.x`, `172.16.9.x` |
  | 4–6 | `cidr` | `192.168.4.0/24` | different networks, as in the prefix tier |
  | 7+ | `near` | `192.168.4.0/24` | same first two octets with a different third octet, e.g. `192.168.5.0/24`, `192.168.40.0/24` |
- The first time a `cidr` gate appears in a run, the banner adds the hint **"/24 = first 3 numbers must match"**.
- Exactly one label matches the destination at every gate. The correct lane is random (0–2) from the seeded rng.

### Scoring and the end of a run
- Score sources: distance (+1 per 100 ms of run time), ACK tokens and gates.
- At 0 lives the run ends. After a short end delay, as in Invaders, it calls `ctx.endRun(score)`.
- HUD: score, lives and gate count.

## 3. Architecture

Phaser 3.90, following the same split as Malware Invaders. Rules live in pure logic, and the scene only draws.

| File | Responsibility |
|---|---|
| `src/games/runner/logic.ts` | Pure `World`. No Phaser and no DOM. It has `step(dtMs, controls)` and `steer(dir)`. It returns `GameEvent[]` (`hit`, `ack`, `gateRight`, `gateWrong`, `gateWarn`, `speedUp`, `gameOver`). It holds lane, speed, objects `{kind, lanes, z}`, the pending gate, lives, score and the invulnerability timer. It takes an `Rng`. |
| `src/games/runner/gates.ts` | `makeGate(n: number, rng: Rng): Gate`, where `Gate = {dest, labels: [string, string, string], correct: 0\|1\|2, tier: 'prefix'\|'cidr'\|'near'}`. Matching uses `inNet` / `ipIn` / `parseIp` imported from `src/games/port/logic.ts`, so the IP rules exist in one place. A prefix label `a.b.c.x` is treated as `a.b.c.0/24`. |
| `src/games/runner/scene.ts` | `RunnerScene`. It projects `(lane, z)` to the screen with `scale = f / (z + f)` toward a vanishing point. It draws neon tunnel rings streaming toward the camera, lane lines, the packet, obstacles and gate arches with label text. Every frame mirrors the World. |
| `src/games/runner/textures.ts` | Generated glow textures for the packet, ACK, flood and node. No image files. |
| `src/games/runner/index.ts` | `createGame()`, mount and unmount. Input goes through `ctx.input.onKey` (← → A D). The DOM overlays are the HUD (`createHud`), the ROUTER AHEAD banner (dest + hint) and the result flashes. It maps events to `ctx.audio.sfx`. The game root exposes `data-correct` and `data-lane` for e2e. |
| `src/games/runner/runner.css` | Banner, flash and HUD styling, using the theme tokens. |
| `src/games/phaser-util.ts` | **Targeted refactor.** `destroyGame()` (the WebGL-context release) moves here from `invaders/index.ts`, and both games import it. Invaders' behavior is unchanged. |
| `src/games/registry.ts` | The `runner` cabinet gets `load: () => import('./runner/index').then((m) => m.createGame())`, and its controls become `['← → / A D', 'Switch lane']`. |

### Determinism
`?seed=N` drives every random choice: spawn rows, gates and the correct lane. A given seed and input sequence always give the same run.

### Teardown
`unmount()` removes every listener, the DOM overlays, the timers and the end delay, and destroys the Phaser game through `destroyGame()`. Mounting and unmounting repeatedly must not leak WebGL contexts.

## 4. Testing

**Unit (Vitest, seeded rng):**
- `tests/unit/runner-logic.test.ts`
  - lane clamping
  - collision costs exactly 1 life and starts invulnerability; a hit during invulnerability is ignored
  - ACK pickup scores
  - the speed ramp rises and stops at the cap
  - a spawned row never blocks all 3 lanes
  - the clear zone before and after each gate holds no hazards
  - a right gate scores 100 × n, and a wrong gate costs a life even while invulnerable
  - `gameOver` fires at 0 lives, and `step` does nothing after it
- `tests/unit/runner-gates.test.ts`
  - for 500+ seeds and each tier, exactly one label matches `dest` and that label is `correct`
  - the tier follows the gate number
  - `near` distractors share the first two octets
  - labels are distinct

**E2E (Playwright, `tests/e2e/games.spec.ts`):**
- Runner boots a canvas, steering changes `data-lane`, the score rises, and Esc tears the canvas down.
- A seeded run reaches the first gate, steers to `data-correct` and sees the score jump by 100.
- `runner` is added to the existing 20-cycle mount/unmount leak loop and its WebGL-context tracker.
- The existing invaders e2e still passes after the `destroyGame` move.

## 5. Out of scope
- Power-ups, a boss and touch controls.
- Masks other than /24, such as /16 or /8.
- Firewall Defense, which remains a separate stretch goal.
