'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const MPS = require('./load');

const Store = MPS.Storage;

function memory(initial) {
  const data = Object.assign({}, initial);
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
}

test('a fresh install starts at level 1 with default settings', () => {
  const s = Store.load(memory());
  assert.equal(s.unlocked, 1);
  assert.equal(s.settings.sound, true);
  assert.equal(s.introSeen, false);
});

test('the original Aspect Snake high score is carried over into Classic', () => {
  const s = Store.load(memory({ snakeHighScore: '27' }));
  assert.equal(s.classicBest, 27);
});

test('progress round-trips through storage', () => {
  const mem = memory();
  const s = Store.load(mem);
  s.unlocked = 5;
  s.levels[3] = { best: 180, stars: 2, cleared: true };
  s.settings.controls = 'swipe';
  assert.equal(Store.save(s, mem), true);
  const again = Store.load(mem);
  assert.equal(again.unlocked, 5);
  assert.deepEqual(again.levels[3], { best: 180, stars: 2, cleared: true });
  assert.equal(again.settings.controls, 'swipe');
});

test('corrupted or tampered saves fall back safely', () => {
  assert.equal(Store.load(memory({ [Store.KEY]: '{not json' })).unlocked, 1);
  const s = Store.load(memory({ [Store.KEY]: JSON.stringify({ unlocked: 99, levels: { 3: { best: -5, stars: 9 }, 42: { best: 1 } }, settings: { controls: 'telepathy' } }) }));
  assert.equal(s.unlocked, 12);
  assert.deepEqual(s.levels[3], { best: 0, stars: 3, cleared: false });
  assert.equal(s.levels[42], undefined);
  assert.equal(s.settings.controls, 'both');
});

test('storage that throws does not break the game', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const s = Store.load(broken);
  assert.equal(s.unlocked, 1);
  assert.equal(Store.save(s, broken), false);
  assert.equal(Store.save(s, null), false);
});

test('trophies unlock from save data, once', () => {
  const s = Store.defaults();
  assert.deepEqual(MPS.Achievements.evaluate(s), []);
  s.stats.eaten = 1;
  s.levels[1] = { best: 60, stars: 3, cleared: true };
  const got = MPS.Achievements.evaluate(s).map((a) => a.id).sort();
  assert.deepEqual(got, ['first_bite', 'out_of_tank', 'show_off']);
  assert.deepEqual(MPS.Achievements.evaluate(s), [], 'already unlocked trophies are not reported again');
  assert.equal(MPS.Achievements.skinUnlocked(s, 'emerald'), false);
  s.levels[4] = { best: 1, stars: 1, cleared: true };
  assert.equal(MPS.Achievements.skinUnlocked(s, 'emerald'), true);
});
