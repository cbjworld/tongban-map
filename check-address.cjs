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
    await page.goto(base);
    await page.waitForFunction(() => viewerLayers);
    await page.locator('#addressForm button[type=submit]').click();
    assert.match(await page.locator('#addressStatus').textContent(), /먼저/);
    await page.evaluate(() => {
      const rings = [[[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]]];
      renderViewer({ head: { UNIT_TYPE: 'tong' }, shapes: { 1: { rings, name: '', banShapes: { 2: { rings } } } } }, null, '시험 지도');
      const point = turf.point([127.005,37.005]);
      if (locateAddress(point, viewerData) !== '1통 2반') throw new Error('Inside classification failed');
      if (!locateAddress(turf.point([127,37.005]), viewerData).includes('확인 필요')) throw new Error('Edge classification failed');
      if (!locateAddress(turf.point([128,37]), viewerData).includes('없음')) throw new Error('Outside classification failed');
      viewerData.shapes[3] = viewerData.shapes[1];
      if (!locateAddress(point, viewerData).includes('확인 필요')) throw new Error('Overlap classification failed');
      delete viewerData.shapes[3];
      viewerData.head.UNIT_TYPE = 'ri';
      if (!locateAddress(point, viewerData).startsWith('1리')) throw new Error('Ri label failed');
      viewerData.head.UNIT_TYPE = 'tong';
    });
    let scenario = 'ok';
    await page.route('https://api.vworld.kr/req/address?**', async route => {
      const url = new URL(route.request().url());
      assert.equal(url.searchParams.get('domain'), base);
      assert.equal(url.searchParams.get('type'), 'ROAD');
      const callback = url.searchParams.get('callback');
      assert.match(callback, /^__tongbanAddress\d+$/);
      let response = { status: 'OK', result: { point: { x: '127.005', y: '37.005' } } };
      if (scenario === 'empty') response = { status: 'NOT_FOUND' };
      if (scenario.startsWith('error:')) response = { status: 'ERROR', error: { code: scenario.slice(6), text: 'secret-do-not-display' } };
      if (scenario === 'invalid') response.result.point.x = 'NaN';
      if (scenario === 'slow') await new Promise(resolve => setTimeout(resolve, 400));
      await route.fulfill({ contentType: 'application/javascript', body: callback + '(' + JSON.stringify({ response }) + ')' }).catch(() => {});
    });
    await page.locator('#addressForm details summary').click();
    await page.locator('#addressKey').fill('test-only-key');
    await page.locator('#addressQuery').fill('<img src=x onerror=alert(1)>');
    await page.locator('#addressQuery').press('Enter');
    await page.waitForFunction(() => addressMarker);
    assert.match(await page.locator('#addressStatus').textContent(), /1통 2반/);
    assert.equal(await page.locator('.leaflet-popup-content img').count(), 0);
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('test-only-key')), false);
    for (const name of ['empty', 'invalid']) {
      scenario = name;
      await page.locator('#addressQuery').press('Enter');
      await page.waitForFunction(() => !addressCancel);
      assert.match(await page.locator('#addressStatus').textContent(), name === 'empty' ? /찾지 못/ : /올바르지/);
      assert.equal(await page.evaluate(() => addressMarker), null);
    }
    for (const [code, expected] of [['INVALID_KEY', /키 전체/], ['INCORRECT_KEY', /현재 사이트:/], ['UNAVAILABLE_KEY', /활용 권한/], ['OVER_REQUEST_LIMIT', /한도/], ['UNKNOWN', /활용|권한/]]) {
      scenario = 'error:' + code;
      await page.locator('#addressQuery').press('Enter');
      await page.waitForFunction(() => !addressCancel);
      const message = await page.locator('#addressStatus').textContent();
      assert.match(message, expected);
      assert.ok(!message.includes('secret-do-not-display'));
      if (code === 'INCORRECT_KEY') assert.ok(message.includes(base));
    }
    scenario = 'slow';
    await page.locator('#addressQuery').press('Enter');
    await page.evaluate(() => renderViewer(null, null, '다른 지도'));
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => addressMarker), null);
    await page.locator('#addressClear').click();
    assert.equal(await page.locator('#addressKey').inputValue(), '');
    assert.equal(await page.locator('script[src*="req/address"]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS address classification, edges/overlap/ri, JSONP, Enter, XSS, invalid/empty, stale cancellation, key cleanup');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
