# Password Cracker — design

Replaces **Password Smash** (main spec §5 item 6). The old game had a dominant strategy
(mash the keyboard for a long random string) that taught the opposite of the lesson and
offered no stakes or replay value. In the new game the player is the attacker: they crack
fake users' passwords from profile clues, Wheel-of-Fortune style, and learn why passwords
built from personal facts are weak.

## 1. Goals

- A real game: limited turns, a way to lose, choices that matter, a reason to replay.
- The take-home lesson: passwords made from facts about you (pet, birth year, team) are
  the first thing an attacker tries; "complexity" tricks (capital + symbol, l33t) barely
  help; a long passphrase that is not about you is the strongest.
- A run takes about 4 minutes.

## 2. Core loop

Each run is **6 rounds**. Each round:

1. A **profile card** shows a fake user: name, age, pet (name and kind), birth year, sport
   and jersey number, favourite team, idol/favourite artist, favourite food. All facts are
   shown, whether or not the password uses them — the player has to reason about which ones matter.
2. The password is shown as **blanks**, one per character. Spaces (boss round) are shown
   from the start. A **turn counter** shows the turns left.
3. **Guess a character:** type one character. Letters are case-insensitive (`p` reveals both
   `P` and `p`); digits and symbols are typed as themselves.
   - In the password → every occurrence is revealed. **Costs nothing.**
   - Not in the password → **−1 turn.**
   - Already tried → no cost; the "tried" list flashes.
   - A "tried" strip shows every character guessed so far (hits and misses styled differently).
4. **Solve:** press **ENTER** to open the solve field, type the whole password, ENTER to
   submit (ENTER on an empty field closes it). Case-sensitive exact match.
   Right → cracked. Wrong → **−2 turns.**
5. If every character becomes revealed through guesses, the round counts as cracked.
6. **Challenge:** press **TAB** (or click **HACK**) at any time to take a challenge (§4).
7. **Zero turns** → an automatic **LAST CHANCE** challenge. Right → +2 turns and play
   continues. Wrong → **ACCOUNT LOCKED**, the password is revealed, the run ends.
8. After a crack: the full password and a **lesson card** for that round's pattern
   (§3) for about 3 s (ENTER skips after 1 s), then the next round.

Input note: `M` is the arcade's global mute key, so all typing goes through a focused text
input (guess field / solve field). The arcade already ignores global shortcuts while a
text field has focus. TAB's default focus move is prevented.

## 3. Rounds

Each round picks a random profile not used earlier in the run and builds the password
from that profile's facts with the round's pattern.

| # | Pattern | Example | Turns | Lesson card |
|---|---|---|---|---|
| 1 | One fact, lowercase | `pepper` | 8 | Pet names are the first thing attackers guess. |
| 2 | Fact + number (birth year or jersey) | `pepper2010` | 8 | Adding your birth year barely helps — attackers add it too. |
| 3 | Capitalised fact + symbol + number | `Soccer#7` | 7 | "Must have a symbol" rules lead to the same predictable shapes. |
| 4 | Capitalised fact in l33t + birth year | `P3pp3r2010` | 7 | Swapping e→3 and o→0 is the first trick a cracker tries. |
| 5 | Two facts + 2-digit year | `MayaSwift10` | 6 | Mixing your own details is still just your details. |
| 6 | **BOSS** — three random words, spaces | `purple tractor moonlight` | 10 | Long and not about you: the strongest password in the game. |

- "Fact" for patterns 1–5 is a single word of 3–10 letters drawn from the profile
  (pet name, sport, team, idol, food, own name — whichever the pattern allows).
- Symbols in pattern 3 come from `! @ # $`. L33t in pattern 4 uses e→3, o→0, i→1, a→4.
- The boss words come from a list of about 60 short common words, unrelated to profiles.
  The profile card in round 6 is still shown, and its hints are useless — that is the point.
- Every generated password uses only characters a player can type: letters, digits,
  `! @ # $`, and spaces (boss only).

## 4. Challenges

All challenges are **multiple choice, keys 1–4** (or click). About **70% trivia, 30% decode**.

- **Trivia:** a hand-written bank of about **40** security questions (phishing signs, HTTPS,
  MFA, updates, Wi-Fi, ports, malware types), each with 4 choices and one right answer.
  **10 s** timer. No question repeats within a run.
- **Decode** (generated, no content to write), **15 s** timer:
  - **Caesar:** a short word shifted forward by 1–3; the screen shows "SHIFT BACK n" and
    an alphabet strip. 4 word choices.
  - **Binary:** an 8-bit number (1–255) with place values `128 64 32 16 8 4 2 1` printed
    above the bits. 4 number choices.
- **Right answer** → the player picks a reward: **+2 TURNS** or **REVEAL A LETTER** (a random
  still-hidden character, all occurrences). LAST CHANCE always gives +2 turns.
- **Wrong answer or timeout** → no reward, no penalty (except LAST CHANCE, §2.7).

## 5. Scoring and end

- Crack: **100 × round number + 50 × turns left**.
- Right challenge answer: **+25**.
- Cracking all 6 rounds: **+1,000** bonus.
- The run ends on ACCOUNT LOCKED or after the boss round; the score goes through the
  normal `endRun` → initials → leaderboard flow.

## 6. Arcade integration

- Cabinet id stays `password` (registry, icon and leaderboard key unchanged).
  Title **Password Cracker**; tagline about cracking fake users' passwords from their
  profiles; controls `TYPE` guess a character, `ENTER` solve, `TAB` hack challenge.
- The old privacy notice is removed (players no longer type their own passwords); a small
  line says every profile is made up.
- **zxcvbn is removed** from the dependencies (no longer used).
- Same game contract as the other games: `createGame()`, `mount`/`unmount`, `ctx.input.onKey`,
  `el()`/`createHud()`, textContent only, every timer/RAF cleared on unmount.
- For deterministic tests the game reads an optional `?seed=N` query parameter and uses
  `mulberry32(N)` instead of `Math.random`.

## 7. Files

- `src/games/password/logic.ts` — round state: guesses, turns, reveal, solve, scoring (pure).
- `src/games/password/patterns.ts` — the 6 password patterns and lesson texts (pure).
- `src/games/password/profiles.ts` — about **12** fake profiles and the boss word list.
- `src/games/password/challenges.ts` — trivia bank and the Caesar/binary generators (pure).
- `src/games/password/index.ts`, `password.css` — UI (rewritten).
- Unit tests for each pure module; bank validation (every profile can fill every pattern;
  every generated password uses only typeable characters; every trivia item has 4 unique
  choices and a valid answer; decode choices are unique and include the answer).
- Playwright: replaces the two Password Smash tests — a seeded run that guesses letters,
  takes a challenge, solves a round, reaches lockout, and checks the final score; plus
  Esc cleanup via the existing leak loop.

## 8. Out of scope

- Free-form typing of full guesses outside the solve field; hint purchasing beyond the
  two rewards; per-player difficulty settings; sound beyond the existing sfx set.
