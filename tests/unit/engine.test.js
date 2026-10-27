'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const MPS = require('./load');
const { playLevel, makeBot } = require('../helpers/bot');

const E = MPS.Engine;

/** A started game with no prey, power-ups or random spawns, so a test controls the board. */
function quiet(level, seed) {
  const L = Object.assign({}, level, { spawns: [], power: [] });
  const g = E.createGame(L, seed || 1);
  g.prey.length = 0;
  g.powerups.length = 0;
  return g;
}
function start(g, dir) {
  assert.equal(E.queueTurn(g, dir || 'right'), true);
}
function put(g, type, x, y, extra) {
  g.prey.push(Object.assign({ type, x, y, px: x, py: y, age: 0, ttl: 0, flee: false, still: true, num: 0 }, extra));
}
const L = (id) => MPS.levelById(id);

test('the snake moves one cell per step in its direction', () => {
  const g = quiet(L(2));
  const head = { ...g.snake[0] };
  start(g);
  E.step(g);
  assert.deepEqual(g.snake[0], { x: head.x + 1, y: head.y });
  assert.equal(g.snake.length, 3);
});

test('nothing moves until the player picks a first direction', () => {
  const g = quiet(L(2));
  const before = JSON.stringify(g.snake);
  E.step(g);
  assert.equal(JSON.stringify(g.snake), before);
  assert.equal(E.queueTurn(g, 'left'), false, 'cannot start by reversing into the body');
});

test('reversing straight back is ignored', () => {
  const g = quiet(L(2));
  start(g);
  assert.equal(E.queueTurn(g, 'left'), false);
  E.step(g);
  assert.equal(g.alive, true);
});

test('two quick turns inside one tick cannot fold the snake into its neck (original bug)', () => {
  const g = quiet(L(2));
  start(g);
  E.step(g);
  const { x, y } = g.snake[0];
  assert.equal(E.queueTurn(g, 'up'), true);
  assert.equal(E.queueTurn(g, 'left'), true, 'left is legal after up');
  E.step(g);
  assert.deepEqual(g.snake[0], { x, y: y - 1 });
  E.step(g);
  assert.deepEqual(g.snake[0], { x: x - 1, y: y - 1 });
  assert.equal(g.alive, true);
});

test('at most two turns are buffered', () => {
  const g = quiet(L(2));
  start(g);
  assert.equal(E.queueTurn(g, 'up'), true);
  assert.equal(E.queueTurn(g, 'right'), true);
  assert.equal(E.queueTurn(g, 'down'), false);
});

test('eating a mouse scores 10 and grows the snake by one', () => {
  const g = quiet(L(2));
  start(g);
  const h = g.snake[0];
  put(g, 'mouse', h.x + 1, h.y);
  const events = E.step(g);
  assert.equal(g.score, 10);
  assert.equal(g.snake.length, 4);
  assert.equal(g.prey.length, 0);
  assert.ok(events.some((e) => e.type === 'eat' && e.prey === 'mouse'));
});

test('beetles score 5 without growing; zoomies double points', () => {
  const g = quiet(L(3));
  start(g);
  const h = g.snake[0];
  put(g, 'beetle', h.x + 1, h.y);
  E.step(g);
  assert.equal(g.score, 5);
  assert.equal(g.snake.length, 3);
  g.zoomies = 10;
  put(g, 'mouse', g.snake[0].x + 1, g.snake[0].y);
  E.step(g);
  assert.equal(g.score, 25);
});

test('eating speeds the snake up, but never past the level minimum', () => {
  const g = quiet(L(2));
  start(g);
  for (let i = 0; i < 40; i++) {
    put(g, 'mouse', g.snake[0].x + 1, g.snake[0].y);
    if (g.snake[0].x + 1 >= 20) break;
    E.step(g);
  }
  assert.ok(g.tickMs < L(2).speed.start);
  assert.ok(g.tickMs >= L(2).speed.min);
});

test('moving into the cell the tail is leaving is allowed', () => {
  const g = quiet(L(2));
  g.snake = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }];
  g.prev = g.snake.map((p) => ({ ...p }));
  g.dir = 'up';
  g.waiting = false;
  assert.equal(E.queueTurn(g, 'right'), true);
  E.step(g);
  assert.equal(g.alive, true);
  assert.deepEqual(g.snake[0], { x: 6, y: 5 });
});

test('...but not while the snake is growing', () => {
  const g = quiet(L(2));
  g.snake = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }];
  g.prev = g.snake.map((p) => ({ ...p }));
  g.dir = 'up';
  g.waiting = false;
  g.growPending = 1;
  E.queueTurn(g, 'right');
  E.step(g);
  assert.equal(g.alive, false);
  assert.equal(g.deathReason, 'self');
});

test('edges are deadly except on the wrap-around level', () => {
  const g = quiet(L(2));
  g.snake = [{ x: 19, y: 3 }, { x: 18, y: 3 }, { x: 17, y: 3 }];
  start(g);
  E.step(g);
  assert.equal(g.deathReason, 'edge');

  const w = quiet(L(1));
  w.snake = [{ x: 19, y: 3 }, { x: 18, y: 3 }, { x: 17, y: 3 }];
  start(w);
  E.step(w);
  assert.equal(w.alive, true);
  assert.deepEqual(w.snake[0], { x: 0, y: 3 });
});

test('walls and water end the run with the right reason', () => {
  const g = quiet(L(4)); // sofa at x 2..5, y 2..3
  g.snake = [{ x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 1 }];
  start(g);
  E.step(g);
  assert.equal(g.deathReason, 'wall');

  const p = quiet(L(6)); // pond cell at (3,6)
  p.hazards.length = 0;
  p.snake = [{ x: 2, y: 6 }, { x: 1, y: 6 }, { x: 0, y: 6 }];
  start(p);
  E.step(p);
  assert.equal(p.deathReason, 'water');
});

test('a Shell Shield absorbs one crash and waits for a new direction', () => {
  const g = quiet(L(2));
  g.snake = [{ x: 19, y: 3 }, { x: 18, y: 3 }, { x: 17, y: 3 }];
  g.shield = true;
  start(g);
  const events = E.step(g);
  assert.ok(events.some((e) => e.type === 'shield'));
  assert.equal(g.alive, true);
  assert.equal(g.shield, false);
  assert.equal(g.waiting, true);
  assert.deepEqual(g.snake[0], { x: 19, y: 3 }, 'did not move into the edge');
  assert.equal(E.queueTurn(g, 'left'), false, 'cannot turn back into the body');
  assert.equal(E.queueTurn(g, 'down'), true);
  E.step(g);
  assert.deepEqual(g.snake[0], { x: 19, y: 4 });
  // A second crash is fatal.
  g.snake = [{ x: 19, y: 19 }, { x: 19, y: 18 }, { x: 19, y: 17 }];
  g.dir = 'down';
  E.step(g);
  assert.equal(g.alive, false);
});

test('power-ups apply their effect when collected', () => {
  const g = quiet(L(5));
  start(g);
  const h = g.snake[0];
  g.powerups.push({ type: 'zoomies', x: h.x + 1, y: h.y, age: 0, ttl: 99 });
  const ms = E.tickMs(g);
  E.step(g);
  assert.ok(g.zoomies > 0);
  assert.ok(E.tickMs(g) < ms);
  g.powerups.push({ type: 'chill', x: g.snake[0].x + 1, y: g.snake[0].y, age: 0, ttl: 99 });
  E.step(g);
  assert.ok(g.chill > 0);
});

test('hazards never step onto the snake; running into one is fatal', () => {
  const g = quiet(L(6)); // hedgehog patrols row 3
  const h = g.hazards[0];
  g.snake = [{ x: h.x + 2, y: 4 }, { x: h.x + 2, y: 5 }, { x: h.x + 2, y: 6 }];
  start(g, 'up'); // onto row 3, two cells right of the hedgehog
  for (let i = 0; i < 6 && g.alive; i++) {
    E.step(g);
    for (const z of g.hazards) for (const s of g.snake) assert.ok(!(z.x === s.x && z.y === s.y), 'hazard overlapped the snake');
    if (g.alive) E.queueTurn(g, g.dir === 'up' ? 'left' : g.dir);
  }
  const h2 = quiet(L(6));
  const hz = h2.hazards[0];
  h2.snake = [{ x: hz.x - 1, y: hz.y }, { x: hz.x - 2, y: hz.y }, { x: hz.x - 3, y: hz.y }];
  start(h2);
  E.step(h2);
  assert.equal(h2.deathReason, 'hazard');
});

test('timed levels fail when the clock runs out', () => {
  const g = quiet(L(5));
  start(g);
  g.elapsedMs = L(5).timeLimitMs - 1;
  const events = E.step(g);
  assert.equal(g.alive, false);
  assert.equal(g.deathReason, 'time');
  assert.ok(events.some((e) => e.type === 'die' && e.reason === 'time'));
});

test('Special Delivery treats must be eaten in order', () => {
  const g = E.createGame(L(9), 3);
  start(g);
  const two = g.prey.find((p) => p.num === 2);
  g.snake = [{ x: two.x - 1, y: two.y }, { x: two.x - 2, y: two.y }, { x: two.x - 3, y: two.y }];
  // keep the path clear for the test
  for (const s of g.snake) g.grid[s.y * 20 + s.x] = 0;
  E.step(g);
  assert.equal(g.score, 0, 'treat 2 is not edible before treat 1');
  assert.ok(g.prey.includes(two));
  const one = g.prey.find((p) => p.num === 1);
  one.x = g.snake[0].x + 1;
  one.y = g.snake[0].y;
  assert.ok(one.x < 20 && g.grid[one.y * 20 + one.x] === E.CELL_FLOOR, 'test setup: treat 1 must land on floor');
  E.step(g);
  assert.equal(g.seqNext, 2);
  assert.equal(g.score, 20);
});

test('classic mode keeps the original rules: 1 / 3 / 2 points and speed changes', () => {
  const g = quiet(MPS.CLASSIC);
  start(g);
  const startMs = g.tickMs;
  put(g, 'mouse', g.snake[0].x + 1, g.snake[0].y);
  E.step(g);
  assert.equal(g.score, 1);
  assert.equal(g.tickMs, startMs - 5);
  put(g, 'cricket', g.snake[0].x + 1, g.snake[0].y);
  E.step(g);
  assert.equal(g.score, 4);
  assert.equal(g.tickMs, startMs - 5);
  put(g, 'leaf', g.snake[0].x + 1, g.snake[0].y);
  E.step(g);
  assert.equal(g.score, 6);
  assert.equal(g.tickMs, startMs + 5);
});

test('spawning on a full board does not hang (original infinite-loop bug)', () => {
  const rows = ['..S#################'];
  for (let i = 1; i < 20; i++) rows.push('####################');
  const tiny = { id: 99, name: 'Tiny', theme: 'bedroom', map: rows, speed: { start: 100, ramp: 0, min: 100 }, goal: { type: 'endless' }, spawns: [{ type: 'mouse', keep: 1 }], stars: null };
  const g = E.createGame(tiny, 1);
  assert.equal(g.prey.length, 0);
});

test('stars are awarded by clear time (or score on Survival Run)', () => {
  const lvl = L(2);
  const won = (sec, score) => ({ won: true, elapsedMs: sec * 1000, score: score || 0 });
  assert.equal(E.starsFor(lvl, won(lvl.stars[1])), 3);
  assert.equal(E.starsFor(lvl, won(lvl.stars[0])), 2);
  assert.equal(E.starsFor(lvl, won(lvl.stars[0] + 1)), 1);
  assert.equal(E.starsFor(lvl, { won: false, elapsedMs: 1, score: 999 }), 0);
  const surv = L(10);
  assert.equal(E.starsFor(surv, won(60, surv.stars[1])), 3);
  assert.equal(E.starsFor(surv, won(60, 10)), 1);
});

test('same seed and same inputs give the same game', () => {
  const a = playLevel(E, L(12), 42, 3000);
  const b = playLevel(E, L(12), 42, 3000);
  assert.equal(a.score, b.score);
  assert.equal(a.tick, b.tick);
  assert.deepEqual(a.snake, b.snake);
});

test('prey and power-ups only ever sit on free, reachable floor', () => {
  for (const level of MPS.LEVELS) {
    for (let seed = 1; seed <= 3; seed++) {
      const g = E.createGame(level, seed);
      const choose = makeBot(E);
      for (let t = 0; t < 1500 && g.alive && !g.won; t++) {
        const d = choose(g);
        if (g.waiting || d !== g.dir) E.queueTurn(g, d);
        E.step(g);
        for (const p of g.prey.concat(g.powerups)) {
          const i = p.y * 20 + p.x;
          assert.equal(g.grid[i], E.CELL_FLOOR, `level ${level.id}: ${p.type} on an obstacle`);
          assert.ok(g.reachable[i], `level ${level.id}: ${p.type} out of reach`);
          for (const z of g.hazards) assert.ok(!(z.x === p.x && z.y === p.y), `level ${level.id}: ${p.type} under a hazard`);
          if (p.type !== 'treat' && g.alive) {
            assert.ok(!g.snake.some((s) => s.x === p.x && s.y === p.y), `level ${level.id}: ${p.type} inside the snake`);
          }
        }
      }
    }
  }
});
