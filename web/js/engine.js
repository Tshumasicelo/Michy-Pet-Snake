/*
 * Michy's Pet Snake: game simulation.
 *
 * Pure rules, no DOM and no drawing, so it runs the same in the browser, in the
 * Android WebView and in Node tests. Everything random goes through a seeded RNG,
 * so a game with the same seed and the same inputs always plays out the same way.
 *
 * Time is counted in ticks (one snake move each). Game-clock milliseconds are
 * accumulated from the tick length, so timers stay exact even if frames drop.
 */
(function (root) {
  'use strict';
  const MPS = (root.MPS = root.MPS || {});

  const COLS = 20;
  const ROWS = 20;

  const CELL_FLOOR = 0;
  const CELL_WALL = 1;
  const CELL_WATER = 2;

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  // Prey: points, how much the snake grows, lifetime in ticks (0 = stays) and how it moves.
  const PREY = {
    mouse: { name: 'Mouse', points: 10, grow: 1, ttl: 0 },
    beetle: { name: 'Beetle', points: 5, grow: 0, ttl: 0 },
    cricket: { name: 'Cricket', points: 15, grow: 1, ttl: 80, hopEvery: 9 },
    moth: { name: 'Golden Moth', points: 50, grow: 1, ttl: 70, flutterEvery: 3 },
    treat: { name: 'Treat', points: 20, grow: 1, ttl: 0 },
    leaf: { name: 'Leaf', points: 2, grow: 1, ttl: 0 },
  };

  // Power-ups vanish after `ttl` ticks; effects last `duration` ticks.
  const POWER = {
    shield: { name: 'Shell Shield', ttl: 90 },
    zoomies: { name: 'Zoomies', ttl: 70, duration: 70 },
    chill: { name: 'Chill Cube', ttl: 70, duration: 60 },
  };

  const ZOOMIES_SPEED = 0.75;
  const CHILL_SPEED = 1.5;
  const TIME_BONUS_PER_SECOND = 5;
  const MAX_QUEUED_TURNS = 2;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Parses a level map into a cell grid plus start positions. */
  function parseMap(map) {
    if (!Array.isArray(map) || map.length !== ROWS) throw new Error('Map must have ' + ROWS + ' rows');
    const grid = new Uint8Array(COLS * ROWS);
    let start = null;
    const hazards = [];
    for (let y = 0; y < ROWS; y++) {
      const row = map[y];
      if (row.length !== COLS) throw new Error('Map row ' + y + ' must have ' + COLS + ' columns');
      for (let x = 0; x < COLS; x++) {
        const ch = row[x];
        if (ch === '#') grid[y * COLS + x] = CELL_WALL;
        else if (ch === '~') grid[y * COLS + x] = CELL_WATER;
        else if (ch === 'S') start = { x: x, y: y };
        else if (ch === 'R') hazards.push({ x: x, y: y, dx: 1, dy: 0 });
        else if (ch === 'V') hazards.push({ x: x, y: y, dx: 0, dy: 1 });
        else if (ch !== '.') throw new Error('Unknown map character "' + ch + '" at ' + x + ',' + y);
      }
    }
    if (!start) throw new Error('Map has no snake start (S)');
    return { grid: grid, start: start, hazards: hazards };
  }

  /** Cells the snake can reach from the start, so nothing ever spawns in a sealed pocket. */
  function reachableFrom(grid, start, wrap) {
    const seen = new Uint8Array(COLS * ROWS);
    const stack = [start.y * COLS + start.x];
    seen[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % COLS;
      const y = (i - x) / COLS;
      for (const k in DIRS) {
        let nx = x + DIRS[k].x;
        let ny = y + DIRS[k].y;
        if (wrap) {
          nx = (nx + COLS) % COLS;
          ny = (ny + ROWS) % ROWS;
        } else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = ny * COLS + nx;
        if (!seen[j] && grid[j] === CELL_FLOOR) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    return seen;
  }

  function createGame(level, seed) {
    const parsed = parseMap(level.map);
    const s = parsed.start;
    const g = {
      level: level,
      cols: COLS,
      rows: ROWS,
      wrap: !!level.wrap,
      grid: parsed.grid,
      reachable: reachableFrom(parsed.grid, s, !!level.wrap),
      rng: mulberry32(seed === undefined ? 1 : seed),
      snake: [{ x: s.x, y: s.y }, { x: s.x - 1, y: s.y }, { x: s.x - 2, y: s.y }],
      prev: null,
      dir: 'right',
      queue: [],
      growPending: 0,
      tick: 0,
      tickMs: level.speed.start,
      elapsedMs: 0,
      score: 0,
      bonus: 0,
      eaten: 0,
      eatenByType: {},
      prey: [],
      powerups: [],
      hazards: parsed.hazards.map(function (h) { return { x: h.x, y: h.y, px: h.x, py: h.y, dx: h.dx, dy: h.dy }; }),
      shield: false,
      shieldUsed: 0,
      zoomies: 0,
      chill: 0,
      waiting: true, // waits for the first direction (and again after a shield save)
      alive: true,
      won: false,
      deathReason: null,
      seqNext: 1,
      seqSet: 0,
      spawnedOnce: {},
      maxLength: 3,
    };
    g.prev = g.snake.map(copyPoint);
    if (level.goal.type === 'sequence') spawnTreatSet(g);
    runSpawns(g, true);
    return g;
  }

  function copyPoint(p) { return { x: p.x, y: p.y }; }

  /** Current milliseconds per move, including power-up effects. */
  function tickMs(g) {
    let ms = g.tickMs;
    if (g.zoomies > 0) ms *= ZOOMIES_SPEED;
    if (g.chill > 0) ms *= CHILL_SPEED;
    return ms;
  }

  /**
   * Queues a turn. Each turn is checked against the last queued direction rather
   * than the current one, so two quick presses can never reverse the snake into
   * its own neck. Returns true when the input was accepted.
   */
  function queueTurn(g, dir) {
    if (!DIRS[dir] || !g.alive || g.won) return false;
    if (g.waiting) {
      // Starting (or recovering after a shield save): any direction except straight back into the body.
      const neck = g.snake[1];
      const head = g.snake[0];
      const nx = wrapX(g, head.x + DIRS[dir].x);
      const ny = wrapY(g, head.y + DIRS[dir].y);
      if (neck && neck.x === nx && neck.y === ny) return false;
      g.dir = dir;
      g.queue.length = 0;
      g.waiting = false;
      return true;
    }
    const last = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
    if (dir === last || dir === OPPOSITE[last]) return false;
    if (g.queue.length >= MAX_QUEUED_TURNS) return false;
    g.queue.push(dir);
    return true;
  }

  function wrapX(g, x) { return g.wrap ? (x + COLS) % COLS : x; }
  function wrapY(g, y) { return g.wrap ? (y + ROWS) % ROWS : y; }
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
  function cellAt(g, x, y) { return g.grid[y * COLS + x]; }

  function preyAt(g, x, y) {
    for (let i = 0; i < g.prey.length; i++) if (g.prey[i].x === x && g.prey[i].y === y) return g.prey[i];
    return null;
  }
  function powerAt(g, x, y) {
    for (let i = 0; i < g.powerups.length; i++) if (g.powerups[i].x === x && g.powerups[i].y === y) return g.powerups[i];
    return null;
  }
  function hazardAt(g, x, y) {
    for (let i = 0; i < g.hazards.length; i++) if (g.hazards[i].x === x && g.hazards[i].y === y) return g.hazards[i];
    return null;
  }
  function snakeAt(g, x, y, ignoreTail) {
    const n = ignoreTail ? g.snake.length - 1 : g.snake.length;
    for (let i = 0; i < n; i++) if (g.snake[i].x === x && g.snake[i].y === y) return true;
    return false;
  }

  function isEdible(g, p) {
    return p.type !== 'treat' || p.num === g.seqNext;
  }

  function pointsFor(g, type) {
    const table = g.level.points;
    return table && table[type] !== undefined ? table[type] : PREY[type].points;
  }

  /** Advances the game by one move. Returns a list of events for sound, effects and stats. */
  function step(g) {
    const events = [];
    if (g.waiting || !g.alive || g.won) return events;

    if (g.queue.length) g.dir = g.queue.shift();
    const head = g.snake[0];
    let nx = head.x + DIRS[g.dir].x;
    let ny = head.y + DIRS[g.dir].y;
    if (g.wrap) {
      nx = wrapX(g, nx);
      ny = wrapY(g, ny);
    }

    const target = inBounds(nx, ny) ? preyAt(g, nx, ny) : null;
    const eating = target && isEdible(g, target) ? target : null;
    const willGrow = g.growPending > 0 || (eating && PREY[eating.type].grow > 0);

    let crash = null;
    if (!inBounds(nx, ny)) crash = 'edge';
    else if (cellAt(g, nx, ny) === CELL_WALL) crash = 'wall';
    else if (cellAt(g, nx, ny) === CELL_WATER) crash = 'water';
    else if (hazardAt(g, nx, ny)) crash = 'hazard';
    // The tail moves out of the way this tick unless the snake is growing.
    else if (snakeAt(g, nx, ny, !willGrow)) crash = 'self';

    if (crash) {
      if (g.shield) {
        g.shield = false;
        g.shieldUsed++;
        g.waiting = true;
        g.queue.length = 0;
        g.prev = g.snake.map(copyPoint);
        events.push({ type: 'shield', reason: crash, x: nx, y: ny });
        return events;
      }
      g.alive = false;
      g.deathReason = crash;
      g.prev = g.snake.map(copyPoint);
      events.push({ type: 'die', reason: crash, x: head.x, y: head.y });
      return events;
    }

    g.prev = g.snake.map(copyPoint);
    g.snake.unshift({ x: nx, y: ny });

    if (eating) {
      const def = PREY[eating.type];
      const mult = g.zoomies > 0 ? 2 : 1;
      const pts = pointsFor(g, eating.type) * mult;
      g.score += pts;
      g.eaten++;
      g.eatenByType[eating.type] = (g.eatenByType[eating.type] || 0) + 1;
      g.growPending += def.grow;
      removeFrom(g.prey, eating);
      const delta = g.level.speedDelta ? g.level.speedDelta[eating.type] || 0 : -g.level.speed.ramp;
      g.tickMs = Math.max(g.level.speed.min, g.tickMs + delta);
      events.push({ type: 'eat', prey: eating.type, points: pts, x: nx, y: ny, num: eating.num });
      if (eating.type === 'treat') advanceSequence(g, events);
    }

    if (g.growPending > 0) g.growPending--;
    else g.snake.pop();
    // On a tail-chase move the tail's previous spot needs a match for smooth drawing.
    while (g.prev.length < g.snake.length) g.prev.push(copyPoint(g.prev[g.prev.length - 1]));
    if (g.snake.length > g.maxLength) g.maxLength = g.snake.length;

    const power = powerAt(g, nx, ny);
    if (power) {
      removeFrom(g.powerups, power);
      if (power.type === 'shield') g.shield = true;
      else if (power.type === 'zoomies') g.zoomies = POWER.zoomies.duration;
      else if (power.type === 'chill') g.chill = POWER.chill.duration;
      events.push({ type: 'power', power: power.type, x: nx, y: ny });
    }

    g.elapsedMs += tickMs(g);
    g.tick++;
    if (g.zoomies > 0) g.zoomies--;
    if (g.chill > 0) g.chill--;

    updatePrey(g, events);
    updatePowerups(g);
    updateHazards(g);
    runSpawns(g, false);
    checkGoal(g, events);
    return events;
  }

  function removeFrom(list, item) {
    const i = list.indexOf(item);
    if (i >= 0) list.splice(i, 1);
  }

  function advanceSequence(g, events) {
    const goal = g.level.goal;
    g.seqNext++;
    if (g.seqNext > goal.count) {
      g.seqSet++;
      events.push({ type: 'set', set: g.seqSet });
      if (g.seqSet < goal.sets) {
        g.seqNext = 1;
        spawnTreatSet(g);
      }
    }
  }

  function spawnTreatSet(g) {
    for (let n = 1; n <= g.level.goal.count; n++) {
      const cell = pickFreeCell(g, 3);
      if (cell) g.prey.push(makePrey('treat', cell, { num: n }));
    }
  }

  function makePrey(type, cell, extra) {
    const p = { type: type, x: cell.x, y: cell.y, px: cell.x, py: cell.y, age: 0, ttl: PREY[type].ttl, flee: false, still: false, num: 0 };
    if (extra) for (const k in extra) if (extra[k] !== undefined) p[k] = extra[k];
    return p;
  }

  /** Is this cell empty floor that the snake can reach and nothing is standing on? */
  function isFree(g, x, y) {
    if (!inBounds(x, y)) return false;
    const i = y * COLS + x;
    if (g.grid[i] !== CELL_FLOOR || !g.reachable[i]) return false;
    return !snakeAt(g, x, y, false) && !preyAt(g, x, y) && !powerAt(g, x, y) && !hazardAt(g, x, y);
  }

  /**
   * Picks a random free cell, preferring cells at least `minHeadDist` away from the head.
   * Returns null when the board is full instead of looping forever (the original bug).
   */
  function pickFreeCell(g, minHeadDist) {
    const head = g.snake[0];
    const near = [];
    const far = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!isFree(g, x, y)) continue;
        const d = Math.abs(x - head.x) + Math.abs(y - head.y);
        (d >= minHeadDist ? far : near).push(y * COLS + x);
      }
    }
    const pool = far.length ? far : near;
    if (!pool.length) return null;
    const i = pool[Math.floor(g.rng() * pool.length)];
    return { x: i % COLS, y: Math.floor(i / COLS) };
  }

  function countOf(list, type) {
    let n = 0;
    for (let i = 0; i < list.length; i++) if (list[i].type === type) n++;
    return n;
  }

  function runSpawns(g, initial) {
    const rules = g.level.spawns || [];
    for (let r = 0; r < rules.length; r++) spawnByRule(g, rules[r], 'prey', initial, r);
    const powers = g.level.power || [];
    for (let r = 0; r < powers.length; r++) spawnByRule(g, powers[r], 'power', initial, r);
  }

  function spawnByRule(g, rule, kind, initial, index) {
    const list = kind === 'prey' ? g.prey : g.powerups;
    const types = rule.pick || [rule.type];
    let have = 0;
    for (let t = 0; t < types.length; t++) have += countOf(list, types[t]);
    const key = kind + index;

    let want = 0;
    if (rule.keep) want = rule.keep - have;
    else if (!initial) {
      const max = rule.max || 1;
      if (have < max) {
        if (rule.atTick !== undefined && !g.spawnedOnce[key] && g.tick >= rule.atTick) want = 1;
        else if (rule.chance && g.rng() < rule.chance) want = 1;
      }
    }
    for (let n = 0; n < want; n++) {
      const cell = pickFreeCell(g, 3);
      if (!cell) return;
      const type = types.length > 1 ? types[Math.floor(g.rng() * types.length)] : types[0];
      g.spawnedOnce[key] = true;
      if (kind === 'prey') {
        g.prey.push(makePrey(type, cell, {
          ttl: rule.ttl !== undefined ? rule.ttl : PREY[type].ttl,
          flee: !!rule.flee,
          still: !!rule.still,
        }));
      } else {
        g.powerups.push({ type: type, x: cell.x, y: cell.y, age: 0, ttl: POWER[type].ttl });
      }
    }
  }

  function manhattan(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }

  function updatePrey(g, events) {
    const head = g.snake[0];
    for (let i = g.prey.length - 1; i >= 0; i--) {
      const p = g.prey[i];
      p.px = p.x;
      p.py = p.y;
      p.age++;
      if (p.ttl > 0 && p.age >= p.ttl) {
        g.prey.splice(i, 1);
        events.push({ type: 'escape', prey: p.type, x: p.x, y: p.y });
        continue;
      }
      if (p.still) continue;
      const def = PREY[p.type];
      if (p.flee) moveFleeing(g, p, head);
      else if (def.hopEvery && p.age % def.hopEvery === 0) hop(g, p, 3);
      else if (def.flutterEvery && p.age % def.flutterEvery === 0) flutter(g, p);
    }
  }

  // Fleeing mice move every 3 ticks when the snake is near, to the neighbour farthest from the head.
  function moveFleeing(g, p, head) {
    const d = manhattan(p.x, p.y, head.x, head.y);
    if (d > 6) {
      if (p.age % 8 === 0 && g.rng() < 0.35) stepRandom(g, p, false);
      return;
    }
    if (p.age % 3 !== 0) return;
    let best = null;
    let bestD = d;
    const order = shuffledDirs(g);
    for (let k = 0; k < order.length; k++) {
      const nx = p.x + DIRS[order[k]].x;
      const ny = p.y + DIRS[order[k]].y;
      if (!isFree(g, nx, ny)) continue;
      const nd = manhattan(nx, ny, head.x, head.y);
      if (nd > bestD) { bestD = nd; best = { x: nx, y: ny }; }
    }
    if (best) { p.x = best.x; p.y = best.y; }
  }

  function shuffledDirs(g) {
    const a = ['up', 'down', 'left', 'right'];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(g.rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function stepRandom(g, p, diagonal) {
    const opts = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!diagonal && dx && dy) continue;
        if (isFree(g, p.x + dx, p.y + dy)) opts.push({ x: p.x + dx, y: p.y + dy });
      }
    }
    if (!opts.length) return;
    const c = opts[Math.floor(g.rng() * opts.length)];
    p.x = c.x;
    p.y = c.y;
  }

  function hop(g, p, radius) {
    const opts = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (!dx && !dy) continue;
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        if (isFree(g, p.x + dx, p.y + dy)) opts.push({ x: p.x + dx, y: p.y + dy });
      }
    }
    if (!opts.length) return;
    const c = opts[Math.floor(g.rng() * opts.length)];
    p.x = c.x;
    p.y = c.y;
  }

  function flutter(g, p) { stepRandom(g, p, true); }

  function updatePowerups(g) {
    for (let i = g.powerups.length - 1; i >= 0; i--) {
      const pw = g.powerups[i];
      pw.age++;
      if (pw.ttl > 0 && pw.age >= pw.ttl) g.powerups.splice(i, 1);
    }
  }

  // Hazards move every other tick and turn back when anything is in the way,
  // so they never run into the snake: only the snake can run into them.
  function updateHazards(g) {
    for (let i = 0; i < g.hazards.length; i++) {
      const h = g.hazards[i];
      h.px = h.x;
      h.py = h.y;
      if (g.tick % 2 !== 0) continue;
      if (!hazardStep(g, h)) {
        h.dx = -h.dx;
        h.dy = -h.dy;
        hazardStep(g, h);
      }
    }
  }

  function hazardStep(g, h) {
    const nx = h.x + h.dx;
    const ny = h.y + h.dy;
    if (!inBounds(nx, ny) || cellAt(g, nx, ny) !== CELL_FLOOR) return false;
    if (snakeAt(g, nx, ny, false) || preyAt(g, nx, ny) || powerAt(g, nx, ny) || hazardAt(g, nx, ny)) return false;
    h.x = nx;
    h.y = ny;
    return true;
  }

  function checkGoal(g, events) {
    const goal = g.level.goal;
    let done = false;
    if (goal.type === 'eat') done = (goal.prey ? g.eatenByType[goal.prey] || 0 : g.eaten) >= goal.count;
    else if (goal.type === 'score') done = g.score >= goal.target;
    else if (goal.type === 'sequence') done = g.seqSet >= goal.sets;
    else if (goal.type === 'survive') done = g.elapsedMs >= goal.ms && g.eaten >= goal.minEat;

    if (done) {
      g.won = true;
      if (g.level.timeLimitMs) {
        g.bonus = Math.floor(Math.max(0, g.level.timeLimitMs - g.elapsedMs) / 1000) * TIME_BONUS_PER_SECOND;
      } else if (goal.type === 'survive') {
        g.bonus = g.snake.length * 2;
      }
      g.score += g.bonus;
      events.push({ type: 'win', bonus: g.bonus });
      return;
    }
    if (g.level.timeLimitMs && g.elapsedMs >= g.level.timeLimitMs) {
      g.alive = false;
      g.deathReason = 'time';
      events.push({ type: 'die', reason: 'time', x: g.snake[0].x, y: g.snake[0].y });
    }
  }

  /** Progress toward the goal as { now, need, label } for the HUD. */
  function progress(g) {
    const goal = g.level.goal;
    switch (goal.type) {
      case 'eat': {
        const n = goal.prey ? g.eatenByType[goal.prey] || 0 : g.eaten;
        return { now: Math.min(n, goal.count), need: goal.count, label: goal.prey === 'mouse' ? 'Mice' : 'Prey' };
      }
      case 'score':
        return { now: Math.min(g.score, goal.target), need: goal.target, label: 'Score' };
      case 'sequence':
        return { now: Math.min(g.seqSet * goal.count + g.seqNext - 1, goal.count * goal.sets), need: goal.count * goal.sets, label: 'Treats' };
      case 'survive':
        return { now: Math.min(g.eaten, goal.minEat), need: goal.minEat, label: 'Prey' };
      default:
        return { now: g.score, need: 0, label: 'Score' };
    }
  }

  /** Seconds left on the level clock, or null when the level has no clock. */
  function timeLeft(g) {
    const goal = g.level.goal;
    const limit = g.level.timeLimitMs || (goal.type === 'survive' ? goal.ms : 0);
    if (!limit) return null;
    return Math.max(0, (limit - g.elapsedMs) / 1000);
  }

  function describeGoal(level) {
    const goal = level.goal;
    let text;
    switch (goal.type) {
      case 'eat': text = 'Eat ' + goal.count + (goal.prey === 'mouse' ? ' mice' : ' prey'); break;
      case 'score': text = 'Score ' + goal.target + ' points'; break;
      case 'sequence': text = 'Collect treats 1 to ' + goal.count + ' in order, ' + goal.sets + ' times'; break;
      case 'survive': text = 'Survive ' + Math.round(goal.ms / 1000) + ' s and eat ' + goal.minEat + ' prey'; break;
      default: text = 'Grow as long as you can';
    }
    if (level.timeLimitMs) text += ' within ' + Math.round(level.timeLimitMs / 1000) + ' s';
    return text;
  }

  /**
   * 0 to 3 stars for a finished game: one for clearing the level, more for clearing
   * it fast (level.stars holds the 2-star and 3-star times in seconds), or for a
   * high score on levels with starsBy: 'score'.
   */
  function starsFor(level, g) {
    if (!g.won || !level.stars) return 0;
    if (level.starsBy === 'score') {
      if (g.score >= level.stars[1]) return 3;
      if (g.score >= level.stars[0]) return 2;
      return 1;
    }
    const seconds = g.elapsedMs / 1000;
    if (seconds <= level.stars[1]) return 3;
    if (seconds <= level.stars[0]) return 2;
    return 1;
  }

  /** Human-readable star targets, e.g. ["Clear it", "Within 0:45", "Within 0:28"]. */
  function starTargets(level) {
    if (!level.stars) return [];
    if (level.starsBy === 'score') return ['Survive', level.stars[0] + ' points', level.stars[1] + ' points'];
    return ['Clear it', 'Within ' + clock(level.stars[0]), 'Within ' + clock(level.stars[1])];
  }

  function clock(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  MPS.Engine = {
    COLS: COLS,
    ROWS: ROWS,
    CELL_FLOOR: CELL_FLOOR,
    CELL_WALL: CELL_WALL,
    CELL_WATER: CELL_WATER,
    DIRS: DIRS,
    OPPOSITE: OPPOSITE,
    PREY: PREY,
    POWER: POWER,
    mulberry32: mulberry32,
    parseMap: parseMap,
    reachableFrom: reachableFrom,
    createGame: createGame,
    queueTurn: queueTurn,
    step: step,
    tickMs: tickMs,
    isFree: isFree,
    isEdible: isEdible,
    progress: progress,
    timeLeft: timeLeft,
    describeGoal: describeGoal,
    starsFor: starsFor,
    starTargets: starTargets,
    clock: clock,
  };
})(typeof window !== 'undefined' ? window : globalThis);
