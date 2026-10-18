const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000/';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**://tile.openstreetmap.org/**', route => route.abort());
    await page.goto(base + 'editor.html');
    await page.waitForFunction(() => workReady);
    await page.evaluate(() => {
      tongShapes = {};
      resetEditHistory();
      tongShapes[1] = { rings: [[[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]]], bans: [], banShapes: {}, name: '원본' };
      renderAll();
    });
    await page.locator('#historyUndo').click();
    assert.equal(await page.evaluate(() => Object.keys(tongShapes).length), 0);
    await page.locator('#historyRedo').click();
    assert.equal(await page.evaluate(() => tongShapes[1].name), '원본');
    await page.evaluate(() => { delete tongShapes[1]; renderAll(); });
    await page.locator('#historyUndo').click();
    assert.equal(await page.evaluate(() => tongShapes[1].name), '원본');
    await page.evaluate(() => { tongShapes[1].name = '새 편집'; renderAll(); });
    assert.equal(await page.locator('#historyRedo').isDisabled(), true);
    await page.evaluate(() => { startDrawing(); });
    await page.locator('#historyUndo').click();
    assert.match(await page.locator('#editingStatus').textContent(), /그리기/);
    await page.evaluate(() => cancelDrawing());
    const results = await page.evaluate(() => {
      const ring = [[[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]]];
      const make = rings => ({ rings, bans: [], banShapes: {}, name: '' });
      const shapes = { 1: make(ring) };
      const clean = inspectMapGeometry(shapes);
      shapes[2] = make(ring);
      const overlap = inspectMapGeometry(shapes);
      delete shapes[2];
      shapes[1].banShapes[1] = make([[[128,37],[128.01,37],[128.01,37.01],[128,37]]]);
      const before = JSON.stringify(shapes);
      const outside = inspectMapGeometry(shapes);
      const unchanged = before === JSON.stringify(shapes);
      shapes[1].banShapes = { 1: make(ring), 2: make(ring) };
      const bans = inspectMapGeometry(shapes);
      shapes[2] = make([[[127,37],[127.01,37.01],[127.01,37],[127,37.01],[127,37]]]);
      return { clean, overlap, outside, unchanged, bans, invalid: inspectMapGeometry(shapes) };
    });
    assert.deepEqual(results.clean, []);
    assert.ok(results.overlap.some(value => value.includes('겹침')));
    assert.ok(results.outside.some(value => value.includes('상위 구역 밖')));
    assert.ok(results.bans.some(value => value.includes('1반 / 1통 2반 겹침')));
    assert.ok(results.invalid.some(value => value.includes('검사 실패')));
    assert.equal(results.unchanged, true);
    await page.evaluate(() => {
      for (let index = 0; index < 60; index++) { tongShapes[1].name = String(index); renderAll(); }
    });
    assert.ok(await page.evaluate(() => editHistory.length <= 50));
    await page.evaluate(() => localStorage.setItem(workPrefix + activeRegion.code, 'other-tab'));
    await page.locator('#historyUndo').click();
    assert.match(await page.locator('#editingStatus').textContent(), /다른 탭/);
    await page.evaluate(() => localStorage.setItem(workPrefix + activeRegion.code, workRaw));
    await page.evaluate(async () => { await loadRegion(regionIndex.find(entry => entry.code !== activeRegion.code).code); });
    assert.equal(await page.locator('#historyUndo').isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log('PASS undo/redo/deletion/branching/drawing guard/history cap/tab conflict/region isolation and read-only geometry checks');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
