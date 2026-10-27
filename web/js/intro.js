/*
 * Michy's Pet Snake: opening cutscene (about 4.5 seconds).
 *
 *   0.0 - 1.0  the snake rests in its terrarium while the title drops in
 *   1.0 - 2.5  the lid slides open, the snake slithers up, over the rim and down
 *   2.5 - 3.7  the camera follows it across the floor, where it spots a mouse
 *   3.7 - 4.5  an iris wipe closes on the snake and hands over to the main menu
 *
 * It is drawn live on a canvas with the same snake and mouse art as the game, so
 * it adapts to any screen shape and adds nothing to the download size. The scene
 * is laid out on a 600 x 600 stage that is scaled to fit the screen; the wall and
 * floor extend to fill whatever space is left around it.
 */
(function (root) {
  'use strict';
  const MPS = (root.MPS = root.MPS || {});
  const S = MPS.Sprites;

  const DURATION = 4.5;
  const STAGE = 600;
  const FLOOR_Y = 455;
  const MENU_BG = '#0e2219';

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { v = clamp01(v); return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2; }
  function span(t, a, b) { return clamp01((t - a) / (b - a)); }

  /** Builds the snake's route: a coil in the tank, up over the rim, down and along the floor. */
  function buildPath() {
    const pts = [];
    let coilPoints = 0;
    for (let a = 0; a <= Math.PI * 3.2; a += 0.12) {
      const r = 6 + a * 7.5;
      pts.push({ x: 205 + Math.cos(a + Math.PI) * r, y: 392 + Math.sin(a + Math.PI) * r * 0.45 });
    }
    coilPoints = pts.length;
    const route = [
      [262, 360], [292, 318], [306, 280], [318, 252], [336, 240], [352, 252],
      [358, 300], [360, 380], [366, 430], [392, FLOOR_Y], [460, FLOOR_Y], [560, FLOOR_Y - 4],
      [640, FLOOR_Y + 2], [720, FLOOR_Y], [800, FLOOR_Y - 2], [900, FLOOR_Y],
    ];
    for (const r of route) pts.push({ x: r[0], y: r[1] });
    // Resample at even spacing so the body segments stay evenly spread.
    const out = [pts[0]];
    const step = 3;
    let carry = 0;
    let coilDist = 0;
    let floorDist = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let d = step - carry;
      while (d <= len) {
        out.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
        d += step;
      }
      carry = len - (d - step);
      if (i === coilPoints - 1) coilDist = out.length * step;
      if (!floorDist && b.y === FLOOR_Y) floorDist = out.length * step;
    }
    return { pts: out, step: step, coilDist: coilDist, floorDist: floorDist };
  }

  const PATH = buildPath();
  const BODY_LEN = Math.min(260, PATH.coilDist - 10); // the whole snake fits in the coil at the start
  const SPACING = 9;

  function sampleAt(dist) {
    const i = Math.max(0, Math.min(PATH.pts.length - 1, dist / PATH.step));
    const i0 = Math.floor(i);
    const i1 = Math.min(PATH.pts.length - 1, i0 + 1);
    const f = i - i0;
    const a = PATH.pts[i0];
    const b = PATH.pts[i1];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  // Where the head is along the path at time t (in stage pixels).
  function headDistance(t) {
    const start = PATH.coilDist - 4;
    const floor = PATH.floorDist + 40;
    const chase = floor + 330;
    if (t < 1.0) return start + Math.sin(t * 6) * 2;
    if (t < 2.5) return start + (floor - start) * ease(span(t, 1.0, 2.5));
    return floor + (chase - floor) * ease(span(t, 2.5, 4.4));
  }

  function Intro() {
    this.canvas = null;
    this.ctx = null;
    this.running = false;
    this.skipping = false;
    this.raf = 0;
    this.start = 0;
    this.last = 0;
    this.played = {};
    this.body = [];
    for (let i = 0; i < Math.ceil(BODY_LEN / SPACING) + 1; i++) this.body.push({ x: 0, y: 0 });
  }

  Intro.prototype.play = function (canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.running = true;
    this.skipping = false;
    this.played = {};
    this.start = 0;
    this.last = 0;
    this.resize();
    const self = this;
    this.onResize = function () { self.resize(); };
    root.addEventListener('resize', this.onResize);
    this.raf = root.requestAnimationFrame(function (ts) { self.frame(ts); });
  };

  Intro.prototype.resize = function () {
    const dpr = Math.min(3, root.devicePixelRatio || 1);
    const w = root.innerWidth;
    const h = root.innerHeight;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  };

  /** Jumps to the ending wipe. */
  Intro.prototype.skip = function () {
    if (!this.running || this.skipping) return;
    this.skipping = true;
    this.skipAt = this.elapsed;
  };

  Intro.prototype.stop = function () {
    if (!this.running) return;
    this.running = false;
    root.cancelAnimationFrame(this.raf);
    root.removeEventListener('resize', this.onResize);
    if (this.opts.onDone) this.opts.onDone();
  };

  Intro.prototype.cue = function (name, t, at) {
    if (t >= at && !this.played[name]) {
      this.played[name] = true;
      if (MPS.Audio) MPS.Audio.play(name);
    }
  };

  Intro.prototype.frame = function (ts) {
    if (!this.running) return;
    const self = this;
    if (!this.start) this.start = this.last = ts;
    // If the app was in the background, carry on where we left off instead of jumping.
    if (ts - this.last > 250) this.start += ts - this.last - 16;
    this.last = ts;
    let t = (ts - this.start) / 1000;
    this.elapsed = t;
    let wipe = span(t, 3.7, DURATION);
    if (this.skipping) wipe = Math.max(wipe, span(t, this.skipAt, this.skipAt + 0.3));
    this.draw(Math.min(t, DURATION), wipe);
    this.cue('click', t, 1.0);
    this.cue('squeak', t, 2.85);
    if (wipe >= 1) {
      this.stop();
      return;
    }
    this.raf = root.requestAnimationFrame(function (n) { self.frame(n); });
  };

  Intro.prototype.draw = function (t, wipe) {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    // Portrait phones zoom in on the middle of the stage; the camera pan keeps the action in view.
    const scale = h > w ? Math.min(w / 430, h / 640) : Math.min(w / STAGE, h / STAGE) * 0.98;
    const ox = (w - STAGE * scale) / 2;
    const oy = (h - STAGE * scale) / 2;
    const cam = -310 * ease(span(t, 2.2, 3.4));

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Wall and floor fill the whole screen.
    const floorScreen = oy + (FLOOR_Y + 12) * scale;
    const wall = ctx.createLinearGradient(0, 0, 0, floorScreen);
    wall.addColorStop(0, '#22304d');
    wall.addColorStop(1, '#3a4a6e');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, floorScreen);
    ctx.fillStyle = '#7a4c2c';
    ctx.fillRect(0, floorScreen, w, h - floorScreen);
    ctx.fillStyle = '#5e3920';
    ctx.fillRect(0, floorScreen, w, Math.max(3, 6 * scale));

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.save();
    ctx.translate(cam, 0);
    this.drawRoom(ctx, t, cam);
    this.drawTerrarium(ctx, t, true);
    this.drawSnake(ctx, t);
    this.drawTerrarium(ctx, t, false);
    this.drawMouse(ctx, t);
    ctx.restore();
    this.drawTitle(ctx, t, Math.min(1, (w / scale - 30) / 470));
    ctx.restore();

    if (wipe > 0) this.drawWipe(ctx, t, wipe, ox, oy, scale, cam);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  Intro.prototype.drawRoom = function (ctx, t, cam) {
    // Window with stars, parallax so the room feels deep.
    ctx.save();
    ctx.translate(-cam * 0.35, 0);
    ctx.fillStyle = '#0f1830';
    S.roundRect(ctx, 410, 158, 140, 100, 10);
    ctx.fill();
    ctx.strokeStyle = '#c9a77a';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(480, 158); ctx.lineTo(480, 258);
    ctx.moveTo(410, 208); ctx.lineTo(550, 208);
    ctx.stroke();
    ctx.fillStyle = '#fff6c9';
    S.circle(ctx, 518, 184, 12);
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      const tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 2);
      ctx.globalAlpha = 0.4 + tw * 0.6;
      S.circle(ctx, 424 + i * 21, 222 + (i % 3) * 11, 1.6);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Floor planks.
    ctx.strokeStyle = 'rgba(60, 30, 10, 0.35)';
    ctx.lineWidth = 2;
    for (let x = -200; x < 1300; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, FLOOR_Y + 14);
      ctx.lineTo(x - 40, STAGE + 200);
      ctx.stroke();
    }
    // The terrarium's stand.
    ctx.fillStyle = '#8f5f3a';
    S.roundRect(ctx, 95, 432, 250, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#6e4529';
    ctx.fillRect(110, 454, 16, 14);
    ctx.fillRect(314, 454, 16, 14);
    // A rug and a sofa leg further along the floor, where the mouse lives.
    ctx.fillStyle = '#b8434f';
    ctx.beginPath();
    ctx.ellipse(700, FLOOR_Y + 30, 150, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5c3b6e';
    S.roundRect(ctx, 820, 300, 240, 140, 30);
    ctx.fill();
    ctx.fillStyle = '#3e2650';
    ctx.fillRect(840, 440, 20, 18);
    ctx.fillRect(1020, 440, 20, 18);
  };

  Intro.prototype.drawTerrarium = function (ctx, t, back) {
    const x = 110;
    const y = 262;
    const w = 220;
    const hgt = 170;
    if (back) {
      ctx.fillStyle = 'rgba(160, 220, 235, 0.18)';
      ctx.fillRect(x, y, w, hgt);
      // sand, rock, plant and water dish
      ctx.fillStyle = '#e8cf98';
      ctx.beginPath();
      ctx.moveTo(x, y + hgt);
      ctx.lineTo(x, y + hgt - 30);
      ctx.quadraticCurveTo(x + w / 2, y + hgt - 46, x + w, y + hgt - 26);
      ctx.lineTo(x + w, y + hgt);
      ctx.fill();
      ctx.fillStyle = '#8c8a83';
      ctx.beginPath();
      ctx.ellipse(x + 40, y + hgt - 40, 26, 18, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#3f8a3a';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const sway = Math.sin(t * 2 + i) * 4;
        ctx.beginPath();
        ctx.moveTo(x + 185 + i * 6, y + hgt - 32);
        ctx.quadraticCurveTo(x + 180 + i * 8 + sway, y + hgt - 70, x + 178 + i * 10 + sway, y + hgt - 95 + i * 6);
        ctx.stroke();
      }
      ctx.fillStyle = '#5aa9d6';
      ctx.beginPath();
      ctx.ellipse(x + 120, y + hgt - 22, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // Front glass, frame and the sliding lid.
    ctx.fillStyle = 'rgba(190, 235, 245, 0.16)';
    ctx.fillRect(x, y, w, hgt);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + 25, y + 20); ctx.lineTo(x + 60, y + 20);
    ctx.moveTo(x + 25, y + 34); ctx.lineTo(x + 40, y + 34);
    ctx.stroke();
    ctx.strokeStyle = '#2f3b44';
    ctx.lineWidth = 6;
    ctx.strokeRect(x, y, w, hgt);
    const open = ease(span(t, 0.75, 1.25));
    const lidX = x - 4 - open * 120;
    ctx.fillStyle = '#4a5963';
    S.roundRect(ctx, lidX, y - 12, w + 8, 12, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 9; i++) ctx.fillRect(lidX + 14 + i * 24, y - 9, 12, 2);
    // Name plate.
    ctx.fillStyle = '#d9b35b';
    S.roundRect(ctx, x + 70, y + hgt - 18, 80, 14, 4);
    ctx.fill();
    ctx.fillStyle = '#4a3410';
    ctx.font = '900 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MICHY', x + 110, y + hgt - 11);
  };

  Intro.prototype.drawSnake = function (ctx, t) {
    const head = headDistance(t);
    const n = this.body.length;
    for (let i = 0; i < n; i++) {
      const p = sampleAt(head - i * SPACING);
      // a gentle slither wave once it is moving
      const moving = t > 1.0 ? 1 : 0.25;
      const wave = Math.sin(i * 0.7 - t * 9) * 2.2 * moving * (i > 0 ? 1 : 0);
      this.body[i].x = p.x;
      this.body[i].y = p.y + wave;
    }
    const a = sampleAt(head - 6);
    const b = sampleAt(head);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    let lookX = Math.cos(-angle) * 0.9;
    let lookY = Math.sin(-angle) * 0.9;
    if (t > 0.6 && t < 1.2) { // glances up at the lid
      lookX = 0.2; lookY = -0.9;
    }
    S.drawSnake(ctx, this.body, {
      width: 20,
      count: n,
      skin: S.SKINS[this.opts.skin] || S.SKINS.sunset,
      angle: angle,
      now: t * 1000,
      mouthOpen: t > 3.1 && t < 3.7,
      lookX: lookX,
      lookY: lookY,
    });
    // "!" bubbles: noticing the open lid, then the mouse.
    this.bubble(ctx, b.x + 4, b.y - 34, span(t, 0.8, 0.95) * (1 - span(t, 1.3, 1.4)));
    this.bubble(ctx, b.x + 4, b.y - 34, span(t, 2.95, 3.05) * (1 - span(t, 3.5, 3.6)));
  };

  Intro.prototype.bubble = function (ctx, x, y, k) {
    if (k <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.fillStyle = '#fff4e0';
    S.circle(ctx, 0, 0, 14);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, 10); ctx.lineTo(-10, 22); ctx.lineTo(2, 12);
    ctx.fill();
    ctx.fillStyle = '#e2463b';
    ctx.font = '900 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 1);
    ctx.restore();
  };

  Intro.prototype.drawMouse = function (ctx, t) {
    if (t < 2.3) return;
    let x;
    let facing = -1;
    if (t < 2.85) x = 900 - 230 * ease(span(t, 2.3, 2.85));
    else if (t < 3.15) x = 670;
    else { x = 670 + 330 * ease(span(t, 3.15, 4.3)); facing = 1; }
    const y = FLOOR_Y - 6 - (t > 3.1 && t < 3.25 ? Math.sin(span(t, 3.1, 3.25) * Math.PI) * 14 : 0);
    S.drawMouse(ctx, x, y, 34, t * 1000, facing);
  };

  Intro.prototype.drawTitle = function (ctx, t, fit) {
    const words = ["MICHY'S", 'PET SNAKE'];
    ctx.save();
    ctx.translate(STAGE / 2, 0);
    ctx.scale(fit, fit);
    ctx.translate(-STAGE / 2, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; // sharp letter corners otherwise grow long miter spikes
    for (let wI = 0; wI < 2; wI++) {
      const word = words[wI];
      const size = wI === 0 ? 30 : 64;
      ctx.font = '900 ' + size + 'px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
      const total = ctx.measureText(word).width + (word.length - 1) * 2;
      let x = STAGE / 2 - total / 2;
      for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        const cw = ctx.measureText(ch).width;
        const delay = 0.08 + (wI * 7 + i) * 0.04;
        const k = ease(span(t, delay, delay + 0.35));
        const y = (wI === 0 ? 58 : 110) - (1 - k) * 60;
        ctx.globalAlpha = k;
        ctx.lineWidth = wI === 0 ? 6 : 10;
        ctx.strokeStyle = '#3a1c05';
        ctx.strokeText(ch, x + cw / 2, y);
        ctx.fillStyle = wI === 0 ? '#ffc94d' : '#ff9933';
        ctx.fillText(ch, x + cw / 2, y);
        x += cw + 2;
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  Intro.prototype.drawWipe = function (ctx, t, wipe, ox, oy, scale, cam) {
    const head = sampleAt(headDistance(t));
    const cx = ox + (head.x + cam) * scale;
    const cy = oy + head.y * scale;
    const far = Math.hypot(Math.max(cx, this.w - cx), Math.max(cy, this.h - cy));
    const r = far * (1 - ease(wipe));
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = MENU_BG;
    ctx.beginPath();
    ctx.rect(0, 0, this.w, this.h);
    ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2, true);
    ctx.fill('evenodd');
  };

  MPS.Intro = new Intro();
  MPS.Intro.DURATION = DURATION;
})(typeof window !== 'undefined' ? window : globalThis);
