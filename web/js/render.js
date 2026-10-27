/*
 * Michy's Pet Snake: board renderer.
 *
 * The floor and obstacles never change during a level, so they are painted once
 * into an offscreen canvas and copied each frame. Moving things (snake, prey,
 * hazards) are drawn on top, with their positions blended between the previous
 * and current tick so movement looks smooth while the rules stay grid-based.
 */
(function (root) {
  'use strict';
  const MPS = (root.MPS = root.MPS || {});
  const S = MPS.Sprites;
  const E = MPS.Engine;

  // floor style paints the ground; block style paints obstacles.
  const THEMES = {
    terrarium: { floorA: '#e8cf98', floorB: '#e0c48a', speck: '#c9a96a', wall: '#7a8b5a', wallTop: '#9db070', water: '#4aa3c7', style: 'sand', block: 'rock' },
    bedroom: { floorA: '#c98d5a', floorB: '#c0844f', speck: '#a86c3d', wall: '#5e3570', wallTop: '#9a62ae', water: '#4aa3c7', style: 'planks', block: 'furniture' },
    living: { floorA: '#4f8a83', floorB: '#4a827b', speck: '#3f716b', wall: '#a4553b', wallTop: '#cf7656', water: '#4aa3c7', style: 'carpet', block: 'furniture' },
    hallway: { floorA: '#d6a66d', floorB: '#cd9c62', speck: '#b0814a', wall: '#4b5668', wallTop: '#7d8aa0', water: '#4aa3c7', style: 'planksV', block: 'furniture' },
    garden: { floorA: '#6cbf4f', floorB: '#64b548', speck: '#4f9a37', wall: '#2f7a3a', wallTop: '#47a052', water: '#3f9bd6', style: 'grass', block: 'hedge' },
    kitchen: { floorA: '#efe3cf', floorB: '#e2cdb2', speck: '#c9ad8c', wall: '#3f4d61', wallTop: '#7f90a8', water: '#4aa3c7', style: 'tiles', block: 'counter' },
    basement: { floorA: '#8d8f96', floorB: '#878990', speck: '#73757c', wall: '#8a5f2e', wallTop: '#c9995a', water: '#4aa3c7', style: 'concrete', block: 'crate' },
    porch: { floorA: '#b98b5e', floorB: '#b08255', speck: '#94683e', wall: '#6e4a22', wallTop: '#d4a666', water: '#4aa3c7', style: 'deck', block: 'crate' },
    night: { floorA: '#2c4a63', floorB: '#29455d', speck: '#223a4f', wall: '#5a3a5e', wallTop: '#8d64a0', water: '#4aa3c7', style: 'carpet', block: 'furniture' },
    attic: { floorA: '#6e5240', floorB: '#674c3b', speck: '#56402f', wall: '#3d2a1c', wallTop: '#c9a46a', water: '#4aa3c7', style: 'planks', block: 'crate' },
    wild: { floorA: '#4f7d3a', floorB: '#4a7636', speck: '#3c6229', wall: '#6d6a63', wallTop: '#9a968d', water: '#3f8fc4', style: 'forest', block: 'rock' },
  };

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = 0;
    this.tile = 0;
    this.dpr = 1;
    this.staticLayer = null;
    this.staticKey = '';
    this.particles = [];
    for (let i = 0; i < 140; i++) this.particles.push({ life: 0 });
    this.floaters = [];
    for (let i = 0; i < 12; i++) this.floaters.push({ life: 0 });
    this.shake = 0;
    this.flash = 0;
    this.gulps = [];
    this.bulges = [];
    this.pts = [];
    for (let i = 0; i < E.COLS * E.ROWS; i++) this.pts.push({ x: 0, y: 0 });
  }

  /** Sets the board size in CSS pixels; the backing store follows devicePixelRatio. */
  Renderer.prototype.resize = function (cssSize, dpr) {
    this.dpr = Math.min(3, dpr || 1);
    this.size = cssSize;
    this.tile = cssSize / E.COLS;
    this.canvas.style.width = cssSize + 'px';
    this.canvas.style.height = cssSize + 'px';
    this.canvas.width = Math.round(cssSize * this.dpr);
    this.canvas.height = Math.round(cssSize * this.dpr);
    this.staticKey = '';
  };

  Renderer.prototype.reset = function () {
    for (const p of this.particles) p.life = 0;
    for (const f of this.floaters) f.life = 0;
    this.gulps.length = 0;
    this.shake = 0;
    this.flash = 0;
  };

  function hash(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  Renderer.prototype.buildStatic = function (g) {
    const key = g.level.id + ':' + this.size + ':' + this.dpr;
    if (this.staticKey === key) return;
    this.staticKey = key;
    const t = this.tile;
    const layer = makeCanvas(this.size * this.dpr, this.size * this.dpr);
    const c = layer.getContext('2d');
    c.scale(this.dpr, this.dpr);
    const th = THEMES[g.level.theme] || THEMES.bedroom;
    paintFloor(c, th, t, this.size);
    paintObstacles(c, g, th, t);
    this.staticLayer = layer;
  };

  function paintFloor(c, th, t, size) {
    c.fillStyle = th.floorA;
    c.fillRect(0, 0, size, size);
    for (let y = 0; y < E.ROWS; y++) {
      for (let x = 0; x < E.COLS; x++) {
        const alt = (x + y) % 2 === 0;
        if (th.style === 'tiles') {
          c.fillStyle = alt ? th.floorA : th.floorB;
          c.fillRect(x * t, y * t, t, t);
          continue;
        }
        // A faint checkerboard on every theme helps players line up turns.
        if (alt) {
          c.fillStyle = th.floorB;
          c.fillRect(x * t, y * t, t, t);
        }
        const r = hash(x, y, 7);
        c.fillStyle = th.speck;
        if (th.style === 'grass' || th.style === 'forest') {
          if (r < 0.35) {
            c.strokeStyle = th.speck;
            c.lineWidth = Math.max(1, t * 0.06);
            c.beginPath();
            const bx = x * t + t * (0.2 + r);
            const by = y * t + t * 0.75;
            c.moveTo(bx, by); c.lineTo(bx - t * 0.08, by - t * 0.25);
            c.moveTo(bx, by); c.lineTo(bx + t * 0.06, by - t * 0.28);
            c.stroke();
          } else if (r > 0.94 && th.style === 'grass') {
            c.fillStyle = hash(x, y, 3) > 0.5 ? '#fff2a8' : '#ffc2d1';
            S.circle(c, x * t + t * 0.5, y * t + t * 0.5, t * 0.1);
            c.fill();
          } else if (r > 0.9 && th.style === 'forest') {
            c.fillStyle = '#8a6b3a';
            c.beginPath();
            c.ellipse(x * t + t * 0.5, y * t + t * 0.5, t * 0.18, t * 0.08, r * 6, 0, Math.PI * 2);
            c.fill();
          }
        } else if (th.style === 'sand' || th.style === 'concrete' || th.style === 'carpet') {
          if (r < 0.5) c.fillRect(x * t + r * t, y * t + hash(y, x, 9) * t, Math.max(1, t * 0.07), Math.max(1, t * 0.07));
        }
      }
    }
    c.strokeStyle = th.speck;
    c.lineWidth = Math.max(1, t * 0.04);
    if (th.style === 'planks' || th.style === 'deck') {
      for (let y = 0; y <= E.ROWS; y += 2) {
        c.beginPath();
        c.moveTo(0, y * t);
        c.lineTo(size, y * t);
        c.stroke();
        const off = (y / 2) % 2 ? 3 : 8;
        for (let x = off; x < E.COLS; x += 10) {
          c.beginPath();
          c.moveTo(x * t, y * t);
          c.lineTo(x * t, (y + 2) * t);
          c.stroke();
        }
      }
    } else if (th.style === 'planksV') {
      for (let x = 0; x <= E.COLS; x += 2) {
        c.beginPath();
        c.moveTo(x * t, 0);
        c.lineTo(x * t, size);
        c.stroke();
      }
      c.fillStyle = 'rgba(160, 40, 50, 0.25)';
      c.fillRect(t * 6, 0, t * 8, size);
    } else if (th.style === 'tiles') {
      c.strokeStyle = 'rgba(0,0,0,0.08)';
      for (let i = 0; i <= E.COLS; i++) {
        c.beginPath(); c.moveTo(i * t, 0); c.lineTo(i * t, size); c.stroke();
        c.beginPath(); c.moveTo(0, i * t); c.lineTo(size, i * t); c.stroke();
      }
    } else if (th.style === 'concrete') {
      c.strokeStyle = 'rgba(0,0,0,0.15)';
      c.beginPath();
      c.moveTo(t * 3, t * 16); c.lineTo(t * 5, t * 15); c.lineTo(t * 6, t * 17);
      c.moveTo(t * 15, t * 4); c.lineTo(t * 16.5, t * 6); c.lineTo(t * 18, t * 5.5);
      c.stroke();
    }
    if (th.style === 'deck') {
      c.fillStyle = 'rgba(120, 60, 30, 0.35)';
      S.roundRect(c, t * 7, t * 15.2, t * 6, t * 3.6, t * 0.4);
      c.fill();
    }
    if (th === THEMES.night) {
      const grad = c.createRadialGradient(size * 0.75, size * 0.2, t, size * 0.75, size * 0.2, size * 0.9);
      grad.addColorStop(0, 'rgba(190, 220, 255, 0.18)');
      grad.addColorStop(1, 'rgba(0, 0, 20, 0.25)');
      c.fillStyle = grad;
      c.fillRect(0, 0, size, size);
    }
  }

  function paintObstacles(c, g, th, t) {
    const grid = g.grid;
    const at = (x, y) => (x >= 0 && y >= 0 && x < E.COLS && y < E.ROWS ? grid[y * E.COLS + x] : 0);
    for (let y = 0; y < E.ROWS; y++) {
      for (let x = 0; x < E.COLS; x++) {
        const cell = at(x, y);
        if (cell === E.CELL_WATER) {
          c.fillStyle = th.water;
          c.fillRect(x * t, y * t, t + 0.5, t + 0.5);
        }
      }
    }
    // Water shoreline and ripples.
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = Math.max(1, t * 0.06);
    for (let y = 0; y < E.ROWS; y++) {
      for (let x = 0; x < E.COLS; x++) {
        if (at(x, y) !== E.CELL_WATER) continue;
        if (hash(x, y, 5) < 0.5) {
          c.beginPath();
          c.arc(x * t + t * 0.5, y * t + t * 0.6, t * 0.22, Math.PI * 1.1, Math.PI * 1.9);
          c.stroke();
        }
      }
    }
    for (let y = 0; y < E.ROWS; y++) {
      for (let x = 0; x < E.COLS; x++) {
        if (at(x, y) !== E.CELL_WALL) continue;
        paintWallCell(c, th, x, y, t, at);
      }
    }
  }

  function paintWallCell(c, th, x, y, t, at) {
    const px = x * t;
    const py = y * t;
    const style = th.block;
    const join = (dx, dy) => at(x + dx, y + dy) === E.CELL_WALL;
    if (style === 'hedge') {
      // bushy hedge: overlapping leaf balls
      c.fillStyle = th.wall;
      c.fillRect(px + (join(-1, 0) ? 0 : t * 0.08), py + t * 0.12, t - (join(-1, 0) ? 0 : t * 0.08) - (join(1, 0) ? 0 : t * 0.08), t * 0.82);
      c.fillStyle = th.wallTop;
      for (let i = 0; i < 3; i++) {
        S.circle(c, px + t * (0.25 + i * 0.25), py + t * (0.35 + (i % 2) * 0.15), t * 0.24);
        c.fill();
      }
      return;
    }
    if (style === 'rock') {
      // a mossy boulder or tree stump
      const r = hash(x, y, 11);
      c.fillStyle = r < 0.5 ? th.wall : '#6b4a2a';
      S.roundRect(c, px + t * 0.06, py + t * 0.1, t * 0.88, t * 0.84, t * 0.35);
      c.fill();
      c.fillStyle = r < 0.5 ? th.wallTop : '#8f6a40';
      S.roundRect(c, px + t * 0.14, py + t * 0.1, t * 0.72, t * 0.5, t * 0.25);
      c.fill();
      c.fillStyle = 'rgba(120, 190, 80, 0.7)';
      S.circle(c, px + t * 0.32, py + t * 0.22, t * 0.12);
      c.fill();
      return;
    }
    // Furniture, crates and counters: a raised block with a lighter top face.
    const l = join(-1, 0) ? 0 : t * 0.04;
    const r = join(1, 0) ? 0 : t * 0.04;
    const top = join(0, -1) ? 0 : t * 0.04;
    const bottom = join(0, 1) ? 0 : t * 0.04;
    c.fillStyle = th.wall;
    c.fillRect(px + l, py + top, t - l - r, t - top - bottom);
    c.fillStyle = th.wallTop;
    const faceBottom = join(0, 1) ? t : t * 0.72;
    c.fillRect(px + l, py + top, t - l - r, faceBottom - top);
    if (style === 'crate') {
      // crate planks
      c.strokeStyle = 'rgba(70, 40, 10, 0.55)';
      c.lineWidth = Math.max(1, t * 0.06);
      c.strokeRect(px + t * 0.12, py + t * 0.12, t * 0.76, t * 0.5);
      c.beginPath();
      c.moveTo(px + t * 0.12, py + t * 0.12);
      c.lineTo(px + t * 0.88, py + t * 0.62);
      c.stroke();
    } else if (style === 'counter') {
      // steel worktop with a bright front edge
      c.fillStyle = 'rgba(255, 255, 255, 0.55)';
      c.fillRect(px + l, py + faceBottom - t * 0.1, t - l - r, t * 0.1);
    } else {
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(px + l, py + top, t - l - r, t * 0.1);
    }
  }

  // ---- Effects ------------------------------------------------------------

  Renderer.prototype.burst = function (gx, gy, color, count) {
    const t = this.tile;
    let made = 0;
    for (let i = 0; i < this.particles.length && made < count; i++) {
      const p = this.particles[i];
      if (p.life > 0) continue;
      const a = Math.random() * Math.PI * 2;
      const v = (0.6 + Math.random() * 1.4) * t * 3;
      p.x = (gx + 0.5) * t;
      p.y = (gy + 0.5) * t;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.life = p.max = 0.35 + Math.random() * 0.35;
      p.color = color;
      p.size = t * (0.08 + Math.random() * 0.1);
      made++;
    }
  };

  Renderer.prototype.floatText = function (gx, gy, text, color) {
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i];
      if (f.life > 0) continue;
      f.x = (gx + 0.5) * this.tile;
      f.y = (gy + 0.2) * this.tile;
      f.text = text;
      f.color = color;
      f.life = f.max = 0.9;
      return;
    }
  };

  Renderer.prototype.addGulp = function (tick) { this.gulps.push(tick); };

  Renderer.prototype.updateEffects = function (dt) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
    }
    for (const f of this.floaters) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.y -= this.tile * 1.2 * dt;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 2);
  };

  // ---- Frame --------------------------------------------------------------

  function lerp(a, b, f) { return a + (b - a) * f; }

  /**
   * Draws one frame. `alpha` (0..1) is how far we are between the last tick and
   * the next, `now` is a millisecond clock for idle animation.
   */
  Renderer.prototype.draw = function (g, alpha, now, opts) {
    opts = opts || {};
    const ctx = this.ctx;
    const t = this.tile;
    const th = THEMES[g.level.theme] || THEMES.bedroom;
    this.buildStatic(g);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);
    if (this.shake > 0 && !opts.reducedMotion) {
      const m = this.shake * t * 0.35;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    ctx.drawImage(this.staticLayer, 0, 0, this.size, this.size);

    const f = g.waiting || !g.alive || g.won ? 1 : Math.max(0, Math.min(1, alpha));

    // Prey and power-ups (blink when about to vanish).
    for (const p of g.prey) {
      if (p.ttl > 0 && p.ttl - p.age < 20 && Math.floor(now / 120) % 2) continue;
      const moved = p.x !== p.px || p.y !== p.py;
      if (moved) p.facing = p.x > p.px ? 1 : p.x < p.px ? -1 : p.facing;
      let x = lerp(p.px, p.x, f);
      let y = lerp(p.py, p.y, f);
      let hopY = 0;
      if (moved && p.type === 'cricket') hopY = -Math.sin(f * Math.PI) * 0.6;
      S.drawPrey(ctx, p, (x + 0.5) * t, (y + 0.5 + hopY) * t, t, now, g);
    }
    for (const pw of g.powerups) {
      if (pw.ttl - pw.age < 20 && Math.floor(now / 120) % 2) continue;
      S.drawPower(ctx, pw.type, (pw.x + 0.5) * t, (pw.y + 0.5) * t, t, now);
    }
    for (const h of g.hazards) {
      S.drawHazard(ctx, g.level.theme, h, (lerp(h.px, h.x, f) + 0.5) * t, (lerp(h.py, h.y, f) + 0.5) * t, t, now);
    }

    this.drawSnake(g, f, now, opts);

    // Particles and floating score text.
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      S.circle(ctx, p.x, p.y, p.size);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 ' + Math.round(t * 0.75) + 'px system-ui, sans-serif';
    ctx.lineWidth = Math.max(2, t * 0.15);
    ctx.strokeStyle = 'rgba(20, 20, 30, 0.8)';
    for (const fl of this.floaters) {
      if (fl.life <= 0) continue;
      ctx.globalAlpha = Math.min(1, fl.life / fl.max * 1.6);
      ctx.fillStyle = fl.color;
      ctx.strokeText(fl.text, fl.x, fl.y);
      ctx.fillText(fl.text, fl.x, fl.y);
    }
    ctx.globalAlpha = 1;

    // Power-up mood tints.
    if (g.chill > 0) {
      ctx.fillStyle = 'rgba(150, 220, 255, 0.12)';
      ctx.fillRect(0, 0, this.size, this.size);
    }
    if (this.flash > 0) {
      ctx.fillStyle = 'rgba(255, 80, 80,' + (this.flash * 0.35).toFixed(3) + ')';
      ctx.fillRect(0, 0, this.size, this.size);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  Renderer.prototype.drawSnake = function (g, f, now, opts) {
    const t = this.tile;
    const n = g.snake.length;
    const pts = this.pts;
    for (let i = 0; i < n; i++) {
      const cur = g.snake[i];
      const prev = g.prev[i] || cur;
      let x = cur.x;
      let y = cur.y;
      // Do not slide across the board on a wrap-around: just appear on the other side.
      if (Math.abs(cur.x - prev.x) <= 1 && Math.abs(cur.y - prev.y) <= 1) {
        x = lerp(prev.x, cur.x, f);
        y = lerp(prev.y, cur.y, f);
      }
      pts[i].x = (x + 0.5) * t;
      pts[i].y = (y + 0.5) * t;
    }
    const view = pts;

    const head = g.snake[0];
    const dir = E.DIRS[g.dir];
    let angle = Math.atan2(dir.y, dir.x);
    if (n > 1 && !g.waiting) {
      const dx = view[0].x - view[1].x;
      const dy = view[0].y - view[1].y;
      if (Math.abs(dx) + Math.abs(dy) > 0.01 && Math.abs(dx) + Math.abs(dy) < t * 1.9) angle = Math.atan2(dy, dx);
    }

    // Look toward the closest edible prey and open wide when it is right ahead.
    let lookX = 0.6;
    let lookY = 0;
    let mouthOpen = false;
    let best = Infinity;
    for (const p of g.prey) {
      if (!E.isEdible(g, p)) continue;
      const d = Math.abs(p.x - head.x) + Math.abs(p.y - head.y);
      if (d < best) {
        best = d;
        const ca = Math.cos(-angle);
        const sa = Math.sin(-angle);
        const vx = p.x - head.x;
        const vy = p.y - head.y;
        const len = Math.max(1, Math.hypot(vx, vy));
        lookX = (vx * ca - vy * sa) / len;
        lookY = (vx * sa + vy * ca) / len;
      }
      if (p.x === head.x + dir.x && p.y === head.y + dir.y) mouthOpen = true;
      if (p.x === head.x + dir.x * 2 && p.y === head.y + dir.y * 2) mouthOpen = true;
    }

    const bulges = this.bulges;
    bulges.length = 0;
    for (let i = this.gulps.length - 1; i >= 0; i--) {
      const pos = g.tick - this.gulps[i] + f;
      if (pos > n) this.gulps.splice(i, 1);
      else bulges.push(pos);
    }

    S.drawSnake(this.ctx, view, {
      width: t * 0.78,
      count: n,
      skin: S.SKINS[opts.skin] || S.SKINS.sunset,
      angle: angle,
      now: now,
      dead: !g.alive,
      mouthOpen: mouthOpen,
      lookX: lookX,
      lookY: lookY,
      shield: g.shield,
      bulges: bulges,
    });

    if (g.zoomies > 0 && !g.waiting) {
      const ctx = this.ctx;
      ctx.strokeStyle = 'rgba(255, 200, 60, 0.7)';
      ctx.lineWidth = Math.max(1.5, t * 0.08);
      ctx.lineCap = 'round';
      for (let k = -1; k <= 1; k++) {
        const bx = view[0].x - dir.x * t * 0.9 + dir.y * k * t * 0.3;
        const by = view[0].y - dir.y * t * 0.9 + dir.x * k * t * 0.3;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - dir.x * t * 0.6, by - dir.y * t * 0.6);
        ctx.stroke();
      }
    }
  };

  MPS.THEMES = THEMES;
  MPS.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
