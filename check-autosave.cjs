const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000/';
async function checkRestart() {
  const parent = path.resolve(os.tmpdir());
  const profile = await fs.mkdtemp(path.join(parent, 'tongban-restart-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { channel: 'msedge', headless: true });
    await context.route('**://tile.openstreetmap.org/**', route => route.abort());
    const editor = await context.newPage();
    await editor.goto(base + 'editor.html');
    await editor.waitForFunction(() => workReady);
    await editor.evaluate(() => {
      tongShapes = { 1: { rings: [[[127,37],[127.001,37],[127,37.001],[127,37]]], bans: [], banShapes: {}, name: '재시작 복구' } };
      renderAll();
      if (!saveLocalWork()) throw new Error('Save failed');
    });
    await context.close();
    context = await chromium.launchPersistentContext(profile, { channel: 'msedge', headless: true });
    await context.route('**://tile.openstreetmap.org/**', route => route.abort());
    const viewer = await context.newPage();
    await viewer.goto(base);
    await viewer.waitForFunction(() => viewerData);
    assert.equal(await viewer.evaluate(() => viewerData.shapes[1].name), '재시작 복구');
    console.log('PASS browser process restart restores saved map in viewer');
  } finally {
    if (context) await context.close();
    assert.equal(path.dirname(path.resolve(profile)), parent);
    assert.ok(path.basename(profile).startsWith('tongban-restart-'));
    await fs.rm(profile, { recursive: true, force: true });
  }
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    await context.route('**://tile.openstreetmap.org/**', route => route.abort());
    const editor = await context.newPage();
    const errors = [];
    editor.on('pageerror', error => errors.push(error.message));
    await editor.goto(base + 'editor.html');
    await editor.waitForFunction(() => workReady);
    const code = await editor.evaluate(() => {
      tongShapes = { 1: { rings: [[[127,37],[127.001,37],[127,37.001],[127,37]]], bans: [], banShapes: {}, name: '내 작업' } };
      renderAll();
      setMode('tong'); startDrawing();
      drawPoints = [[127,37],[127.001,37]];
      refreshDrawPreview();
      return activeRegion.code;
    });
    await editor.waitForFunction(() => document.getElementById('workStatus').textContent === '이 브라우저에 저장됨');
    await editor.reload();
    await editor.waitForFunction(() => workReady);
    assert.deepEqual(await editor.evaluate(() => [tongShapes[1].name, isDrawing, drawPoints.length]), ['내 작업',true,2]);
    const viewer = await context.newPage();
    await viewer.goto(base);
    await viewer.waitForFunction(() => viewerData);
    assert.equal(await viewer.evaluate(() => viewerData.shapes[1].name), '내 작업');
    await editor.evaluate(() => { cancelDrawing(); tongShapes = {}; renderAll(); });
    await viewer.waitForFunction(() => viewerData && Object.keys(viewerData.shapes).length === 0);
    await editor.reload();
    await editor.waitForFunction(() => workReady);
    assert.equal(await editor.evaluate(() => Object.keys(tongShapes).length), 0);
    const otherCode = await editor.evaluate(async () => {
      const next = regionIndex.find(row => row.code !== activeRegion.code);
      await loadRegion(next.code);
      tongShapes = { 2: { rings: [[[127,37],[127.001,37],[127,37.001],[127,37]]], bans: [], banShapes: {}, name: '다른 지역' } };
      renderAll(); saveLocalWork();
      return next.code;
    });
    await editor.evaluate(code => loadRegion(code), code);
    assert.equal(await editor.evaluate(() => Object.keys(tongShapes).length), 0);
    await editor.evaluate(code => loadRegion(code), otherCode);
    assert.equal(await editor.evaluate(() => tongShapes[2].name), '다른 지역');
    const second = await context.newPage();
    await second.goto(base + 'editor.html');
    await second.waitForFunction(() => workReady);
    await editor.evaluate(() => { tongShapes[2].name = '먼저 저장'; saveLocalWork(); });
    assert.equal(await second.evaluate(() => { tongShapes[2].name = '덮어쓰기'; return saveLocalWork(); }), false);
    assert.equal(await editor.evaluate(() => readLocalWork(activeRegion.code).value.parsed.shapes[2].name), '먼저 저장');
    assert.equal(await editor.evaluate(() => {
      const previous = localStorage.getItem(workPrefix + activeRegion.code);
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
      tongShapes[2].name = '용량초과';
      const failed = !saveLocalWork();
      Storage.prototype.setItem = original;
      return failed && previous === localStorage.getItem(workPrefix + activeRegion.code);
    }), true);
    await editor.evaluate(() => { workReady = false; localStorage.setItem(workPrefix + activeRegion.code, '{broken'); });
    await editor.reload();
    await editor.waitForFunction(() => workReady);
    assert.equal(await editor.evaluate(() => workBlocked && !saveLocalWork() && localStorage.getItem(workPrefix + activeRegion.code) === '{broken'), true);
    assert.deepEqual(errors, []);
    console.log('PASS autosave/recovery, unfinished drawing, viewer live updates, deletion, regional isolation, multi-tab conflict, quota and corrupt-data preservation');
  } finally { await browser.close(); }
  await checkRestart();
})().catch(error => { console.error(error); process.exitCode = 1; });
