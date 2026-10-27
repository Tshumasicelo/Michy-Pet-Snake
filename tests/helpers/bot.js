/*
 * A simple autopilot used by the tests to prove every level can be completed.
 * It walks a breadth-first path to the nearest edible prey, treats body cells as
 * free once the tail will have moved off them, keeps away from hazards, and
 * refuses moves that would trap it in a pocket smaller than its own body.
 */
'use strict';

const DIR_NAMES = ['up', 'down', 'left', 'right'];

function makeBot(E) {
  const { COLS, ROWS, DIRS } = E;

  function neighbour(g, x, y, d) {
    let nx = x + DIRS[d].x;
    let ny = y + DIRS[d].y;
    if (g.wrap) {
      nx = (nx + COLS) % COLS;
      ny = (ny + ROWS) % ROWS;
    }
    return [nx, ny];
  }

  function solid(g, x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
    if (g.grid[y * COLS + x] !== E.CELL_FLOOR) return true;
    for (const h of g.hazards) {
      if (Math.abs(h.x - x) + Math.abs(h.y - y) <= 1) return true;
    }
    return false;
  }

  // How many moves until the snake's body leaves each cell (0 = free now).
  function bodyTimes(g) {
    const t = new Int16Array(COLS * ROWS);
    const n = g.snake.length;
    for (let i = 0; i < n; i++) {
      const s = g.snake[i];
      t[s.y * COLS + s.x] = Math.max(t[s.y * COLS + s.x], n - i + g.growPending);
    }
    return t;
  }

  function bfs(g, sx, sy, firstStep, body) {
    const dist = new Int16Array(COLS * ROWS).fill(-1);
    const first = new Int8Array(COLS * ROWS).fill(-1);
    const q = [];
    const start = sy * COLS + sx;
    dist[start] = 0;
    q.push(start);
    while (q.length) {
      const i = q.shift();
      const x = i % COLS;
      const y = (i - x) / COLS;
      for (let k = 0; k < 4; k++) {
        const [nx, ny] = neighbour(g, x, y, DIR_NAMES[k]);
        if (solid(g, nx, ny)) continue;
        const j = ny * COLS + nx;
        if (dist[j] !== -1) continue;
        const d = dist[i] + 1;
        if (body[j] > d) continue;
        dist[j] = d;
        first[j] = i === start ? (firstStep === undefined ? k : firstStep) : first[i];
        q.push(j);
      }
    }
    return { dist, first };
  }

  function areaAfter(g, d, body) {
    const head = g.snake[0];
    const [nx, ny] = neighbour(g, head.x, head.y, d);
    if (solid(g, nx, ny) || body[ny * COLS + nx] > 1) return -1;
    const { dist } = bfs(g, nx, ny, 0, body);
    let n = 0;
    for (let i = 0; i < dist.length; i++) if (dist[i] >= 0) n++;
    return n;
  }

  return function choose(g) {
    const head = g.snake[0];
    const body = bodyTimes(g);
    const { dist, first } = bfs(g, head.x, head.y, undefined, body);
    const len = g.snake.length + 2;

    const targets = g.prey.filter((p) => E.isEdible(g, p)).concat(g.powerups);
    targets.sort((a, b) => dist[a.y * COLS + a.x] - dist[b.y * COLS + b.x]);
    for (const t of targets) {
      const j = t.y * COLS + t.x;
      if (dist[j] < 0) continue;
      const d = DIR_NAMES[first[j]];
      if (d === E.OPPOSITE[g.dir] && !g.waiting) continue;
      if (areaAfter(g, d, body) >= Math.min(len, 60)) return d;
    }
    // No safe target: take the move that keeps the most room.
    let best = null;
    let bestArea = -1;
    for (const d of DIR_NAMES) {
      if (d === E.OPPOSITE[g.dir] && !g.waiting) continue;
      const a = areaAfter(g, d, body);
      if (a > bestArea) { bestArea = a; best = d; }
    }
    return best || g.dir;
  };
}

/** Plays a level to the end. Returns the finished game state. */
function playLevel(E, level, seed, maxTicks = 20000) {
  const g = E.createGame(level, seed);
  const choose = makeBot(E);
  for (let t = 0; t < maxTicks && g.alive && !g.won; t++) {
    const d = choose(g);
    if (g.waiting || d !== g.dir) E.queueTurn(g, d);
    E.step(g);
  }
  return g;
}

module.exports = { makeBot, playLevel };
