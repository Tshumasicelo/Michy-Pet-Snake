/*
 * Michy's Pet Snake: save data.
 *
 * One versioned JSON record in localStorage. Every read and write is wrapped in
 * try/catch: in a private window, with storage disabled or in a WebView without
 * DOM storage, the game keeps working with an in-memory copy instead of crashing.
 *
 * The original Aspect Snake kept its high score under "snakeHighScore". It is
 * migrated once into the Classic mode record so nobody loses their old best.
 */
(function (root) {
  'use strict';
  const MPS = (root.MPS = root.MPS || {});

  const KEY = 'michys-pet-snake.save';
  const LEGACY_HIGH_SCORE_KEY = 'snakeHighScore';
  const VERSION = 1;

  function defaults() {
    return {
      version: VERSION,
      unlocked: 1, // highest playable level
      levels: {}, // id -> { best, stars, cleared }
      classicBest: 0,
      campaignComplete: false,
      introSeen: false,
      settings: { sound: true, controls: 'both', skin: 'sunset', reducedMotion: false },
      achievements: {}, // id -> unlock timestamp
      stats: { eaten: 0, insects: 0, moths: 0, shieldSaves: 0, longest: 3, runs: 0 },
    };
  }

  function getStore(storage) {
    if (storage !== undefined) return storage;
    try {
      return root.localStorage || null;
    } catch (e) {
      return null; // some browsers throw just from touching localStorage
    }
  }

  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /** Copies known fields from a parsed record onto fresh defaults, dropping anything malformed. */
  function sanitize(raw) {
    const d = defaults();
    if (!isObject(raw)) return d;
    if (Number.isInteger(raw.unlocked)) d.unlocked = Math.min(12, Math.max(1, raw.unlocked));
    if (isObject(raw.levels)) {
      for (const id in raw.levels) {
        const r = raw.levels[id];
        const n = Number(id);
        if (!Number.isInteger(n) || n < 1 || n > 12 || !isObject(r)) continue;
        d.levels[n] = {
          best: Number.isFinite(r.best) ? Math.max(0, r.best) : 0,
          stars: Number.isInteger(r.stars) ? Math.min(3, Math.max(0, r.stars)) : 0,
          cleared: !!r.cleared,
        };
      }
    }
    if (Number.isFinite(raw.classicBest)) d.classicBest = Math.max(0, raw.classicBest);
    d.campaignComplete = !!raw.campaignComplete;
    d.introSeen = !!raw.introSeen;
    if (isObject(raw.settings)) {
      const s = raw.settings;
      if (typeof s.sound === 'boolean') d.settings.sound = s.sound;
      if (s.controls === 'both' || s.controls === 'swipe' || s.controls === 'pad') d.settings.controls = s.controls;
      if (typeof s.skin === 'string') d.settings.skin = s.skin;
      if (typeof s.reducedMotion === 'boolean') d.settings.reducedMotion = s.reducedMotion;
    }
    if (isObject(raw.achievements)) {
      for (const k in raw.achievements) if (Number.isFinite(raw.achievements[k])) d.achievements[k] = raw.achievements[k];
    }
    if (isObject(raw.stats)) {
      for (const k in d.stats) if (Number.isFinite(raw.stats[k])) d.stats[k] = raw.stats[k];
    }
    return d;
  }

  function load(storage) {
    const store = getStore(storage);
    let data = defaults();
    let fromDisk = false;
    if (store) {
      try {
        const text = store.getItem(KEY);
        if (text) {
          data = sanitize(JSON.parse(text));
          fromDisk = true;
        }
      } catch (e) {
        data = defaults(); // corrupted JSON: start fresh rather than crash
      }
      if (!fromDisk) {
        try {
          const legacy = parseInt(store.getItem(LEGACY_HIGH_SCORE_KEY), 10);
          if (Number.isFinite(legacy) && legacy > 0) data.classicBest = legacy;
        } catch (e) { /* ignore */ }
      }
    }
    return data;
  }

  function save(data, storage) {
    const store = getStore(storage);
    if (!store) return false;
    try {
      store.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false; // quota or disabled storage: progress lives on in memory for this session
    }
  }

  function reset(storage) {
    const fresh = defaults();
    save(fresh, storage);
    return fresh;
  }

  MPS.Storage = { KEY: KEY, LEGACY_HIGH_SCORE_KEY: LEGACY_HIGH_SCORE_KEY, VERSION: VERSION, defaults: defaults, sanitize: sanitize, load: load, save: save, reset: reset };
})(typeof window !== 'undefined' ? window : globalThis);
