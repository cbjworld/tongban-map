const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8000/';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const file of ['editor.html']) {
      const page = await browser.newPage();
      await page.route('**://tile.openstreetmap.org/**', route => route.abort());
      const errors = [];
      const requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (request.url().includes('/data/regions/')) requests.push(request.url()); });
      await page.goto(baseUrl + file);
      await page.waitForFunction(() => activeRegion && !document.getElementById('panel').inert);
      assert.equal(requests.length, 3);
      assert.equal(await page.locator('#ghLoadBtn').count(), 0);
      const original = await page.evaluate(() => activeRegion.code);
      const next = await page.evaluate(() => regionIndex.find(entry => entry.sido !== activeRegion.sido && !entry.parcels));
      await page.selectOption('#sidoSelect', next.sido);
      await page.selectOption('#sggSelect', next.sgg);
      await page.selectOption('#dongSelect', next.code);
      await page.waitForFunction(code => activeRegion.code === code && !document.getElementById('panel').inert, next.code);
      assert.equal(requests.length, 4);
      assert.equal(await page.evaluate(() => Object.keys(PARCELS_BY_DONG).length), 0);
      assert.equal(await page.evaluate(() => boundaryRing), null);
      assert.equal(await page.evaluate(() => boundaryFeature.properties.adm_cd2), next.code);
      const layerCount = await page.evaluate(() => Object.keys(oMap._layers).length);
      await page.evaluate(code => loadRegion(code), original);
      await page.evaluate(code => loadRegion(code), next.code);
      assert.equal(await page.evaluate(() => Object.keys(oMap._layers).length), layerCount);
      await page.evaluate(() => { tongShapes = { 1: { rings: [], bans: [] } }; });
      page.once('dialog', dialog => dialog.dismiss());
      await page.evaluate(code => loadRegion(code), original);
      assert.equal(await page.evaluate(() => activeRegion.code), next.code);
      assert.equal(await page.evaluate(() => Object.keys(tongShapes).length), 1);
      await page.evaluate(() => { tongShapes = {}; });
      await page.route('**/' + original + '.json', route => route.fulfill({ status: 500, body: 'failure' }));
      await page.evaluate(code => loadRegion(code), original);
      assert.equal(await page.evaluate(() => activeRegion.code), next.code);
      assert.equal(await page.locator('#dongSelect').inputValue(), next.code);
      assert.match(await page.locator('#drawStatus').innerText(), /불러오지 못했습니다/);
      await page.evaluate(() => {
        validateBoundary({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[[[126,37],[127,37],[127,38],[126,37]]], [[[128,37],[129,37],[129,38],[128,37]]]] } });
        let rejected = false;
        try { validateBoundary({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } }); } catch { rejected = true; }
        if (!rejected) throw Error('Invalid geometry accepted');
      });
      assert.deepEqual(errors, []);
      console.log('PASS', file, 'lazy loading, switching, layer disposal, cancel, failure rollback, geometry validation');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
