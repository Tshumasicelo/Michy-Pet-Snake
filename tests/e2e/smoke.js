/*
 * Browser smoke test for Michy's Pet Snake, using Playwright's Chromium.
 *
 *   npm run test:e2e
 *
 * Checks, at phone, landscape, tablet and desktop sizes: no script errors, no
 * network requests leaving the game's own files, intro and skip, menus fit the
 * screen, steering, pause, the Android back-button contract, saving across a
 * reload, and a full win of the final level through the normal game flow.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { serve } = require('./server');

const WEB = path.join(__dirname, '..', '..', 'web');
const BOT = fs.readFileSync(path.join(__dirname, '..', 'helpers', 'bot.js'), 'utf8');
const SHOTS = process.env.SHOTS_DIR || '';

const VIEWPORTS = [
  { name: 'small phone', width: 360, height: 640, touch: true },
  { name: 'tall phone', width: 412, height: 915, touch: true },
  { name: 'phone landscape', width: 800, height: 360, touch: true },
  { name: 'desktop', width: 1280, height: 800, touch: false },
];

let failures = 0;
function check(ok, label) {
  console.log((ok ? '  ok   ' : '  FAIL ') + label);
  if (!ok) failures++;
}

async function openPage(browser, url, vp, save) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, hasTouch: vp.touch, isMobile: vp.touch });
  if (save) await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('michys-pet-snake.save', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(save));
  const page = await ctx.newPage();
  const problems = [];
  const external = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.type() + ': ' + m.text()); });
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' || u.protocol === 'data:') return route.continue();
    external.push(u.href);
    return route.abort();
  });
  await page.goto(url);
  await page.addScriptTag({ content: 'window.module = {}; ' + BOT + '; window.Bot = module.exports;' });
  return { ctx, page, problems, external };
}

const state = (page) => page.evaluate(() => {
  const s = MPS.debug.state;
  return { screen: s.screen, mode: s.mode, level: s.level, head: s.game && s.game.snake[0], score: s.game && s.game.score };
});

async function fitsScreen(page) {
  return page.evaluate(() => {
    const W = innerWidth;
    const H = innerHeight;
    const visible = [...document.querySelectorAll('.screen:not([hidden]) button, .screen:not([hidden]) canvas, .overlay:not([hidden]) button')]
      .filter((e) => e.offsetParent !== null && !e.closest('.level-grid') && !e.closest('.page-body'));
    const bad = visible.filter((e) => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > W + 1 || r.bottom > H + 1 || r.top < -1; });
    const small = visible.filter((e) => e.tagName === 'BUTTON' && !e.classList.contains('pad-btn') && e.getBoundingClientRect().height < 44);
    return { overflow: document.documentElement.scrollWidth > W, offscreen: bad.map((e) => e.className || e.id), small: small.map((e) => e.textContent.trim()) };
  });
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}

async function run() {
  const server = await serve(WEB);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    console.log(`\n${vp.name} (${vp.width}x${vp.height})`);
    const { ctx, page, problems, external } = await openPage(browser, url, vp);
    const slug = vp.name.replace(/\s+/g, '-');

    check((await state(page)).screen === 'intro', 'first launch plays the intro');
    await page.waitForTimeout(600);
    await shot(page, slug + '-intro');
    await page.click('#intro-skip');
    await page.waitForTimeout(500);
    check((await state(page)).screen === 'menu', 'Skip goes straight to the main menu');
    let fit = await fitsScreen(page);
    check(!fit.overflow && !fit.offscreen.length, 'menu fits the screen ' + JSON.stringify(fit.offscreen));
    check(!fit.small.length, 'menu buttons are at least 44px tall ' + JSON.stringify(fit.small));
    await shot(page, slug + '-menu');

    await page.click('[data-action="continue"]');
    check((await state(page)).mode === 'ready', 'Play opens the level 1 briefing');
    fit = await fitsScreen(page);
    check(!fit.overflow && !fit.offscreen.length, 'briefing card fits ' + JSON.stringify(fit.offscreen));
    await page.keyboard.press('ArrowDown');
    const s0 = await state(page);
    await page.waitForTimeout(700);
    const s1 = await state(page);
    check(s1.mode === 'playing' && s1.head.y > s0.head.y, 'an arrow key starts the snake moving that way');
    fit = await fitsScreen(page);
    check(!fit.overflow && !fit.offscreen.length, 'game screen fits ' + JSON.stringify(fit.offscreen));
    const board = await page.evaluate(() => document.getElementById('board').getBoundingClientRect().width);
    check(board >= Math.min(vp.width, vp.height) * 0.6, `board uses the screen well (${Math.round(board)}px)`);
    if (vp.touch) {
      const padVisible = await page.isVisible('#pad');
      check(padVisible, 'touch devices show the direction pad');
      await page.locator('.pad-btn.right').dispatchEvent('pointerdown');
      await page.waitForTimeout(400);
      const s2 = await state(page);
      check(s2.head.x > s1.head.x, 'the on-screen pad steers');
      // A drag across the board (pointer events, as a finger swipe produces).
      const box = await page.locator('#board').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(450);
      const s3 = await state(page);
      check(s3.head.y < s2.head.y, 'swiping up on the board turns the snake up');
    } else {
      check(!(await page.isVisible('#pad')), 'desktop hides the touch pad');
    }
    await shot(page, slug + '-game');

    await page.click('#btn-pause');
    check((await state(page)).mode === 'paused', 'pause button pauses');
    const frozen = await state(page);
    await page.waitForTimeout(500);
    check(JSON.stringify((await state(page)).head) === JSON.stringify(frozen.head), 'nothing moves while paused');
    await shot(page, slug + '-pause');
    check(await page.evaluate(() => MPS.handleBack()) === true && (await state(page)).mode === 'playing', 'back button on the pause card resumes');
    check(await page.evaluate(() => MPS.handleBack()) === true && (await state(page)).mode === 'paused', 'back button while playing pauses');
    await page.evaluate(() => MPS.appPaused());
    check((await state(page)).mode === 'paused', 'app going to the background keeps the game paused');
    await page.click('[data-action="menu"]');
    check(await page.evaluate(() => MPS.handleBack()) === false, 'back button on the main menu lets Android close the app');

    check(!problems.length, 'no console errors or warnings ' + JSON.stringify(problems));
    check(!external.length, 'no requests outside the game files ' + JSON.stringify(external));
    await ctx.close();
  }

  // Save data survives a reload, and the intro is not repeated.
  console.log('\nsaving and the final level');
  {
    const save = { version: 1, unlocked: 12, introSeen: true, levels: {}, settings: { sound: false, controls: 'both', skin: 'sunset', reducedMotion: false } };
    for (let i = 1; i <= 11; i++) save.levels[i] = { best: 100, stars: 3, cleared: true };
    const { ctx, page, problems } = await openPage(browser, url, VIEWPORTS[1], save);
    check((await state(page)).screen === 'menu', 'returning players skip the intro');
    let won = false;
    for (let attempt = 0; attempt < 8 && !won; attempt++) {
      await page.evaluate(() => { document.querySelector('[data-action="levels"]') && MPS.debug.state.screen === 'menu' && document.querySelector('[data-action="levels"]').click(); });
      if ((await state(page)).screen !== 'levels') await page.evaluate(() => { while (MPS.debug.state.screen !== 'menu' && MPS.handleBack()); document.querySelector('[data-action="levels"]').click(); });
      await page.click('.level-card[data-level="12"]');
      await page.click('[data-action="go"]');
      const result = await page.evaluate(() => {
        const E = MPS.Engine;
        const choose = Bot.makeBot(E);
        for (let i = 0; i < 6000; i++) {
          const s = MPS.debug.state;
          if (s.mode !== 'playing') break;
          const d = choose(s.game);
          if (s.game.waiting || d !== s.game.dir) E.queueTurn(s.game, d);
          MPS.debug.tick();
        }
        return MPS.debug.state.game.won;
      });
      won = result;
      if (!won) {
        await page.waitForTimeout(900);
        await page.evaluate(() => MPS.handleBack());
      }
    }
    check(won, 'the final level can be won through the normal game flow');
    await page.waitForTimeout(1200);
    const card = await page.textContent('#overlay-card');
    check(/Master of the Wild!/.test(card), 'winning level 12 shows the campaign-complete screen');
    await shot(page, 'campaign-complete');
    await page.reload();
    const saved = await page.evaluate(() => MPS.debug.state.save);
    check(saved.campaignComplete && saved.levels[12] && saved.levels[12].cleared, 'campaign completion is saved across a reload');
    check(!!saved.achievements.master, 'the Master of the Wild trophy is saved');
    check(!problems.length, 'no console errors or warnings ' + JSON.stringify(problems));
    await ctx.close();
  }

  // Opening index.html straight from disk (no web server) still works.
  console.log('\nopening from a file');
  {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    await page.goto('file://' + path.join(WEB, 'index.html'));
    await page.waitForTimeout(300);
    check(await page.evaluate(() => !!(window.MPS && MPS.debug.state.screen)), 'the game boots from file://');
    check(!problems.length, 'no errors from file:// ' + JSON.stringify(problems));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall browser checks passed');
  process.exit(failures ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
