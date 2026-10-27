# Changelog

## 1.0.0 — Michy's Pet Snake

The original **Aspect Snake** (`original/aspect-snake.html`) rebuilt as a story-driven,
12-level arcade game that runs offline in the browser and inside an Android app.

### Added
- **Story and intro:** a 4.5-second cutscene of the snake escaping its terrarium, with skip, shown once and replayable from the menu.
- **12-level campaign** across 10 themed rooms, each adding a mechanic: wrap-around start, deadly edges, crickets and beetles, furniture, the clock, golden moths, water, patrolling hazards, fleeing mice, a maze, ordered deliveries, survival and a finale.
- **Power-ups:** Shell Shield, Zoomies, Chill Cube.
- **Progression:** stars by clear time, best scores, unlocks, 13 trophies, 4 snake colours, and a campaign-complete screen.
- **Terrarium Classic:** the original rules as an endless mode.
- **Menus:** main menu, level select, how to play (with drawn icons), trophies, settings (sound, reduce motion, controls, colours, reset), pause, level clear, game over.
- **Controls:** swipe anywhere (continuous), on-screen pad with no tap delay, arrow keys/WASD, and Space/P/Esc to pause.
- **Sound:** synthesized effects that respect the sound setting and browser audio rules.
- **Android:** Android Studio project with a WebView, WebViewAssetLoader, back button, lifecycle and immersive full screen, no permissions.
- **Tests:** 45 unit tests, an autopilot that proves each level is winnable, and an 86-check browser smoke test.

### Fixed (from the original)
- The quick double-turn could fold the snake into itself.
- The Game Over screen depended on Tailwind from the internet (broken offline).
- Food placement froze the page when the board was full.
- Moving into the cell the tail was leaving counted as a crash.
- Half-finished food types (colour, points and speed were ignored).
- Fixed 400 px canvas: cut off on phones and blurry on sharp screens.
- Laggy taps on the pad; no controls on tablets; no pause; kept running in the background.

### Kept
- The orange snake and its drawn head (now the default "Sunset" colours), the 20 × 20 grid, arrow keys, the three original food types and speeds (in Classic), and your old high score (migrated into Classic).
