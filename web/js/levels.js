/*
 * Michy's Pet Snake: level data.
 *
 * Every board is 20 x 20. Map legend:
 *   .  floor            #  solid obstacle (furniture, hedge, crate...)
 *   ~  water (solid)    S  snake head start (body trails to the left, facing right)
 *   R  hazard that patrols horizontally
 *   V  hazard that patrols vertically
 *
 * goal types:
 *   eat      eat `count` prey (optionally only of type `prey`)
 *   score    reach `target` points
 *   survive  stay alive for `ms` of game time and eat at least `minEat` prey
 *   sequence eat numbered treats in order, `count` per set, `sets` sets
 *   endless  classic mode, play until you crash
 *
 * stars: seconds to clear for 2 and 3 stars (or points, with starsBy: 'score')
 *
 * spawns: { type | pick[], keep (always keep this many on the board),
 *           chance (per-tick spawn chance while below max), max, atTick (first
 *           guaranteed appearance), ttl, flee, still }
 */
(function (root) {
  'use strict';
  const MPS = (root.MPS = root.MPS || {});

  const EMPTY = [
    '....................', '....................', '....................', '....................',
    '....................', '....................', '....................', '....................',
    '....................', '....................', '.....S..............', '....................',
    '....................', '....................', '....................', '....................',
    '....................', '....................', '....................', '....................',
  ];

  const LEVELS = [
    {
      id: 1, name: 'The Great Escape', theme: 'bedroom',
      story: 'Michy left the terrarium lid open. The bedroom floor is all yours!',
      tip: 'Swipe, use the pad or the arrow keys. The edges wrap around on this level only.',
      wrap: true,
      map: EMPTY,
      speed: { start: 175, ramp: 2, min: 150 },
      goal: { type: 'eat', count: 5, prey: 'mouse' },
      spawns: [{ type: 'mouse', keep: 1 }],
      stars: [25, 15],
    },
    {
      id: 2, name: 'First Hunt', theme: 'bedroom',
      story: 'The mice have noticed you. Time to hunt properly.',
      tip: 'The edges are walls now. Bumping into them ends the run.',
      map: EMPTY,
      speed: { start: 160, ramp: 2, min: 125 },
      goal: { type: 'score', target: 100 },
      spawns: [{ type: 'mouse', keep: 1 }],
      stars: [45, 28],
    },
    {
      id: 3, name: 'Tiny Crawlers', theme: 'bedroom',
      story: 'Something is chirping under the bed...',
      tip: 'Crickets are worth 15 but hop around and leave soon. Beetles are a light 5-point snack that does not make you longer.',
      map: [
        '....................', '....................', '....................', '....................',
        '....#.........#.....', '....................', '....................', '....................',
        '....................', '....................', '.....S..............', '....................',
        '....................', '....................', '....................', '....#.........#.....',
        '....................', '....................', '....................', '....................',
      ],
      speed: { start: 150, ramp: 2, min: 120 },
      goal: { type: 'score', target: 150 },
      spawns: [
        { type: 'mouse', keep: 1 },
        { type: 'beetle', keep: 1 },
        { type: 'cricket', chance: 0.03, max: 1, atTick: 25 },
      ],
      stars: [60, 38],
    },
    {
      id: 4, name: 'The Living Room', theme: 'living',
      story: 'Sofas, shelves and boxes. A whole jungle of furniture.',
      tip: 'Grab the Shell Shield: it saves you from one crash. After a crash it holds you still until you pick a new direction.',
      map: [
        '....................', '....................', '..####........###...', '..####........###...',
        '....................', '....................', '....................', '........####........',
        '........####........', '....................', '...S................', '....................',
        '........####........', '........####........', '....................', '....................',
        '....................', '..###.........####..', '..###.........####..', '....................',
      ],
      speed: { start: 145, ramp: 2, min: 115 },
      goal: { type: 'eat', count: 12 },
      spawns: [
        { type: 'mouse', keep: 1 },
        { type: 'beetle', chance: 0.02, max: 1 },
        { type: 'cricket', chance: 0.015, max: 1 },
      ],
      power: [{ type: 'shield', atTick: 20, chance: 0.004, max: 1 }],
      stars: [60, 38],
    },
    {
      id: 5, name: 'The Speed Challenge', theme: 'hallway',
      story: 'A long, slippery hallway. Michy is coming home in 60 seconds!',
      tip: 'Score 200 before the clock runs out. Zoomies make you faster and double your points. Golden moths are worth 50!',
      map: [
        '....................', '....................', '....................', '...##..........##...',
        '...##..........##...', '....................', '....................', '.........##.........',
        '....................', '....................', '...S................', '....................',
        '.........##.........', '....................', '....................', '...##..........##...',
        '...##..........##...', '....................', '....................', '....................',
      ],
      speed: { start: 130, ramp: 2, min: 95 },
      goal: { type: 'score', target: 200 },
      timeLimitMs: 60000,
      spawns: [
        { type: 'mouse', keep: 2 },
        { type: 'cricket', chance: 0.02, max: 1 },
        { type: 'moth', chance: 0.012, max: 1, atTick: 60 },
      ],
      power: [{ type: 'zoomies', atTick: 30, chance: 0.006, max: 1 }],
      stars: [45, 30],
    },
    {
      id: 6, name: 'The Garden', theme: 'garden',
      story: 'Out through the cat flap! Hedges, a pond and a grumpy hedgehog.',
      tip: 'The pond is solid. The hedgehog patrols back and forth: never bump into it. A Chill Cube slows time down.',
      map: [
        '....................', '....................', '..#######..#######..', '..........R.........',
        '....................', '....~~~.............', '...~~~~~......#.....', '...~~~~~......#.....',
        '....~~~.......#.....', '....................', '..S.................', '....................',
        '....................', '......#......~~~~...', '......#.....~~~~~...', '......#......~~~....',
        '....................', '..#######..#######..', '....................', '....................',
      ],
      speed: { start: 140, ramp: 2, min: 110 },
      goal: { type: 'score', target: 250 },
      spawns: [
        { type: 'mouse', keep: 1 },
        { type: 'beetle', keep: 1 },
        { type: 'cricket', chance: 0.02, max: 1 },
      ],
      power: [
        { type: 'chill', atTick: 40, chance: 0.004, max: 1 },
        { type: 'shield', chance: 0.002, max: 1 },
      ],
      stars: [130, 85],
    },
    {
      id: 7, name: 'Clever Prey', theme: 'kitchen',
      story: 'Kitchen mice are smart. They run when they see you coming.',
      tip: 'Mice now flee. Herd them into corners and walls to catch them.',
      map: [
        '....................', '....................', '..##............##..', '..#..............#..',
        '....................', '....................', '.......#....#.......', '.......#....#.......',
        '....................', '....................', '..S.................', '....................',
        '.......#....#.......', '.......#....#.......', '....................', '....................',
        '..#..............#..', '..##............##..', '....................', '....................',
      ],
      speed: { start: 140, ramp: 2, min: 110 },
      goal: { type: 'eat', count: 10, prey: 'mouse' },
      spawns: [
        { type: 'mouse', keep: 2, flee: true },
        { type: 'beetle', chance: 0.01, max: 1 },
      ],
      power: [{ type: 'chill', chance: 0.004, max: 1 }],
      stars: [60, 35],
    },
    {
      id: 8, name: 'The Maze', theme: 'basement',
      story: 'Down in the basement, boxes form a twisting maze.',
      tip: 'Tight corridors! Plan your turns before you commit to a path.',
      map: [
        '...S................', '....................', '..########..###..###', '..########..###..###',
        '..########..###..###', '............###.....', '............###.....', '..###..###..########',
        '..###..###..########', '..###..###..########', '.......###..........', '.......###..........',
        '..###..########..###', '..###..########..###', '..###..########..###', '..###...............',
        '..###...............', '..###..###..########', '..###..###..########', '..###..###..########',
      ],
      speed: { start: 150, ramp: 1, min: 130 },
      goal: { type: 'eat', count: 10 },
      spawns: [
        { type: 'mouse', keep: 1 },
        { type: 'cricket', chance: 0.015, max: 1 },
      ],
      power: [{ type: 'shield', atTick: 30, chance: 0.003, max: 1 }],
      stars: [65, 40],
    },
    {
      id: 9, name: 'Special Delivery', theme: 'porch',
      story: 'Parcels of treats were left on the porch. Collect them in order!',
      tip: 'Eat the numbered treats 1 to 5 in order. Only the glowing number can be eaten. Two sets, 90 seconds.',
      map: [
        '....................', '....................', '..##....##....##....', '..##....##....##....',
        '....................', '....................', '....................', '......##....##......',
        '......##....##......', '....................', '..S.................', '....................',
        '......##....##......', '......##....##......', '....................', '....................',
        '....................', '..##....##....##....', '..##....##....##....', '....................',
      ],
      speed: { start: 140, ramp: 1, min: 120 },
      goal: { type: 'sequence', count: 5, sets: 2 },
      timeLimitMs: 90000,
      spawns: [],
      power: [{ type: 'zoomies', chance: 0.003, max: 1 }],
      stars: [70, 45],
    },
    {
      id: 10, name: 'Survival Run', theme: 'night',
      story: 'Lights out. Two robot vacuums are on patrol.',
      tip: 'Survive 60 seconds and eat at least 6 prey. The vacuums turn back when something blocks them.',
      map: [
        '....................', '....................', '..###..........###..', '..#..............#..',
        '....................', '.........R..........', '....................', '......##....##......',
        '......#......#......', '....................', '..S.................', '....................',
        '......#......#......', '......##....##......', '....................', '...............V....',
        '....................', '..#..............#..', '..###..........###..', '....................',
      ],
      speed: { start: 135, ramp: 1, min: 115 },
      goal: { type: 'survive', ms: 60000, minEat: 6 },
      spawns: [
        { type: 'mouse', keep: 1 },
        { type: 'beetle', chance: 0.015, max: 1 },
        { type: 'moth', chance: 0.006, max: 1 },
      ],
      power: [
        { type: 'shield', atTick: 50, chance: 0.003, max: 1 },
        { type: 'chill', chance: 0.003, max: 1 },
      ],
      stars: [150, 240], starsBy: 'score',
    },
    {
      id: 11, name: 'The Final Hunt', theme: 'attic',
      story: 'The attic is dusty and the prey is fast. Every chance counts.',
      tip: 'Prey disappears if you are too slow. Score 300 within 100 seconds.',
      map: [
        '....................', '.......R............', '..####......####....', '..#..........#......',
        '..#..........#......', '....................', '........####........', '....................',
        '#####..........#####', '....................', '..S.................', '....................',
        '#####..........#####', '....................', '........####........', '....................',
        '......#..........#..', '......#..........#..', '....####......####..', '....................',
      ],
      speed: { start: 130, ramp: 1, min: 105 },
      goal: { type: 'score', target: 300 },
      timeLimitMs: 100000,
      spawns: [
        { type: 'mouse', keep: 1, ttl: 90, flee: true },
        { type: 'cricket', chance: 0.02, max: 1 },
        { type: 'moth', chance: 0.01, max: 1, atTick: 80 },
      ],
      power: [
        { type: 'zoomies', chance: 0.004, max: 1 },
        { type: 'shield', chance: 0.002, max: 1 },
      ],
      stars: [85, 60],
    },
    {
      id: 12, name: 'Master of the Wild', theme: 'wild',
      story: 'Beyond the garden fence lies the wild. Prove you are its master.',
      tip: 'Everything you have learned, all at once. Score 400 to win the campaign.',
      map: [
        '....................', '..##.........R...##.', '..#...............#.', '......~~~...........',
        '.....~~~~~.....#....', '......~~~......#....', '...............#....', '..#.................',
        '..##......##........', '..........##....V...', '..S.................', '....................',
        '........#......~~~..', '...#....#.....~~~~~.', '...#...........~~~..', '...#................',
        '..........##........', '.##...........#.....', '.#............##....', '....................',
      ],
      speed: { start: 125, ramp: 1, min: 100 },
      goal: { type: 'score', target: 400 },
      spawns: [
        { type: 'mouse', keep: 1, flee: true },
        { type: 'beetle', chance: 0.012, max: 1 },
        { type: 'cricket', chance: 0.02, max: 1 },
        { type: 'moth', chance: 0.008, max: 1 },
      ],
      power: [
        { type: 'shield', atTick: 40, chance: 0.003, max: 1 },
        { type: 'zoomies', chance: 0.003, max: 1 },
        { type: 'chill', chance: 0.003, max: 1 },
      ],
      stars: [140, 95],
    },
  ];

  // The original Aspect Snake rules, kept as an endless mode: one food at a time,
  // red = 1 point and speeds you up, green = 3 points, yellow = 2 points and slows you down.
  const CLASSIC = {
    id: 'classic', name: 'Terrarium Classic', theme: 'terrarium',
    story: 'Back inside the glass, just like the old days. How long can Michy\'s snake grow?',
    tip: 'Mice speed you up, crickets are worth 3, leaves slow you down. Endless!',
    map: EMPTY,
    speed: { start: 150, ramp: 5, min: 50 },
    goal: { type: 'endless' },
    spawns: [{ pick: ['mouse', 'cricket', 'leaf'], keep: 1, still: true, ttl: 0 }],
    points: { mouse: 1, cricket: 3, leaf: 2 },
    speedDelta: { mouse: -5, cricket: 0, leaf: 10 },
    stars: null,
  };

  MPS.LEVELS = LEVELS;
  MPS.CLASSIC = CLASSIC;
  MPS.levelById = function (id) {
    if (id === 'classic') return CLASSIC;
    return LEVELS.find(function (l) { return l.id === id; }) || null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
