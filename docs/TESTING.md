# Test report

Everything below was run in the build environment on 27 October 2026 (Node 22.22, Playwright 1.63 with Chromium). Re-run it yourself with:

```bash
npm test            # unit tests (no install needed)
npm install         # once, for Playwright
npx playwright install chromium
npm run test:e2e    # browser smoke test
```

## Unit tests: 45 passed, 0 failed

`tests/unit/*.test.js` load the real game files from `web/js/` into Node.

**Core gameplay:** one-cell moves, waiting for the first direction, reverse turns ignored,
**the original double-turn bug cannot happen**, turn buffer of two, mouse +10 / +1 length,
beetle +5 / no growth, Zoomies double points, speed-up capped at each level's minimum,
moving into the tail's cell allowed (but not while growing), deadly edges vs wrap-around,
walls and water with the right crash reason, Shell Shield save-then-choose and second-crash
death, power-up effects, hazards never overlapping the snake, the hazard crash, timer
expiry, ordered treats, Classic's original 1/3/2 points and speed changes, **a full board
no longer freezes**, star rules, determinism (same seed and inputs give the same game), and
prey and power-ups only ever on free, reachable floor (checked every tick over 36 autopilot runs).

**Levels:** exactly 12, numbered 1–12, unique names. Every map is 20 × 20 with a clear
start, every floor cell is reachable, there are **no one-wide dead ends**, star targets are
sensible, and new mechanics arrive in order (wrap → edges → crickets → shield → clock/moth
→ hazards → fleeing → sequence → survival). **The autopilot clears every level** at least
3 times in 10 seeds. In exploratory runs over 20 seeds, levels 1–5 and 7 were won 20/20 and the hardest (6, 10, 12) 14/20.

**Saving and trophies:** fresh defaults, the original `snakeHighScore` migrating into
Classic, round-trip, corrupt JSON and out-of-range values falling back safely, throwing
storage not breaking anything, and trophies unlocking once from save data.

**Mutation check:** the original turn bug was temporarily put back into `engine.js`. Two
tests failed as they should, and the fix was restored.

## Browser smoke test: 86 checks passed, 0 failed

`tests/e2e/smoke.js` runs at **360 × 640** (small phone), **412 × 915** (tall phone),
**800 × 360** (phone landscape) and **1280 × 800** (desktop). At each size:

- first launch plays the intro, **Skip** goes to the menu
- the menu and briefing card fit on screen, and buttons are at least 44 px tall
- an arrow key starts the snake in that direction
- the board uses the screen (330 / 380 / 280 / 690 px)
- touch sizes: the pad is shown and steers, and **a swipe on the board turns the snake**; desktop hides the pad
- pause freezes the game; the back-button contract works (resume, pause, exit only from the main menu)
- going to the background keeps the game paused
- **no console errors or warnings, and no network requests outside the game's own files** (external requests are blocked and counted, and there were none)

It also checks that:
- a returning player skips the intro
- **level 12 can be won through the normal game flow**, the campaign-complete screen
  appears, and completion and the *Master of the Wild* trophy **survive a page reload**
- the game boots from `file://` with no web server

**Bugs these tests found, now fixed:** landscape menu and briefing buttons were off-screen
(now side-by-side layouts), and the `AudioContext` was created before any user gesture
(the browser printed a warning; now it is created on the first tap or key press).

## Manual review (screenshots)

Every level was screenshotted mid-game, along with the intro frames, menu, level select,
settings, how-to, trophies, pause, game over, level complete and campaign complete. Fixed
after review: miter spikes on the intro title letters, a small portrait intro (now zoomed),
a window behind the title, the board not using the full phone width, a landscape board
that was too small (160 → 280 px), low-contrast obstacles in the kitchen and attic, a
duplicated "Score" chip on score-goal levels, and "Eat 5 prey" on a mice-only level.

## Not verified

These could not be tested here and should be checked on a real device:

- **The Android build.** The Android SDK was not available and Google's download
  servers were blocked, so **no APK was compiled, installed or run**. The Gradle files,
  manifest, resources and Kotlin were reviewed by hand, and all XML parses. The library
  and plugin versions come from Google's release pages (see DESIGN.md §2).
- **WebView specifics:** back button, onPause/onResume, immersive mode, cutout padding,
  renderer-crash recovery, and loading without the INTERNET permission.
- **Real touch hardware.** Swipes were simulated with pointer events.
- **Sound.** The effects were checked for errors only. Nobody heard them.
- **Frame rate.** No performance numbers are claimed. Headless Chromium on a server says
  nothing about a budget phone. The rendering was designed to be cheap (§3 of DESIGN.md),
  but that is a design intention, not a measurement.
- **Human difficulty.** Star times were set from autopilot clear times (roughly 2–3× slower
  than the bot), so they may need tuning after real playtesting.
