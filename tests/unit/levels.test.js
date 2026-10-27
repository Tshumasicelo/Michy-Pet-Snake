'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const MPS = require('./load');
const { playLevel } = require('../helpers/bot');

const E = MPS.Engine;
const ALL = MPS.LEVELS.concat([MPS.CLASSIC]);

test('there are exactly twelve campaign levels, numbered 1 to 12', () => {
  assert.deepEqual(MPS.LEVELS.map((l) => l.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(new Set(MPS.LEVELS.map((l) => l.name)).size, 12);
});

for (const level of ALL) {
  test(`level ${level.id} (${level.name}) has a valid, fair map`, () => {
    const parsed = E.parseMap(level.map); // throws on bad size or characters
    const { grid, start } = parsed;
    const floor = (x, y) => x >= 0 && y >= 0 && x < 20 && y < 20 && grid[y * 20 + x] === E.CELL_FLOOR;
    // The starting body (two cells behind the head) and three cells ahead are clear.
    for (let dx = -2; dx <= 3; dx++) assert.ok(floor((start.x + dx + 20) % 20, start.y), `blocked near the start at dx=${dx}`);
    // Every floor cell can be reached and none is a one-wide dead end.
    const reach = E.reachableFrom(grid, start, !!level.wrap);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        if (grid[y * 20 + x] !== E.CELL_FLOOR) continue;
        assert.ok(reach[y * 20 + x], `cell ${x},${y} is sealed off`);
        let open = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          let nx = x + dx;
          let ny = y + dy;
          if (level.wrap) { nx = (nx + 20) % 20; ny = (ny + 20) % 20; }
          if (floor(nx, ny)) open++;
        }
        assert.ok(open >= 2, `cell ${x},${y} is a dead end`);
      }
    }
  });
}

test('every level has a goal, a speed curve and sensible star targets', () => {
  const goalTypes = ['eat', 'score', 'survive', 'sequence'];
  for (const l of MPS.LEVELS) {
    assert.ok(goalTypes.includes(l.goal.type), `level ${l.id} goal`);
    assert.ok(l.speed.start >= l.speed.min && l.speed.min >= 80, `level ${l.id} speed`);
    assert.ok(l.story && l.tip, `level ${l.id} text`);
    assert.ok(MPS.THEMES[l.theme], `level ${l.id} theme`);
    if (l.starsBy === 'score') assert.ok(l.stars[1] > l.stars[0]);
    else {
      assert.ok(l.stars[0] > l.stars[1], `level ${l.id}: 3-star time must be faster than 2-star`);
      if (l.timeLimitMs) assert.ok(l.stars[0] * 1000 < l.timeLimitMs, `level ${l.id}: star time beyond the clock`);
    }
  }
});

test('new mechanics are introduced gradually', () => {
  const firstLevelWith = (pred) => MPS.LEVELS.find(pred).id;
  const usesPrey = (t) => (l) => (l.spawns || []).some((s) => s.type === t);
  const usesPower = (t) => (l) => (l.power || []).some((s) => s.type === t);
  assert.equal(firstLevelWith((l) => !l.wrap), 2, 'deadly edges');
  assert.equal(firstLevelWith(usesPrey('cricket')), 3);
  assert.equal(firstLevelWith((l) => l.map.some((r) => r.includes('#'))), 3);
  assert.equal(firstLevelWith(usesPower('shield')), 4);
  assert.equal(firstLevelWith((l) => !!l.timeLimitMs), 5);
  assert.equal(firstLevelWith(usesPrey('moth')), 5);
  assert.equal(firstLevelWith((l) => l.map.some((r) => /[RV]/.test(r))), 6, 'moving hazards');
  assert.equal(firstLevelWith((l) => (l.spawns || []).some((s) => s.flee)), 7, 'fleeing prey');
  assert.equal(firstLevelWith((l) => l.goal.type === 'sequence'), 9);
  assert.equal(firstLevelWith((l) => l.goal.type === 'survive'), 10);
});

test('the autopilot can clear every level (proof that each is winnable)', () => {
  for (const level of MPS.LEVELS) {
    let wins = 0;
    for (let seed = 1; seed <= 10; seed++) if (playLevel(E, level, seed).won) wins++;
    assert.ok(wins >= 3, `level ${level.id} cleared only ${wins}/10 times by the autopilot`);
  }
});
