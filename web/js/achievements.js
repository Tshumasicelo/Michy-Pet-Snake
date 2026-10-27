/*
 * Michy's Pet Snake: trophies and unlockable snake colours.
 * Each check reads only the save record, so trophies can be re-evaluated at any
 * time (for example after loading an older save) and never unlock by accident.
 */
(function (root) {
  'use strict';
  const MPS = (root.MPS = root.MPS || {});

  function cleared(save, id) { return !!(save.levels[id] && save.levels[id].cleared); }
  function totalStars(save) {
    let n = 0;
    for (const id in save.levels) n += save.levels[id].stars || 0;
    return n;
  }
  function anyThreeStar(save) {
    for (const id in save.levels) if (save.levels[id].stars === 3) return true;
    return false;
  }

  const LIST = [
    { id: 'first_bite', name: 'First Bite', desc: 'Eat your first prey.', test: (s) => s.stats.eaten >= 1 },
    { id: 'out_of_tank', name: 'Out of the Tank', desc: 'Clear The Great Escape.', test: (s) => cleared(s, 1) },
    { id: 'bug_hunter', name: 'Bug Hunter', desc: 'Eat 25 beetles and crickets.', test: (s) => s.stats.insects >= 25 },
    { id: 'golden', name: 'Golden Moment', desc: 'Catch a golden moth.', test: (s) => s.stats.moths >= 1 },
    { id: 'close_call', name: 'Close Call', desc: 'Get saved by a Shell Shield.', test: (s) => s.stats.shieldSaves >= 1 },
    { id: 'long_noodle', name: 'Long Noodle', desc: 'Grow to 25 segments long.', test: (s) => s.stats.longest >= 25 },
    { id: 'show_off', name: 'Show-off', desc: 'Get 3 stars on any level.', test: anyThreeStar },
    { id: 'speed_demon', name: 'Speed Demon', desc: 'Get 3 stars on The Speed Challenge.', test: (s) => !!(s.levels[5] && s.levels[5].stars === 3) },
    { id: 'delivered', name: 'Signed, Sealed, Delivered', desc: 'Clear Special Delivery.', test: (s) => cleared(s, 9) },
    { id: 'night_owl', name: 'Night Owl', desc: 'Clear Survival Run.', test: (s) => cleared(s, 10) },
    { id: 'master', name: 'Master of the Wild', desc: 'Finish the whole campaign.', test: (s) => s.campaignComplete },
    { id: 'star_collector', name: 'Star Collector', desc: 'Collect all 36 stars.', test: (s) => totalStars(s) >= 36 },
    { id: 'old_school', name: 'Old School', desc: 'Score 30 in Terrarium Classic.', test: (s) => s.classicBest >= 30 },
  ];

  /** Snake colours and what unlocks them. */
  const SKIN_UNLOCKS = [
    { id: 'sunset', how: 'Michy\'s original', test: () => true },
    { id: 'emerald', how: 'Clear level 4', test: (s) => cleared(s, 4) },
    { id: 'midnight', how: 'Clear level 8', test: (s) => cleared(s, 8) },
    { id: 'golden', how: 'Finish the campaign', test: (s) => s.campaignComplete },
  ];

  /** Marks newly earned trophies in the save and returns them. */
  function evaluate(save) {
    const fresh = [];
    for (const a of LIST) {
      if (save.achievements[a.id]) continue;
      if (a.test(save)) {
        save.achievements[a.id] = Date.now();
        fresh.push(a);
      }
    }
    return fresh;
  }

  function skinUnlocked(save, id) {
    const s = SKIN_UNLOCKS.find((k) => k.id === id);
    return !!s && s.test(save);
  }

  MPS.Achievements = { LIST: LIST, SKIN_UNLOCKS: SKIN_UNLOCKS, evaluate: evaluate, skinUnlocked: skinUnlocked, totalStars: totalStars };
})(typeof window !== 'undefined' ? window : globalThis);
