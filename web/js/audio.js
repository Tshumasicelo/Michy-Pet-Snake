/*
 * Michy's Pet Snake: sound effects.
 *
 * Every sound is synthesized with the Web Audio API, so there are no audio files
 * to license or download. Browsers and Android WebView only allow audio after the
 * player touches the screen or presses a key, so the AudioContext is created on
 * the first gesture and stays silent until then. Nothing plays while sound is off.
 */
(function (root) {
  'use strict';
  const MPS = (root.MPS = root.MPS || {});

  let ctx = null;
  let master = null;
  let enabled = true;
  let noiseBuffer = null;

  function unlock() {
    if (!enabled) return;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try {
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.45;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      ctx = null; // audio is a nice-to-have; never let it break the game
    }
  }

  // Only flips the switch: the AudioContext itself is created by unlock() on a user gesture.
  function setEnabled(on) {
    enabled = !!on;
    if (!enabled && ctx && ctx.state === 'running') ctx.suspend();
    if (enabled && ctx && ctx.state === 'suspended') ctx.resume();
  }

  /** Called when the app is hidden or paused by Android. */
  function suspend() {
    if (ctx && ctx.state === 'running') ctx.suspend();
  }

  function resume() {
    if (enabled && ctx && ctx.state === 'suspended') ctx.resume();
  }

  function ready() {
    return enabled && ctx && ctx.state === 'running';
  }

  function tone(freq, start, dur, type, vol, slideTo) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol || 0.3, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function noise(start, dur, vol, freq) {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(start);
    src.stop(start + dur);
  }

  const SOUNDS = {
    eat: (t) => { tone(520, t, 0.08, 'square', 0.18, 880); },
    snack: (t) => { tone(700, t, 0.06, 'triangle', 0.2, 1000); },
    bonus: (t) => { tone(660, t, 0.08, 'square', 0.18); tone(990, t + 0.08, 0.12, 'square', 0.18); },
    gold: (t) => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.06, 0.12, 'triangle', 0.22)); },
    power: (t) => { [440, 554, 659, 880].forEach((f, i) => tone(f, t + i * 0.05, 0.1, 'square', 0.15)); },
    shield: (t) => { noise(t, 0.25, 0.35, 900); tone(220, t, 0.25, 'sawtooth', 0.15, 110); },
    die: (t) => { tone(440, t, 0.5, 'sawtooth', 0.22, 70); noise(t, 0.3, 0.2, 600); },
    win: (t) => { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, 0.2, 'square', 0.2)); tone(1047, t + 0.44, 0.45, 'triangle', 0.2); },
    click: (t) => { tone(900, t, 0.03, 'square', 0.08); },
    tick: (t) => { tone(1200, t, 0.03, 'sine', 0.12); },
    squeak: (t) => { tone(1400, t, 0.07, 'sine', 0.15, 2000); tone(1700, t + 0.09, 0.06, 'sine', 0.12, 2300); },
    escape: (t) => { tone(600, t, 0.12, 'triangle', 0.1, 300); },
  };

  function play(name) {
    if (!ready() || !SOUNDS[name]) return;
    try {
      SOUNDS[name](ctx.currentTime + 0.005);
    } catch (e) { /* ignore */ }
  }

  MPS.Audio = { unlock: unlock, setEnabled: setEnabled, suspend: suspend, resume: resume, play: play };
})(typeof window !== 'undefined' ? window : globalThis);
