# Michy's Pet Snake: design and architecture

## 1. Audit of the original "Aspect Snake"

The source was one file, `snake_test_mini_test2.html` (626 lines), kept unchanged at
[`original/aspect-snake.html`](../original/aspect-snake.html). There were no images, sounds or other files.

**How it worked:** a 20 × 20 grid on a fixed 400 × 400 canvas. `setInterval` moved the
snake every 150 ms, 5 ms faster per food (down to 50 ms), and a separate
`requestAnimationFrame` loop redrew the screen. The orange snake had a drawn head
(eyes, fangs, cyan glow). Controls were arrow keys plus an on-screen pad, and the
high score was kept in `localStorage` under `snakeHighScore`.

**What worked:** movement, growth, wall and self collisions, scoring, the remembered
high score, game over and restart, and the pulsing food and glowing head.

**Problems found:**

| # | Problem | Effect |
|---|---|---|
| 1 | Tailwind loaded from a CDN, and the `hidden` class came from it | Offline (as in an APK), the Game Over overlay would cover the game from the start |
| 2 | `generateFood` declared twice; the second added 3 food types | Half-finished: colour, points and speed of the types were ignored |
| 3 | Turns checked against the *current* direction | Two quick key presses in one tick could reverse the snake into its neck |
| 4 | Fixed 400 px canvas, no devicePixelRatio handling | Cut off on 360 px phones, blurry on sharp screens |
| 5 | Pad used `click` on `div`s and was hidden at ≥ 768 px | Laggy taps; tablets had no controls; no swipe |
| 6 | No pause, no visibility handling | Kept running in the background |
| 7 | Moving into the tail's cell counted as a crash | Unfair deaths (the tail moves away that same tick) |
| 8 | `do…while` food placement | Infinite loop (page freeze) when the board is full |
| 9 | "Inter" font requested but never loaded | Fell back to whatever the system had |

**What was kept:** the 20 × 20 grid, the orange colour scheme (it is the default
"Sunset" skin), the drawn-head character, the three food types and their intended
rules (now **Terrarium Classic** mode, with the original 150 ms / −5 ms / 50 ms speeds),
the arrow keys, and the old `snakeHighScore` (migrated into Classic's best score).

## 2. Research and the decisions it informed

| Question | Source | Decision |
|---|---|---|
| How should a WebView load bundled HTML/JS/CSS? | [Android: Load in-app content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content) | `WebViewAssetLoader` with `https://appassets.androidplatform.net/assets/`, not `file://`. File access off. Universal/file-URL access explicitly false. Mixed content never allowed. |
| Current Android Gradle Plugin and its requirements | [AGP release notes](https://developer.android.com/build/releases/gradle-plugin) | AGP 9.4.0 (latest stable when written), which needs Gradle ≥ 9.6.0 and JDK 17. It supports up to API 37, so compileSdk 37. |
| Kotlin setup under AGP 9 | [Migrate to built-in Kotlin](https://developer.android.com/build/migrate-to-built-in-kotlin) | Do **not** apply `org.jetbrains.kotlin.android`. Kotlin is built in, and `jvmTarget` follows `compileOptions`. |
| AGP 9 DSL changes | [AGP 9.0 release notes](https://developer.android.com/build/releases/agp-9-0-0-release-notes) | Set `targetSdk` explicitly (it now defaults to compileSdk). Use no removed APIs (`applicationVariants` and similar). |
| Library versions | [androidx.webkit releases](https://developer.android.com/jetpack/androidx/releases/webkit), [androidx.activity releases](https://developer.android.com/jetpack/androidx/releases/activity) | webkit 1.18.0 and activity-ktx 1.13.0, the latest stable versions at the time. |
| Can Canva supply intro animation or sprites? | Canva Help Center, via the Canva connector | Not well: PNG has no animation, GIF transparency is 1-bit with 256 colours, MP4 has no transparency on any plan, and sprite sheets would mean exporting every frame by hand. **Decision:** draw everything on the Canvas in code (see §4). |
| Audio in browsers / WebView | Chrome autoplay policy (the warning the browser itself printed during testing) | Create the `AudioContext` only on the first tap or key press. All sounds are synthesized (no files). |
| Fixed time step for games | Standard game-loop practice (accumulator + interpolation) | Game rules advance in fixed ticks; drawing blends between ticks. Timers count game-time ms, so dropped frames never change the rules. |

Things that could **not** be verified are listed in [TESTING.md](TESTING.md#not-verified).

## 3. Architecture

```
web/                      ← the game (also the APK's assets)
  index.html              screens and HUD markup, loads the scripts in order
  css/game.css            all styles; no frameworks, no web fonts
  js/levels.js            the 12 level definitions + Terrarium Classic (pure data)
  js/engine.js            the rules: movement, collisions, prey AI, spawns, goals (no DOM)
  js/storage.js           versioned, crash-safe save data + legacy migration
  js/achievements.js      trophies and skin unlocks, computed from the save
  js/audio.js             Web Audio synthesized sound effects
  js/sprites.js           every character and prop, drawn with Canvas paths
  js/render.js            board renderer: cached floor layer, interpolation, particles
  js/intro.js             the 4.5 s cutscene
  js/input.js             swipe, on-screen pad, keyboard
  js/main.js              app shell: screens, the single game loop, HUD, saving, back button
android/                  ← Android Studio project (WebView wrapper)
tests/                    ← unit tests, autopilot, browser smoke test
original/                 ← the untouched original game
```

**Key choices**

- **Plain scripts, no build step, no dependencies.** Each file attaches to one global
  namespace (`window.MPS`). The game opens from `file://`, from any web server and
  inside the WebView, and the engine files load into Node for tests unchanged. ES
  modules were avoided because they fail on `file://`.
- **Pure, deterministic engine.** `engine.js` never touches the DOM. Randomness comes
  from a seeded generator (mulberry32), so the same seed and inputs always replay the
  same game. That is what lets the tests prove things like "every level can be won".
- **One loop, ever.** `main.js` starts a single `requestAnimationFrame` loop when the
  game screen opens (guarded against a second start) and stops it when you leave. Up
  to 4 ticks catch up per frame; beyond that it skips ahead rather than spiralling.
- **A turn queue of 2.** Each turn is checked against the last *queued* direction,
  which fixes the original double-turn bug while keeping quick, intentional double
  turns (e.g. a U-turn at a wall).
- **Fair collisions.** The tail is ignored when the snake is not growing that tick.
  Hazards turn back instead of moving into the snake, so only the player's own move
  can cause a hazard death.
- **Spawns only on reachable floor.** A flood fill from the start marks reachable
  cells. Food can't spawn inside furniture, in a sealed pocket, under a hazard or in
  the snake, and when the board is full nothing spawns (no freeze).
- **Rendering cost.** The floor and obstacles are painted once per level into an
  offscreen canvas. Particles and floating texts use fixed pools (no allocation while
  playing). The canvas backing store follows `devicePixelRatio` (capped at 3), and
  tiles snap to whole device pixels.

## 4. Visual identity

- **Palette:** deep jungle green UI (`#0e2219`, `#173a2c`), Michy's sunset-orange snake
  (`#ff9933`, kept from the original), cream text (`#fff4e0`), gold for rewards
  (`#ffc94d`), mint for labels (`#5ee6b8`), pink accents (`#ff6b8b`).
- **Type:** the system's rounded UI font stack (`ui-rounded`, SF Pro Rounded, Nunito,
  Roboto...). Nothing is downloaded, so it works offline.
- **Characters** (all original, drawn in code): the snake has a tapered body, scale
  bands, a highlight, eyes that blink and look toward the nearest prey, a flicking
  tongue, a mouth that opens when prey is right ahead, a visible gulp bulge that
  travels down the body, and X eyes on a crash. There are also mice, beetles, crickets,
  golden moths, treat parcels, a hedgehog and a robot vacuum.
- **Readability rules:** every theme keeps a faint checkerboard so turns line up.
  Obstacles are raised blocks with a lighter top face, and water is clearly blue. Prey
  that is about to vanish blinks. The kitchen and attic palettes were adjusted after
  screenshot review because their obstacles blended into the floor.
- **Themes:** bedroom, living room, hallway, garden, kitchen, basement, porch, night
  living room, attic, the wild, and the terrarium (Classic). This is the escaped pet's
  journey from its tank to the outdoors.

## 5. The opening cutscene (≈ 4.5 s)

| Time | What happens |
|---|---|
| 0.0 – 1.0 s | Michy's terrarium in a bedroom at night. The snake is coiled on the sand. The title drops in letter by letter. |
| 0.8 – 1.3 s | The snake glances up, a "!" pops, and the lid slides open (soft click, if sound is unlocked). |
| 1.0 – 2.5 s | It slithers up, over the rim and down the glass to the floor. |
| 2.2 – 3.4 s | The camera pans along the floor. A mouse scurries in, squeaks, sees the snake ("!" again) and runs. The snake gives chase, mouth open. |
| 3.7 – 4.5 s | An iris wipe closes on the snake's head and opens onto the main menu. |

- It plays automatically **once** (first launch). **Skip** is a button, a tap anywhere
  or any key. **Watch intro** on the menu replays it.
- It is silent on first launch (no tap has happened yet), and plays sound on replay only if sound is on.
- It is skipped entirely when *Reduce motion* is on, in-game or at system level.
- Portrait screens zoom in on the action. The camera pan keeps the snake in view on any aspect ratio.

## 6. The campaign

All boards are 20 × 20. A level never starts moving until the player picks a direction.
Stars: one for clearing the level, two or three for clearing it within target times
(Survival Run awards stars for score instead). Beating a level unlocks the next one.

| # | Level & theme | Objective | New idea | Start speed → fastest | Fail conditions | Stars (2★ / 3★) |
|---|---|---|---|---|---|---|
| 1 | The Great Escape · bedroom | Eat 5 mice | Basic movement; **edges wrap around** (forgiving) | 175 → 150 ms | Biting yourself | 0:25 / 0:15 |
| 2 | First Hunt · bedroom | Score 100 | **Edges are deadly** now | 160 → 125 ms | Edge, self | 0:45 / 0:28 |
| 3 | Tiny Crawlers · bedroom | Score 150 | **Crickets** (15, hop, leave after a while) and **beetles** (5, no growth); first small obstacles | 150 → 120 ms | Edge, pots, self | 1:00 / 0:38 |
| 4 | The Living Room | Eat 12 prey | **Furniture** obstacles; **Shell Shield** power-up | 145 → 115 ms | Furniture, edge, self | 1:00 / 0:38 |
| 5 | The Speed Challenge · hallway | Score 200 **within 60 s** | **Timer**, **Zoomies** (fast + double points), rare **golden moth** (50) | 130 → 95 ms | Clock, obstacles, self | 0:45 / 0:30 |
| 6 | The Garden | Score 250 | **Water**, hedges, the first **moving hazard** (hedgehog); **Chill Cube** slow-mo | 140 → 110 ms | Hedgehog, pond, hedges | 2:10 / 1:25 |
| 7 | Clever Prey · kitchen | Eat 10 mice | **Mice flee** from your head; herd them into corners | 140 → 110 ms | Counters, edge, self | 1:00 / 0:35 |
| 8 | The Maze · basement | Eat 10 prey | Tight **2-wide corridors** (no dead ends); slower speed so you can plan | 150 → 130 ms | Crates, self | 1:05 / 0:40 |
| 9 | Special Delivery · porch | Eat treats **1 → 5 in order**, twice, **within 90 s** | **Ordered collection**: only the glowing number is edible, so plan a route | 140 → 120 ms | Clock, crates, self | 1:10 / 0:45 |
| 10 | Survival Run · night | **Survive 60 s** and eat 6 | **Two robot vacuums**, plus shields and chill | 135 → 115 ms | Vacuums, furniture, self | 150 / 240 pts |
| 11 | The Final Hunt · attic | Score 300 **within 100 s** | **Limited chances**: fleeing mice that vanish if you're slow | 130 → 105 ms | Clock, junk, patroller, self | 1:25 / 1:00 |
| 12 | Master of the Wild | Score 400 | **Everything**: fleeing mice, insects, moths, two hedgehogs, water, rocks, all power-ups | 125 → 100 ms | All of the above | 2:20 / 1:35 |

**Relationship between levels:** each level introduces at most one or two new ideas,
uses them in a forgiving layout, and later levels combine them (10 combines hazards with
survival, 11 combines the clock with fleeing, vanishing prey, and 12 combines everything).
Speed rises slowly *within* a level as you eat, but the start speed across levels varies
with the demands of the layout. The maze is deliberately slower. It's never just "faster".

**Replayability:** star times, best scores, 13 trophies, unlockable snake colours
(Emerald after level 4, Midnight after level 8, Golden for finishing), and the endless
**Terrarium Classic** mode with its own best score.

**Bonuses:** timed levels add 5 points per second left. Survival adds 2 points per segment.

**Prey and power-ups**

| | Points | Grows | Behaviour |
|---|---|---|---|
| Mouse | 10 | +1 | Still, or flees when the snake is within 6 cells (levels 7, 11, 12) |
| Beetle | 5 | 0 | Still: points without getting longer |
| Cricket | 15 | +1 | Hops up to 3 cells every 9 moves; leaves after 80 moves |
| Golden moth | 50 | +1 | Flutters every 3 moves; leaves after 70 moves |
| Treat parcel | 20 | +1 | Special Delivery only; must be eaten in order |
| Shell Shield | – | – | Absorbs one crash; you stop and pick a new direction |
| Zoomies | – | – | 25% faster and double points for 70 moves |
| Chill Cube | – | – | 50% slower for 60 moves |

**Hazards:** they move one cell every other move along a straight line and turn back
when blocked. They never move into the snake; only driving into one is fatal.

## 7. Saving

One JSON record in `localStorage` under `michys-pet-snake.save` (version 1): unlocked
level, per-level best/stars/cleared, Classic best, campaign complete, intro seen,
settings (sound, controls, skin, reduce motion), trophies and lifetime stats. Every
field is validated on load. Corrupt or tampered data falls back to safe defaults, and
storage errors (private mode, quota) never crash the game, which carries on in memory.
The `version` field allows a migration step later. *Reset progress* in Settings keeps
your settings.

## 8. Trade-offs and things deliberately left out

- **No music track.** Synthesized SFX only. A looping track would add file size and licensing questions.
- **No vibration.** It would need the `VIBRATE` permission; the app currently needs none.
- **No accounts, ads, analytics or online leaderboards**, as the brief required.
- **Square 20 × 20 boards everywhere.** They fit both orientations and keep the level data simple, but they leave some unused space on very tall phones.
- **Canva:** not used for assets, for the export reasons above. Canva is still a good tool for Play Store graphics (feature banner, screenshots frames).
- **WebView vs a native rewrite:** the WebView keeps one codebase for the browser and Android. Nothing in this game needs native rendering.
