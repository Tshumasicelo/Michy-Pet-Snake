/*
 * Michy's Pet Snake: characters and props, drawn with Canvas paths.
 *
 * Everything is vector-drawn at the size it is needed, so it stays sharp on any
 * screen density and costs nothing to download. The game board, the intro and
 * the How to Play icons all share these functions, so the characters look the
 * same everywhere.
 */
(function (root) {
  'use strict';
  const MPS = (root.MPS = root.MPS || {});
  const TAU = Math.PI * 2;

  const SKINS = {
    // The default keeps the original Aspect Snake orange.
    sunset: { name: 'Sunset', body: '#ff9933', pattern: '#ff6600', outline: '#b95a00', belly: '#ffd08a', head: '#ffa347' },
    emerald: { name: 'Emerald', body: '#3fbf6f', pattern: '#1f8f4f', outline: '#15663a', belly: '#c3f5cd', head: '#4fd07f' },
    midnight: { name: 'Midnight', body: '#6b6fe0', pattern: '#3a3cab', outline: '#25277a', belly: '#c4c6ff', head: '#7c80ee' },
    golden: { name: 'Golden', body: '#f5c542', pattern: '#d49a17', outline: '#8f6a0c', belly: '#fff1b8', head: '#ffd65c' },
  };

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /**
   * Draws a snake through a list of points (head first, in pixels).
   * opts: { width, count, skin, angle, now, dead, mouthOpen, lookX, lookY, shield, bulges: [index...] }
   */
  function drawSnake(ctx, pts, opts) {
    const n = opts.count !== undefined ? opts.count : pts.length;
    if (!n) return;
    const skin = opts.skin || SKINS.sunset;
    const w = opts.width;
    const jump = w * 1.9; // points further apart than this are a wrap-around, not a body segment

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Outline, then body, tapering over the last few segments.
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? skin.outline : skin.body;
      for (let i = n - 1; i > 0; i--) {
        const a = pts[i];
        const b = pts[i - 1];
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > jump) continue;
        const taper = i > n - 5 ? 0.45 + 0.55 * ((n - i) / 5) : 1;
        ctx.lineWidth = w * taper + (pass === 0 ? Math.max(2, w * 0.14) : 0);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      if (n === 1) {
        ctx.fillStyle = pass === 0 ? skin.outline : skin.body;
        circle(ctx, pts[0].x, pts[0].y, w / 2);
        ctx.fill();
      }
    }

    // Swallowed prey travelling down the body.
    if (opts.bulges) {
      ctx.fillStyle = skin.body;
      ctx.strokeStyle = skin.outline;
      ctx.lineWidth = Math.max(1.5, w * 0.08);
      for (let k = 0; k < opts.bulges.length; k++) {
        const pos = opts.bulges[k];
        const i = Math.floor(pos);
        if (i < 1 || i >= n - 1) continue;
        const f = pos - i;
        const x = pts[i].x + (pts[i + 1].x - pts[i].x) * f;
        const y = pts[i].y + (pts[i + 1].y - pts[i].y) * f;
        circle(ctx, x, y, w * 0.62);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Scale bands: a dashed stroke down the spine.
    ctx.strokeStyle = skin.pattern;
    ctx.lineWidth = w * 0.5;
    ctx.setLineDash([w * 0.22, w * 0.42]);
    ctx.beginPath();
    let open = false;
    for (let i = 1; i < n - 2; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > jump) { open = false; continue; }
      if (!open) { ctx.moveTo(a.x, a.y); open = true; }
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // A soft highlight so the body reads as round.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = w * 0.16;
    ctx.beginPath();
    open = false;
    for (let i = 0; i < n - 3; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > jump) { open = false; continue; }
      if (!open) { ctx.moveTo(a.x - w * 0.12, a.y - w * 0.12); open = true; }
      ctx.lineTo(b.x - w * 0.12, b.y - w * 0.12);
    }
    ctx.stroke();
    ctx.restore();

    drawHead(ctx, pts[0].x, pts[0].y, opts);
  }

  function drawHead(ctx, x, y, opts) {
    const skin = opts.skin || SKINS.sunset;
    const w = opts.width;
    const now = opts.now || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(opts.angle || 0);

    // Tongue flick every couple of seconds, unless eating or dead.
    const flick = (now % 2200) < 260 && !opts.dead && !opts.mouthOpen;
    if (flick) {
      const out = Math.sin(((now % 2200) / 260) * Math.PI) * w * 0.55;
      ctx.strokeStyle = '#e23b5a';
      ctx.lineWidth = Math.max(1.5, w * 0.08);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.45, 0);
      ctx.lineTo(w * 0.45 + out, 0);
      ctx.lineTo(w * 0.45 + out + w * 0.14, -w * 0.09);
      ctx.moveTo(w * 0.45 + out, 0);
      ctx.lineTo(w * 0.45 + out + w * 0.14, w * 0.09);
      ctx.stroke();
    }

    // Head shape.
    ctx.fillStyle = skin.head;
    ctx.strokeStyle = skin.outline;
    ctx.lineWidth = Math.max(2, w * 0.1);
    ctx.beginPath();
    ctx.ellipse(w * 0.06, 0, w * 0.58, w * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Open mouth when prey is right ahead.
    if (opts.mouthOpen && !opts.dead) {
      ctx.fillStyle = '#6b1d2a';
      ctx.beginPath();
      ctx.moveTo(w * 0.62, 0);
      ctx.lineTo(w * 0.2, -w * 0.2);
      ctx.lineTo(w * 0.2, w * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(w * 0.42, -w * 0.12);
      ctx.lineTo(w * 0.36, -w * 0.02);
      ctx.lineTo(w * 0.3, -w * 0.15);
      ctx.moveTo(w * 0.42, w * 0.12);
      ctx.lineTo(w * 0.36, w * 0.02);
      ctx.lineTo(w * 0.3, w * 0.15);
      ctx.fill();
    } else {
      ctx.fillStyle = skin.outline;
      circle(ctx, w * 0.5, -w * 0.1, w * 0.035);
      circle(ctx, w * 0.5, w * 0.1, w * 0.035);
      ctx.fill();
    }

    // Eyes: blink now and then, look toward the prey, cross out when dead.
    const blink = (now % 3700) < 130;
    for (const side of [-1, 1]) {
      const ex = w * 0.12;
      const ey = side * w * 0.24;
      if (opts.dead) {
        ctx.strokeStyle = '#2a1a10';
        ctx.lineWidth = Math.max(1.5, w * 0.07);
        const r = w * 0.1;
        ctx.beginPath();
        ctx.moveTo(ex - r, ey - r); ctx.lineTo(ex + r, ey + r);
        ctx.moveTo(ex + r, ey - r); ctx.lineTo(ex - r, ey + r);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(ex, ey, w * 0.16, blink ? w * 0.03 : w * 0.16, 0, 0, TAU);
      ctx.fill();
      if (!blink) {
        const lx = Math.max(-1, Math.min(1, opts.lookX || 0.6));
        const ly = Math.max(-1, Math.min(1, opts.lookY || 0));
        ctx.fillStyle = '#1b1b24';
        circle(ctx, ex + lx * w * 0.06, ey + ly * w * 0.06, w * 0.085);
        ctx.fill();
        ctx.fillStyle = '#fff';
        circle(ctx, ex + lx * w * 0.06 - w * 0.03, ey + ly * w * 0.06 - w * 0.03, w * 0.03);
        ctx.fill();
      }
    }
    ctx.restore();

    if (opts.shield) {
      ctx.save();
      ctx.strokeStyle = 'rgba(120, 220, 255, 0.9)';
      ctx.lineWidth = Math.max(2, w * 0.09);
      ctx.setLineDash([w * 0.25, w * 0.15]);
      ctx.lineDashOffset = -now / 40;
      circle(ctx, x, y, w * 0.85);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- Prey ---------------------------------------------------------------

  function drawMouse(ctx, x, y, s, now, facing) {
    const bob = Math.sin(now / 140 + x) * s * 0.03;
    ctx.save();
    ctx.translate(x, y + bob);
    if (facing > 0) ctx.scale(-1, 1);
    // tail
    ctx.strokeStyle = '#e59aa8';
    ctx.lineWidth = Math.max(1.2, s * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s * 0.3, s * 0.1);
    ctx.quadraticCurveTo(s * 0.55, s * 0.35 + Math.sin(now / 200) * s * 0.08, s * 0.5, -s * 0.05);
    ctx.stroke();
    // body
    ctx.fillStyle = '#b9b3c9';
    ctx.strokeStyle = '#6d6680';
    ctx.lineWidth = Math.max(1.2, s * 0.05);
    ctx.beginPath();
    ctx.ellipse(s * 0.05, s * 0.06, s * 0.34, s * 0.25, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // head
    ctx.beginPath();
    ctx.ellipse(-s * 0.22, -s * 0.02, s * 0.2, s * 0.17, -0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // ears
    ctx.fillStyle = '#ffb3c1';
    circle(ctx, -s * 0.16, -s * 0.2, s * 0.11);
    ctx.fill();
    ctx.stroke();
    // eye and nose
    ctx.fillStyle = '#1b1b24';
    circle(ctx, -s * 0.28, -s * 0.06, s * 0.04);
    ctx.fill();
    ctx.fillStyle = '#ff6b8b';
    circle(ctx, -s * 0.42, s * 0.02, s * 0.045);
    ctx.fill();
    ctx.restore();
  }

  function drawBeetle(ctx, x, y, s, now) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(now / 500 + y) * 0.15);
    ctx.strokeStyle = '#1d2b26';
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, i * s * 0.12);
      ctx.lineTo(-s * 0.42, i * s * 0.18 - s * 0.02);
      ctx.moveTo(s * 0.28, i * s * 0.12);
      ctx.lineTo(s * 0.42, i * s * 0.18 - s * 0.02);
      ctx.stroke();
    }
    ctx.fillStyle = '#2f6f5e';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.04, s * 0.27, s * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1d2b26';
    circle(ctx, 0, -s * 0.3, s * 0.13);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.2);
    ctx.lineTo(0, s * 0.35);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    circle(ctx, -s * 0.1, -s * 0.05, s * 0.05);
    circle(ctx, s * 0.12, s * 0.12, s * 0.04);
    ctx.fill();
    ctx.restore();
  }

  function drawCricket(ctx, x, y, s, now) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#2f5b12';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // big back legs
    ctx.beginPath();
    ctx.moveTo(s * 0.05, s * 0.05);
    ctx.lineTo(s * 0.3, -s * 0.22);
    ctx.lineTo(s * 0.42, s * 0.25);
    ctx.moveTo(-s * 0.05, s * 0.08);
    ctx.lineTo(s * 0.2, -s * 0.12);
    ctx.lineTo(s * 0.3, s * 0.3);
    ctx.stroke();
    // antennae
    const wave = Math.sin(now / 120) * s * 0.06;
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, -s * 0.05);
    ctx.quadraticCurveTo(-s * 0.45, -s * 0.35, -s * 0.2 + wave, -s * 0.45);
    ctx.moveTo(-s * 0.3, -s * 0.02);
    ctx.quadraticCurveTo(-s * 0.55, -s * 0.25, -s * 0.48 + wave, -s * 0.42);
    ctx.stroke();
    ctx.fillStyle = '#8bd13b';
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.33, s * 0.15, -0.15, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1b1b24';
    circle(ctx, -s * 0.24, -s * 0.04, s * 0.04);
    ctx.fill();
    ctx.restore();
  }

  function drawMoth(ctx, x, y, s, now) {
    const flap = 0.55 + Math.abs(Math.sin(now / 70)) * 0.45;
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 0, s * 0.05, 0, 0, s * 0.7);
    glow.addColorStop(0, 'rgba(255, 220, 90, 0.55)');
    glow.addColorStop(1, 'rgba(255, 220, 90, 0)');
    ctx.fillStyle = glow;
    circle(ctx, 0, 0, s * 0.7);
    ctx.fill();
    ctx.fillStyle = '#ffcf3f';
    ctx.strokeStyle = '#a86f00';
    ctx.lineWidth = Math.max(1, s * 0.04);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side * flap, 1);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.05);
      ctx.bezierCurveTo(s * 0.25, -s * 0.45, s * 0.5, -s * 0.2, s * 0.38, s * 0.02);
      ctx.bezierCurveTo(s * 0.45, s * 0.25, s * 0.2, s * 0.35, 0, s * 0.08);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff3b0';
      circle(ctx, s * 0.24, -s * 0.12, s * 0.06);
      ctx.fill();
      ctx.fillStyle = '#ffcf3f';
      ctx.restore();
    }
    ctx.fillStyle = '#6b4a00';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.02, s * 0.06, s * 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawTreat(ctx, x, y, s, now, num, active) {
    ctx.save();
    ctx.translate(x, y);
    const pulse = active ? 1 + Math.sin(now / 150) * 0.07 : 0.82;
    ctx.scale(pulse, pulse);
    if (active) {
      ctx.fillStyle = 'rgba(255, 201, 77, 0.35)';
      circle(ctx, 0, 0, s * 0.62);
      ctx.fill();
    }
    ctx.globalAlpha = active ? 1 : 0.55;
    // a little parcel
    ctx.fillStyle = active ? '#d9935a' : '#9b8574';
    ctx.strokeStyle = '#6b3f1d';
    ctx.lineWidth = Math.max(1.2, s * 0.05);
    roundRect(ctx, -s * 0.36, -s * 0.32, s * 0.72, s * 0.64, s * 0.1);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? '#ff6b8b' : '#b3a0a5';
    ctx.fillRect(-s * 0.06, -s * 0.32, s * 0.12, s * 0.64);
    ctx.fillStyle = '#fff4e0';
    ctx.font = '900 ' + Math.round(s * 0.42) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#4a2a10';
    ctx.lineWidth = Math.max(2, s * 0.1);
    ctx.strokeText(String(num), 0, s * 0.03);
    ctx.fillText(String(num), 0, s * 0.03);
    ctx.restore();
  }

  function drawLeaf(ctx, x, y, s, now) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.6 + Math.sin(now / 400) * 0.1);
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#9a7400';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(-s * 0.38, 0);
    ctx.quadraticCurveTo(0, -s * 0.38, s * 0.38, 0);
    ctx.quadraticCurveTo(0, s * 0.38, -s * 0.38, 0);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.45, 0);
    ctx.lineTo(s * 0.3, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawPrey(ctx, p, x, y, s, now, g) {
    switch (p.type) {
      case 'mouse': drawMouse(ctx, x, y, s, now, p.x - p.px || p.facing || -1); break;
      case 'beetle': drawBeetle(ctx, x, y, s, now); break;
      case 'cricket': drawCricket(ctx, x, y, s, now); break;
      case 'moth': drawMoth(ctx, x, y, s, now); break;
      case 'treat': drawTreat(ctx, x, y, s, now, p.num, g ? MPS.Engine.isEdible(g, p) : true); break;
      case 'leaf': drawLeaf(ctx, x, y, s, now); break;
    }
  }

  // ---- Power-ups ----------------------------------------------------------

  function drawPower(ctx, type, x, y, s, now) {
    ctx.save();
    ctx.translate(x, y);
    const pulse = 1 + Math.sin(now / 180) * 0.06;
    ctx.scale(pulse, pulse);
    const ring = { shield: '#4cc9f0', zoomies: '#ffb000', chill: '#9be7ff' }[type];
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    circle(ctx, 0, s * 0.05, s * 0.46);
    ctx.fill();
    ctx.fillStyle = '#fff4e0';
    ctx.strokeStyle = ring;
    ctx.lineWidth = Math.max(2, s * 0.09);
    circle(ctx, 0, 0, s * 0.42);
    ctx.fill();
    ctx.stroke();
    if (type === 'shield') {
      // a turtle-shell style shield
      ctx.fillStyle = '#2b9fd6';
      ctx.strokeStyle = '#155a80';
      ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.28);
      ctx.quadraticCurveTo(s * 0.26, -s * 0.24, s * 0.24, -s * 0.02);
      ctx.quadraticCurveTo(s * 0.2, s * 0.2, 0, s * 0.3);
      ctx.quadraticCurveTo(-s * 0.2, s * 0.2, -s * 0.24, -s * 0.02);
      ctx.quadraticCurveTo(-s * 0.26, -s * 0.24, 0, -s * 0.28);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.18);
      ctx.lineTo(0, s * 0.2);
      ctx.moveTo(-s * 0.15, -s * 0.02);
      ctx.lineTo(s * 0.15, -s * 0.02);
      ctx.stroke();
    } else if (type === 'zoomies') {
      ctx.fillStyle = '#ffb000';
      ctx.strokeStyle = '#8a4b00';
      ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath();
      ctx.moveTo(s * 0.06, -s * 0.3);
      ctx.lineTo(-s * 0.16, s * 0.04);
      ctx.lineTo(0, s * 0.04);
      ctx.lineTo(-s * 0.06, s * 0.3);
      ctx.lineTo(s * 0.17, -s * 0.06);
      ctx.lineTo(0.01, -s * 0.06);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#bdefff';
      ctx.strokeStyle = '#3a8fb0';
      ctx.lineWidth = Math.max(1, s * 0.04);
      roundRect(ctx, -s * 0.2, -s * 0.2, s * 0.4, s * 0.4, s * 0.07);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-s * 0.13, -s * 0.13, s * 0.08, s * 0.14);
    }
    ctx.restore();
  }

  // ---- Hazards ------------------------------------------------------------

  function drawHedgehog(ctx, x, y, s, now, dx) {
    ctx.save();
    ctx.translate(x, y);
    if (dx < 0) ctx.scale(-1, 1);
    ctx.fillStyle = '#5a3a22';
    ctx.strokeStyle = '#2b1a0e';
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath();
    const spikes = 9;
    for (let i = 0; i <= spikes; i++) {
      const a = Math.PI + (i / spikes) * Math.PI;
      const r = i % 2 ? s * 0.48 : s * 0.36;
      ctx.lineTo(Math.cos(a) * r - s * 0.04, Math.sin(a) * r + s * 0.15);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d9a877';
    ctx.beginPath();
    ctx.ellipse(s * 0.26, s * 0.1, s * 0.18, s * 0.13, 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1b1b24';
    circle(ctx, s * 0.42, s * 0.12, s * 0.05);
    circle(ctx, s * 0.26, s * 0.04, s * 0.035);
    ctx.fill();
    ctx.fillStyle = '#ff5a5a';
    const blink = (now % 900) < 450;
    if (blink) {
      circle(ctx, -s * 0.05, -s * 0.38, s * 0.05);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVacuum(ctx, x, y, s, now) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now / 900);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    circle(ctx, s * 0.04, s * 0.06, s * 0.46);
    ctx.fill();
    ctx.fillStyle = '#d6d9e0';
    ctx.strokeStyle = '#4b5060';
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    circle(ctx, 0, 0, s * 0.44);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4b5060';
    circle(ctx, 0, 0, s * 0.22);
    ctx.fill();
    ctx.strokeStyle = '#ff5a5a';
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.36, -0.6, 0.6);
    ctx.stroke();
    ctx.fillStyle = (now % 700) < 350 ? '#ff5a5a' : '#ffd0d0';
    circle(ctx, s * 0.1, 0, s * 0.06);
    ctx.fill();
    ctx.restore();
  }

  function drawHazard(ctx, theme, h, x, y, s, now) {
    if (theme === 'garden' || theme === 'wild') drawHedgehog(ctx, x, y, s, now, h.dx || h.dy || 1);
    else drawVacuum(ctx, x, y, s, now);
  }

  MPS.Sprites = {
    SKINS: SKINS,
    circle: circle,
    roundRect: roundRect,
    drawSnake: drawSnake,
    drawHead: drawHead,
    drawMouse: drawMouse,
    drawBeetle: drawBeetle,
    drawCricket: drawCricket,
    drawMoth: drawMoth,
    drawTreat: drawTreat,
    drawLeaf: drawLeaf,
    drawPrey: drawPrey,
    drawPower: drawPower,
    drawHedgehog: drawHedgehog,
    drawVacuum: drawVacuum,
    drawHazard: drawHazard,
  };
})(typeof window !== 'undefined' ? window : globalThis);
