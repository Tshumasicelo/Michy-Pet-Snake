/*
 * Michy's Pet Snake: app shell.
 *
 * Owns the screens (intro, menu, level select, game...), the single game loop,
 * the HUD, overlays and save data. The rules live in engine.js and the drawing in
 * render.js; this file only wires them together.
 *
 * The game loop uses a fixed time step: moves happen exactly every tickMs of game
 * time no matter the frame rate, and drawing blends between moves for smoothness.
 */
(function (root) {
  'use strict';
  const MPS = root.MPS;
  const E = MPS.Engine;
  const S = MPS.Sprites;
  const Store = MPS.Storage;
  const Audio = MPS.Audio;

  const $ = (id) => document.getElementById(id);
  const SCREENS = ['menu', 'levels', 'howto', 'settings', 'achievements', 'game'];

  const app = {
    save: Store.load(),
    screen: null,
    mode: 'idle', // in the game screen: ready | playing | paused | over
    level: null,
    game: null,
    renderer: null,
    raf: 0,
    last: 0,
    acc: 0,
    hud: {},
    lastSecond: null,
    bannerTimer: 0,
    toastQueue: [],
    toastTimer: 0,
    isTouch: false,
  };

  function persist() { Store.save(app.save); }

  // ---- Screens ------------------------------------------------------------

  function show(name) {
    for (const s of SCREENS) $('screen-' + s).hidden = s !== name;
    app.screen = name;
    if (name === 'menu') renderMenu();
    if (name === 'levels') renderLevels();
    if (name === 'achievements') renderAchievements();
    if (name === 'settings') renderSettings();
    if (name === 'howto') renderHowTo();
    if (name !== 'game') stopLoop();
  }

  function renderMenu() {
    const next = Math.min(app.save.unlocked, MPS.LEVELS.length);
    const lvl = MPS.levelById(next);
    $('continue-label').textContent = app.save.campaignComplete ? 'Campaign complete! Pick any level' : 'Level ' + next + ': ' + lvl.name;
    $('menu-stars').textContent = MPS.Achievements.totalStars(app.save);
    drawLogo();
  }

  function drawLogo() {
    const c = $('logo-canvas');
    const dpr = Math.min(3, root.devicePixelRatio || 1);
    c.width = 220 * dpr;
    c.height = 120 * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 220, 120);
    const pts = [];
    for (let i = 0; i < 26; i++) {
      const tt = i / 25;
      pts.push({ x: 150 - tt * 120, y: 70 + Math.sin(tt * Math.PI * 2.2) * 22 });
    }
    S.drawMouse(ctx, 196, 82, 30, 0, -1);
    S.drawSnake(ctx, pts, { width: 22, skin: S.SKINS[app.save.settings.skin] || S.SKINS.sunset, angle: -0.25, now: 900, mouthOpen: true });
  }

  function starIcons(n, total) {
    let html = '';
    for (let i = 0; i < (total || 3); i++) html += '<svg class="star' + (i < n ? ' on' : '') + '"><use href="#i-star"/></svg>';
    return html;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderLevels() {
    const grid = $('level-grid');
    grid.innerHTML = '';
    for (const lvl of MPS.LEVELS) {
      const rec = app.save.levels[lvl.id] || { best: 0, stars: 0, cleared: false };
      const locked = lvl.id > app.save.unlocked;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level-card' + (!locked && !rec.cleared ? ' next' : '');
      b.disabled = locked;
      b.dataset.level = lvl.id;
      const th = MPS.THEMES[lvl.theme];
      b.innerHTML =
        '<span class="num">Level ' + lvl.id + '</span>' +
        '<span class="name">' + esc(lvl.name) + '</span>' +
        (locked ? '<svg class="lock"><use href="#i-lock"/></svg>' : '<span class="theme-dot" style="background:' + th.floorA + '"></span>') +
        '<span class="stars">' + starIcons(rec.stars) + '</span>' +
        '<span class="best">' + (rec.cleared ? 'Best ' + rec.best : locked ? 'Locked' : 'Not cleared yet') + '</span>';
      b.setAttribute('aria-label', 'Level ' + lvl.id + ', ' + lvl.name + (locked ? ', locked' : ', ' + rec.stars + ' stars'));
      grid.appendChild(b);
    }
    $('levels-stars').textContent = MPS.Achievements.totalStars(app.save);
  }

  function renderAchievements() {
    const list = $('achievement-list');
    list.innerHTML = '';
    let got = 0;
    for (const a of MPS.Achievements.LIST) {
      const has = !!app.save.achievements[a.id];
      if (has) got++;
      const li = document.createElement('li');
      li.className = has ? 'got' : '';
      li.innerHTML = '<svg><use href="#i-trophy"/></svg><div><b>' + esc(a.name) + '</b><span>' + esc(a.desc) + '</span></div>';
      list.appendChild(li);
    }
    $('trophy-count').textContent = got;
    $('trophy-total').textContent = MPS.Achievements.LIST.length;
  }

  function iconCanvas(drawFn, size) {
    const c = document.createElement('canvas');
    const dpr = Math.min(3, root.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    drawFn(ctx, size);
    return c;
  }

  let howtoBuilt = false;
  function renderHowTo() {
    if (howtoBuilt) return;
    howtoBuilt = true;
    const add = (listId, draw, name, text) => {
      const li = document.createElement('li');
      li.appendChild(iconCanvas(draw, 40));
      const d = document.createElement('div');
      d.innerHTML = '<b>' + name + '</b><span>' + text + '</span>';
      li.appendChild(d);
      $(listId).appendChild(li);
    };
    add('legend-prey', (c, s) => S.drawMouse(c, s / 2, s / 2, s * 0.9, 0, -1), 'Mouse · 10', 'The main prey. Clever ones run away from you.');
    add('legend-prey', (c, s) => S.drawBeetle(c, s / 2, s / 2, s * 0.9, 0), 'Beetle · 5', 'A light snack: points without getting longer.');
    add('legend-prey', (c, s) => S.drawCricket(c, s / 2, s / 2, s * 0.9, 0), 'Cricket · 15', 'Hops around and leaves if you are too slow.');
    add('legend-prey', (c, s) => S.drawMoth(c, s / 2, s / 2, s * 0.9, 0), 'Golden Moth · 50', 'Rare and fluttery. Grab it before it flies off!');
    add('legend-prey', (c, s) => S.drawTreat(c, s / 2, s / 2, s * 0.9, 0, 1, true), 'Treat parcel · 20', 'Special Delivery only: eat them in number order.');
    add('legend-power', (c, s) => S.drawPower(c, 'shield', s / 2, s / 2, s * 0.9, 0), 'Shell Shield', 'Survive one crash. You stop, then pick a new direction.');
    add('legend-power', (c, s) => S.drawPower(c, 'zoomies', s / 2, s / 2, s * 0.9, 0), 'Zoomies', 'Move faster and score double for a few seconds.');
    add('legend-power', (c, s) => S.drawPower(c, 'chill', s / 2, s / 2, s * 0.9, 0), 'Chill Cube', 'Slows everything down for a few seconds.');
    add('legend-hazard', (c, s) => { c.fillStyle = '#a4553b'; c.fillRect(s * 0.1, s * 0.15, s * 0.8, s * 0.7); c.fillStyle = '#cf7656'; c.fillRect(s * 0.1, s * 0.15, s * 0.8, s * 0.45); }, 'Furniture, hedges, crates', 'Solid. Bumping into them ends the run.');
    add('legend-hazard', (c, s) => { c.fillStyle = '#4aa3c7'; S.roundRect(c, s * 0.1, s * 0.2, s * 0.8, s * 0.6, s * 0.25); c.fill(); }, 'Water', 'This snake does not swim. Keep out.');
    add('legend-hazard', (c, s) => S.drawVacuum(c, s / 2, s / 2, s * 0.9, 0), 'Robot vacuum', 'Patrols in a line and turns back when blocked.');
    add('legend-hazard', (c, s) => S.drawHedgehog(c, s / 2, s / 2, s * 0.9, 0, 1), 'Hedgehog', 'The garden version. Just as prickly.');
  }

  function renderSettings() {
    const st = app.save.settings;
    $('set-sound').setAttribute('aria-checked', String(st.sound));
    $('set-motion').setAttribute('aria-checked', String(st.reducedMotion));
    for (const b of $('set-controls').querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.value === st.controls));
    const wrap = $('set-skins');
    wrap.innerHTML = '';
    for (const k of MPS.Achievements.SKIN_UNLOCKS) {
      const unlocked = k.test(app.save);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'skin';
      b.dataset.skin = k.id;
      b.disabled = !unlocked;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(st.skin === k.id));
      const c = iconCanvas((ctx) => {
        const pts = [];
        for (let i = 0; i < 6; i++) pts.push({ x: 36 - i * 6, y: 14 + Math.sin(i) * 3 });
        S.drawSnake(ctx, pts, { width: 10, skin: S.SKINS[k.id], angle: 0, now: 900 });
      }, 44);
      c.style.height = '28px';
      b.appendChild(c);
      const label = document.createElement('div');
      label.innerHTML = esc(S.SKINS[k.id].name) + '<small>' + (unlocked ? 'Unlocked' : esc(k.how)) + '</small>';
      b.appendChild(label);
      wrap.appendChild(b);
    }
    const reset = $('set-reset');
    reset.classList.remove('confirm');
    reset.textContent = 'Reset progress';
  }

  // ---- Toasts and banners -------------------------------------------------

  function toast(title, sub) {
    app.toastQueue.push({ title: title, sub: sub });
    if (!app.toastTimer) nextToast();
  }
  function nextToast() {
    const t = app.toastQueue.shift();
    const el = $('toast');
    if (!t) { el.hidden = true; app.toastTimer = 0; return; }
    el.innerHTML = '<svg><use href="#i-trophy"/></svg><div>' + esc(t.title) + (t.sub ? '<small>' + esc(t.sub) + '</small>' : '') + '</div>';
    el.hidden = false;
    // restart the entrance animation
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    app.toastTimer = setTimeout(nextToast, 2600);
  }

  function banner(text, ms) {
    const el = $('banner');
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(app.bannerTimer);
    if (ms) app.bannerTimer = setTimeout(() => { el.hidden = true; }, ms);
  }
  function hideBanner() {
    clearTimeout(app.bannerTimer);
    $('banner').hidden = true;
  }

  function checkTrophies() {
    const fresh = MPS.Achievements.evaluate(app.save);
    for (const a of fresh) toast('Trophy: ' + a.name, a.desc);
    if (fresh.length) persist();
  }

  // ---- Starting a level ---------------------------------------------------

  function startLevel(level) {
    Audio.unlock();
    app.level = level;
    app.game = E.createGame(level, (Date.now() ^ (Math.random() * 1e9)) >>> 0);
    app.mode = 'ready';
    app.acc = 0;
    app.lastSecond = null;
    app.hud = {};
    app.save.stats.runs++;
    show('game');
    applyControlsSetting();
    app.renderer.reset();
    layoutBoard();
    hideBanner();
    showReadyCard();
    updateHud(true);
    startLoop();
  }

  function showReadyCard() {
    const L = app.level;
    const isClassic = L.id === 'classic';
    const targets = E.starTargets(L);
    let html = '<span class="eyebrow">' + (isClassic ? 'Endless mode' : 'Level ' + L.id + ' of 12') + '</span>' +
      '<h2>' + esc(L.name) + '</h2>' +
      '<p>' + esc(L.story) + '</p>' +
      '<div class="goal">' + esc(E.describeGoal(L)) + '</div>' +
      '<p class="tip"><b>Tip:</b> ' + esc(L.tip) + '</p>';
    if (targets.length) {
      html += '<div class="targets">' + targets.map((t, i) => '<span>' + starIcons(i + 1) + ' ' + esc(t) + '</span>').join('') + '</div>';
    } else {
      html += '<div class="targets"><span>Best: ' + app.save.classicBest + '</span></div>';
    }
    html += '<div class="actions"><button class="btn primary" type="button" data-action="go">Go!</button>' +
      '<button class="btn small" type="button" data-action="levels-from-game">' + (isClassic ? 'Main menu' : 'Level select') + '</button></div>' +
      '<p class="muted" style="font-size:.85rem">Or just swipe or press an arrow to start in that direction.</p>';
    openCard(html);
  }

  function openCard(html) {
    $('overlay-card').innerHTML = html;
    $('overlay').hidden = false;
    const primary = $('overlay-card').querySelector('.btn.primary');
    if (primary && !app.isTouch) primary.focus({ preventScroll: true });
  }
  function closeCard() { $('overlay').hidden = true; }

  function begin(dir) {
    if (app.mode !== 'ready') return;
    closeCard();
    app.mode = 'playing';
    if (!E.queueTurn(app.game, dir || 'right')) banner('Pick any direction except straight back to start', 0);
    app.acc = 0;
  }

  // ---- Loop ---------------------------------------------------------------

  function startLoop() {
    if (app.raf) return; // never run two loops at once
    app.last = 0;
    app.raf = root.requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (app.raf) root.cancelAnimationFrame(app.raf);
    app.raf = 0;
  }

  function frame(ts) {
    app.raf = root.requestAnimationFrame(frame);
    if (!app.last) app.last = ts;
    const dt = Math.min(250, ts - app.last);
    app.last = ts;
    const g = app.game;
    if (!g) return;

    if (app.mode === 'playing' && !g.waiting) {
      app.acc += dt;
      let steps = 0;
      while (app.acc >= E.tickMs(g) && steps < 4) {
        app.acc -= E.tickMs(g);
        handleEvents(E.step(g));
        steps++;
        if (app.mode !== 'playing' || g.waiting) { app.acc = 0; break; }
      }
      if (steps === 4) app.acc = 0; // way behind (slow device): skip ahead rather than spiral
    } else {
      app.acc = 0;
    }
    const alpha = app.mode === 'playing' ? app.acc / E.tickMs(g) : 1;
    app.renderer.updateEffects(dt / 1000);
    app.renderer.draw(g, alpha, ts, { skin: app.save.settings.skin, reducedMotion: app.save.settings.reducedMotion });
    updateHud(false);
  }

  const PREY_SOUND = { mouse: 'eat', beetle: 'snack', cricket: 'bonus', moth: 'gold', treat: 'bonus', leaf: 'eat' };
  const PREY_COLOR = { mouse: '#d9d3e8', beetle: '#5fd3b0', cricket: '#a5e35a', moth: '#ffd45a', treat: '#ff9a6b', leaf: '#ffe066' };
  const POWER_TEXT = { shield: 'Shell Shield! One crash is on the house.', zoomies: 'Zoomies! Faster, and double points.', chill: 'Chill Cube! Everything slows down.' };

  function handleEvents(events) {
    const g = app.game;
    const r = app.renderer;
    const stats = app.save.stats;
    for (const ev of events) {
      switch (ev.type) {
        case 'eat':
          Audio.play(PREY_SOUND[ev.prey]);
          r.burst(ev.x, ev.y, PREY_COLOR[ev.prey], ev.prey === 'moth' ? 26 : 12);
          r.floatText(ev.x, ev.y, '+' + ev.points, ev.prey === 'moth' ? '#ffd45a' : '#fff4e0');
          if (E.PREY[ev.prey].grow > 0) r.addGulp(g.tick);
          stats.eaten++;
          if (ev.prey === 'beetle' || ev.prey === 'cricket') stats.insects++;
          if (ev.prey === 'moth') stats.moths++;
          if (g.snake.length > stats.longest) stats.longest = g.snake.length;
          break;
        case 'power':
          Audio.play('power');
          r.burst(ev.x, ev.y, '#9be7ff', 16);
          banner(POWER_TEXT[ev.power], 1600);
          break;
        case 'shield':
          Audio.play('shield');
          r.shake = 0.5;
          stats.shieldSaves++;
          banner('Saved by the shield! Pick a new direction.', 0);
          break;
        case 'set':
          banner('Delivery ' + ev.set + ' complete!', 1400);
          break;
        case 'escape':
          if (ev.prey !== 'treat') Audio.play('escape');
          break;
        case 'die':
          Audio.play('die');
          r.shake = 1;
          r.flash = 1;
          endRun(false);
          break;
        case 'win':
          Audio.play('win');
          r.burst(g.snake[0].x, g.snake[0].y, '#ffc94d', 40);
          endRun(true);
          break;
      }
    }
    if (events.length) checkTrophies();
  }

  // ---- HUD ------------------------------------------------------------------

  function setText(key, el, value) {
    if (app.hud[key] === value) return;
    app.hud[key] = value;
    el.textContent = value;
  }

  function updateHud(force) {
    const g = app.game;
    const L = app.level;
    if (force) {
      $('hud-level').textContent = L.id === 'classic' ? 'Endless' : 'Level ' + L.id;
      $('hud-name').textContent = L.name;
    }
    setText('score', $('hud-score'), String(g.score));
    // On score goals the goal chip already shows the score.
    $('hud-score').parentElement.hidden = L.goal.type === 'score';
    if (L.id === 'classic') {
      $('hud-goal-label').textContent = 'Best';
      setText('goal', $('hud-goal'), String(Math.max(app.save.classicBest, g.score)));
    } else {
      const p = E.progress(g);
      $('hud-goal-label').textContent = p.label;
      setText('goal', $('hud-goal'), p.now + '/' + p.need);
    }
    const left = E.timeLeft(g);
    const chip = $('hud-time-chip');
    chip.hidden = left === null;
    if (left !== null) {
      setText('time', $('hud-time'), E.clock(left));
      chip.classList.toggle('warn', left <= 10);
      const sec = Math.ceil(left);
      if (app.mode === 'playing' && sec <= 5 && sec > 0 && app.lastSecond !== sec) Audio.play('tick');
      app.lastSecond = sec;
    }
    const fx = (g.shield ? 's' : '') + (g.zoomies > 0 ? 'z' + Math.ceil(g.zoomies / 7) : '') + (g.chill > 0 ? 'c' + Math.ceil(g.chill / 6) : '');
    if (app.hud.fx !== fx) {
      app.hud.fx = fx;
      const wrap = $('hud-effects');
      wrap.innerHTML = '';
      const add = (type, label, frac, color) => {
        const d = document.createElement('div');
        d.className = 'effect';
        d.style.color = color;
        d.appendChild(iconCanvas((c, s) => S.drawPower(c, type, s / 2, s / 2, s, 0), 18));
        const span = document.createElement('span');
        span.textContent = label;
        span.style.color = 'var(--text)';
        d.appendChild(span);
        if (frac !== null) {
          const bar = document.createElement('i');
          bar.style.setProperty('--p', Math.round(frac * 100) + '%');
          d.appendChild(bar);
        }
        wrap.appendChild(d);
      };
      if (g.shield) add('shield', 'Shield', null, '#4cc9f0');
      if (g.zoomies > 0) add('zoomies', 'Zoomies', g.zoomies / E.POWER.zoomies.duration, '#ffb000');
      if (g.chill > 0) add('chill', 'Chill', g.chill / E.POWER.chill.duration, '#9be7ff');
    }
  }

  // ---- Pause, results ------------------------------------------------------

  function pause() {
    if (app.mode !== 'playing') return false;
    app.mode = 'paused';
    openCard('<span class="eyebrow">' + (app.level.id === 'classic' ? 'Endless mode' : 'Level ' + app.level.id) + '</span><h2>Paused</h2>' +
      '<div class="goal">' + esc(E.describeGoal(app.level)) + '</div>' +
      '<div class="actions">' +
      '<button class="btn primary" type="button" data-action="resume">Resume</button>' +
      '<button class="btn" type="button" data-action="restart">Restart</button>' +
      '<div class="btn-row"><button class="btn small" type="button" data-action="levels-from-game">Levels</button>' +
      '<button class="btn small" type="button" data-action="menu">Main menu</button></div>' +
      '<button class="btn small" type="button" data-action="toggle-sound">Sound: ' + (app.save.settings.sound ? 'On' : 'Off') + '</button>' +
      '</div>');
    return true;
  }

  function resume() {
    if (app.mode !== 'paused') return;
    closeCard();
    app.mode = 'playing';
    app.acc = 0;
    app.last = 0;
  }

  const CRASH_TEXT = {
    edge: 'Bonk! You slithered into the edge.',
    self: 'Oops! You bit your own tail.',
    water: 'Splash! This snake does not swim.',
    time: 'Time is up! Michy is home.',
  };
  function crashText(reason, theme) {
    if (reason === 'wall') {
      return {
        garden: 'Ouch! Hedges are prickly.', wild: 'Thunk! That rock did not move.', kitchen: 'Clonk! You hit the kitchen counter.',
        basement: 'Thud! Basement boxes are heavy.', porch: 'Whump! You ran into a parcel crate.', attic: 'Thump! Dusty old junk in the way.',
      }[theme] || 'Ouch! You bumped into the furniture.';
    }
    if (reason === 'hazard') return theme === 'garden' || theme === 'wild' ? 'Yikes! The hedgehog was prickly.' : 'Vroom! The robot vacuum got you.';
    return CRASH_TEXT[reason] || 'Game over!';
  }

  function endRun(won) {
    const g = app.game;
    const L = app.level;
    app.mode = 'over';
    hideBanner();
    const stats = app.save.stats;
    if (g.maxLength > stats.longest) stats.longest = g.maxLength;

    if (L.id === 'classic') {
      const newBest = g.score > app.save.classicBest;
      if (newBest) app.save.classicBest = g.score;
      persist();
      checkTrophies();
      setTimeout(() => openCard(
        '<span class="eyebrow">Terrarium Classic</span><h2>' + esc(crashText(g.deathReason, L.theme)) + '</h2>' +
        '<div class="score-line"><span class="big">' + g.score + '</span>points · length ' + g.maxLength + '</div>' +
        (newBest ? '<span class="badge">New best!</span>' : '<p>Best: ' + app.save.classicBest + '</p>') +
        '<div class="actions"><button class="btn primary" type="button" data-action="restart">Play again</button>' +
        '<button class="btn small" type="button" data-action="menu">Main menu</button></div>'), 650);
      return;
    }

    if (!won) {
      persist();
      setTimeout(() => {
        const p = E.progress(g);
        openCard('<span class="eyebrow">Level ' + L.id + ' · ' + esc(L.name) + '</span><h2>' + esc(crashText(g.deathReason, L.theme)) + '</h2>' +
          '<div class="score-line"><span class="big">' + g.score + '</span>points</div>' +
          '<p>' + esc(p.label) + ' ' + p.now + ' of ' + p.need + '</p>' +
          '<div class="actions"><button class="btn primary" type="button" data-action="restart">Try again</button>' +
          '<div class="btn-row"><button class="btn small" type="button" data-action="levels-from-game">Levels</button>' +
          '<button class="btn small" type="button" data-action="menu">Main menu</button></div></div>');
      }, 700);
      return;
    }

    const stars = E.starsFor(L, g);
    const rec = app.save.levels[L.id] || { best: 0, stars: 0, cleared: false };
    const newBest = !rec.cleared || g.score > rec.best;
    rec.best = Math.max(rec.best, g.score);
    rec.stars = Math.max(rec.stars, stars);
    rec.cleared = true;
    app.save.levels[L.id] = rec;
    const unlockedNext = L.id < 12 && app.save.unlocked < L.id + 1;
    app.save.unlocked = Math.max(app.save.unlocked, Math.min(12, L.id + 1));
    const finale = L.id === 12 && !app.save.campaignComplete;
    if (L.id === 12) app.save.campaignComplete = true;
    persist();
    checkTrophies();

    setTimeout(() => {
      if (finale) { showCampaignComplete(g, stars); return; }
      const secs = g.elapsedMs / 1000;
      openCard('<span class="eyebrow">Level ' + L.id + ' clear!</span><h2>' + esc(L.name) + '</h2>' +
        '<div class="big-stars">' + starIcons(stars) + '</div>' +
        '<div class="score-line"><span class="big">' + g.score + '</span>points' + (g.bonus ? ' (incl. ' + g.bonus + ' bonus)' : '') + ' · ' + E.clock(secs) + '</div>' +
        (newBest ? '<span class="badge">New best!</span>' : '<p>Best: ' + rec.best + '</p>') +
        (stars < 3 ? '<div class="targets">' + E.starTargets(L).map((t, i) => '<span>' + starIcons(i + 1) + ' ' + esc(t) + '</span>').join('') + '</div>' : '') +
        (unlockedNext ? '<p>Level ' + (L.id + 1) + ' unlocked: <b>' + esc(MPS.levelById(L.id + 1).name) + '</b></p>' : '') +
        '<div class="actions">' +
        (L.id < 12 ? '<button class="btn primary" type="button" data-action="next">Next level</button>' : '') +
        '<div class="btn-row"><button class="btn small" type="button" data-action="restart">Replay</button>' +
        '<button class="btn small" type="button" data-action="levels-from-game">Levels</button></div></div>');
    }, 650);
  }

  function showCampaignComplete(g, stars) {
    const total = MPS.Achievements.totalStars(app.save);
    let sum = 0;
    for (const id in app.save.levels) sum += app.save.levels[id].best || 0;
    openCard('<span class="eyebrow">Campaign complete</span><h2>Master of the Wild!</h2>' +
      '<p>From a glass terrarium to ruling the wild: Michy\'s snake has done it. What a noodle.</p>' +
      '<div class="big-stars">' + starIcons(stars) + '</div>' +
      '<div class="score-line"><span class="big">' + g.score + '</span>points on the final level</div>' +
      '<div class="goal">Campaign stars ' + total + ' / 36 · Total best score ' + sum + '</div>' +
      '<p>New snake colour unlocked: <b>Golden</b>. Find it in Settings.</p>' +
      '<div class="actions"><button class="btn primary" type="button" data-action="menu">Main menu</button>' +
      '<button class="btn small" type="button" data-action="levels-from-game">Level select</button></div>');
    confetti();
  }

  function confetti() {
    if (app.save.settings.reducedMotion) return;
    const box = $('confetti');
    box.innerHTML = '';
    const colors = ['#ff9933', '#ffc94d', '#5ee6b8', '#ff6b8b', '#9be7ff'];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = 2.2 + Math.random() * 2 + 's';
      p.style.animationDelay = Math.random() * 0.8 + 's';
      box.appendChild(p);
    }
    setTimeout(() => { box.innerHTML = ''; }, 5500);
  }

  // ---- Layout ----------------------------------------------------------------

  function applyControlsSetting() {
    const c = app.save.settings.controls;
    const showPad = c === 'pad' || (c === 'both' && app.isTouch);
    $('screen-game').classList.toggle('no-pad', !showPad);
  }

  function layoutBoard() {
    if (app.screen !== 'game') return;
    const area = $('play-area');
    const dpr = root.devicePixelRatio || 1;
    const avail = Math.min(area.clientWidth, area.clientHeight) - 10; // board-wrap padding
    // Whole device pixels per tile keep grid lines crisp without wasting screen space.
    const tile = Math.max(8, Math.floor((avail / E.COLS) * dpr) / dpr);
    app.renderer.resize(tile * E.COLS, dpr);
  }

  // ---- Intro ---------------------------------------------------------------

  function playIntro() {
    const canvas = $('intro-canvas');
    const skip = $('intro-skip');
    canvas.hidden = false;
    skip.hidden = false;
    for (const s of SCREENS) $('screen-' + s).hidden = true;
    app.screen = 'intro';
    MPS.Intro.play(canvas, {
      skin: app.save.settings.skin,
      onDone: () => {
        canvas.hidden = true;
        skip.hidden = true;
        if (!app.save.introSeen) {
          app.save.introSeen = true;
          persist();
        }
        show('menu');
      },
    });
  }

  function skipIntro() {
    Audio.unlock();
    MPS.Intro.skip();
  }

  // ---- Back button (Android) and app lifecycle -------------------------------

  /**
   * Called by the Android app when the system back button is pressed.
   * Returns true when the game handled it, false when the app should close.
   */
  function handleBack() {
    switch (app.screen) {
      case 'intro': skipIntro(); return true;
      case 'game':
        if (app.mode === 'playing') return pause();
        if (app.mode === 'paused') { resume(); return true; }
        show(app.level && app.level.id === 'classic' ? 'menu' : 'levels');
        closeCard();
        return true;
      case 'menu': return false;
      default: show('menu'); return true;
    }
  }

  /** Called when the app goes to the background (Android onPause or a hidden tab). */
  function appPaused() {
    if (app.screen === 'game') pause();
    Audio.suspend();
  }

  function appResumed() {
    Audio.resume();
  }

  // ---- Wiring --------------------------------------------------------------

  function onAction(action, el) {
    Audio.unlock();
    Audio.play('click');
    switch (action) {
      case 'continue':
        if (app.save.campaignComplete) show('levels');
        else startLevel(MPS.levelById(Math.min(app.save.unlocked, 12)));
        break;
      case 'levels': show('levels'); break;
      case 'classic': startLevel(MPS.CLASSIC); break;
      case 'howto': show('howto'); break;
      case 'achievements': show('achievements'); break;
      case 'settings': show('settings'); break;
      case 'intro': playIntro(); break;
      case 'back': show('menu'); break;
      case 'go': begin('right'); break;
      case 'resume': resume(); break;
      case 'restart': closeCard(); startLevel(app.level); break;
      case 'next': closeCard(); startLevel(MPS.levelById(app.level.id + 1)); break;
      case 'menu': closeCard(); show('menu'); break;
      case 'levels-from-game': closeCard(); show(app.level && app.level.id === 'classic' ? 'menu' : 'levels'); break;
      case 'toggle-sound':
        app.save.settings.sound = !app.save.settings.sound;
        Audio.setEnabled(app.save.settings.sound);
        persist();
        if (el) el.textContent = 'Sound: ' + (app.save.settings.sound ? 'On' : 'Off');
        break;
    }
  }

  function wire() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (el) { onAction(el.dataset.action, el); return; }
      const card = e.target.closest('.level-card');
      if (card && !card.disabled) {
        Audio.unlock();
        Audio.play('click');
        startLevel(MPS.levelById(Number(card.dataset.level)));
      }
    });

    $('btn-pause').addEventListener('click', () => { if (app.mode === 'playing') pause(); else if (app.mode === 'paused') resume(); });
    $('intro-skip').addEventListener('click', (e) => { e.stopPropagation(); skipIntro(); });
    $('intro-canvas').addEventListener('pointerdown', skipIntro);

    // Settings controls.
    $('set-sound').addEventListener('click', () => {
      app.save.settings.sound = !app.save.settings.sound;
      Audio.setEnabled(app.save.settings.sound);
      persist();
      renderSettings();
      Audio.play('click');
    });
    $('set-motion').addEventListener('click', () => {
      app.save.settings.reducedMotion = !app.save.settings.reducedMotion;
      persist();
      renderSettings();
    });
    $('set-controls').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      app.save.settings.controls = b.dataset.value;
      persist();
      renderSettings();
    });
    $('set-skins').addEventListener('click', (e) => {
      const b = e.target.closest('.skin');
      if (!b || b.disabled) return;
      app.save.settings.skin = b.dataset.skin;
      persist();
      renderSettings();
    });
    let resetArmed = 0;
    $('set-reset').addEventListener('click', () => {
      const btn = $('set-reset');
      if (!resetArmed) {
        btn.classList.add('confirm');
        btn.textContent = 'Tap again to erase all progress';
        resetArmed = setTimeout(() => { resetArmed = 0; renderSettings(); }, 3500);
        return;
      }
      clearTimeout(resetArmed);
      resetArmed = 0;
      const keep = app.save.settings;
      const seen = app.save.introSeen;
      app.save = Store.defaults();
      app.save.settings = keep;
      app.save.settings.skin = 'sunset';
      app.save.introSeen = seen;
      persist();
      renderSettings();
      toast('Progress reset', 'Back to level 1. Good luck!');
    });

    MPS.Input.init({
      swipeArea: $('screen-game'),
      pad: $('pad'),
      swipeEnabled: () => app.save.settings.controls !== 'pad',
      onAnyInput: () => Audio.unlock(),
      onDir: (dir) => {
        if (app.screen !== 'game' || !app.game) return false;
        if (app.mode === 'ready') { begin(dir); return true; }
        if (app.mode !== 'playing') return false;
        const wasWaiting = app.game.waiting;
        if (E.queueTurn(app.game, dir) && wasWaiting) hideBanner();
        return true;
      },
      onPauseKey: (key) => {
        if (app.screen === 'intro') { skipIntro(); return true; }
        if (app.screen === 'game') {
          if (app.mode === 'playing') return pause();
          if (app.mode === 'paused') { resume(); return true; }
          if (key === 'Escape') return handleBack();
          return false;
        }
        if (key === 'Escape') return handleBack();
        return false;
      },
      onConfirm: () => {
        if (app.screen === 'intro') { skipIntro(); return true; }
        return false;
      },
    });

    root.addEventListener('resize', layoutBoard);
    root.addEventListener('orientationchange', () => setTimeout(layoutBoard, 120));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) appPaused();
      else appResumed();
    });
    root.addEventListener('blur', () => { if (app.mode === 'playing') pause(); });
  }

  function boot() {
    app.isTouch = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in root;
    app.renderer = new MPS.Renderer($('board'));
    Audio.setEnabled(app.save.settings.sound);
    wire();
    checkTrophies();
    const reduce = app.save.settings.reducedMotion || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!app.save.introSeen && !reduce) playIntro();
    else show('menu');
  }

  MPS.handleBack = handleBack;
  MPS.appPaused = appPaused;
  MPS.appResumed = appResumed;
  // Hooks for the automated browser tests: a view of the state, and one move through the normal event handling.
  MPS.debug = {
    get state() { return { screen: app.screen, mode: app.mode, level: app.level && app.level.id, game: app.game, save: app.save }; },
    tick() { if (app.mode === 'playing' && app.game) handleEvents(E.step(app.game)); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
