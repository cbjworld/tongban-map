const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000/';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**://tile.openstreetmap.org/**', route => route.abort());
    await page.goto(base + 'editor.html');
    await page.waitForFunction(() => workReady);
    const feature = await page.evaluate(() => {
      const point = turf.pointOnFeature(boundaryFeature).geometry.coordinates;
      oMap.setView([point[1], point[0]], 18, { animate: false });
      return { type: 'Feature', properties: { pnu: '1117013100100010000', jibun: '1대', addr: '<img src=x onerror=alert(1)>' },
        geometry: { type: 'Polygon', coordinates: [[[point[0],point[1]],[point[0]+0.00001,point[1]],
          [point[0],point[1]+0.00001],[point[0],point[1]]]] } };
    });
    let scenario = 'ok';
    await page.route('https://api.vworld.kr/req/data?**', async route => {
      const url = new URL(route.request().url());
      requests.push(url);
      let response = { status: 'OK', page: { total: '2' }, result: { featureCollection: { type: 'FeatureCollection', features: [feature] } } };
      if (scenario === 'invalid') response = { status: 'ERROR', error: { code: 'INVALID_KEY', text: 'do not reflect credentials' } };
      if (scenario === 'empty') response = { status: 'NOT_FOUND' };
      if (scenario === 'huge') response.page.total = '11';
      if (scenario === 'bad') response.result.featureCollection.features = [{ ...feature, geometry: { type: 'Polygon', coordinates: [] } }];
      if (scenario === 'slow') await new Promise(resolve => setTimeout(resolve, 500));
      if (scenario === 'network') { await route.abort(); return; }
      const callback = url.searchParams.get('callback');
      assert.match(callback, /^__vworldParcel\d+$/);
      await route.fulfill({ contentType: 'application/javascript', body: scenario === 'missing' ? 'void 0;' : callback + '(' + JSON.stringify({ response }) + ');' }).catch(() => {});
    });
    await page.locator('#parcelTools summary').first().click();
    await page.locator('#onlineParcelTools summary').click();
    await page.locator('#vworldKey').fill('test-only-not-a-real-key');
    await page.locator('#vworldConnect').click();
    await page.waitForFunction(() => onlineParcelLayer && !onlineParcelController);
    assert.equal(await page.evaluate(() => onlineParcelLayer.getLayers().length), 1);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].searchParams.get('data'), 'LP_PA_CBND_BUBUN');
    assert.equal(requests[1].searchParams.get('page'), '2');
    assert.equal(requests[0].searchParams.get('domain'), base);
    assert.equal(await page.evaluate(() => {
      saveLocalWork();
      return JSON.stringify(localStorage).includes('test-only-not-a-real-key') || JSON.stringify(buildTongJsonObject()).includes('1117013100100010000');
    }), false);
    assert.equal(await page.evaluate(() => onlineParcelLayer.getLayers()[0].getTooltip().getContent().querySelector('img')), null);
    scenario = 'invalid';
    await page.locator('#vworldConnect').click();
    await page.waitForFunction(() => document.getElementById('vworldStatus').textContent.includes('인증키를 확인'));
    assert.equal(await page.evaluate(() => onlineParcelLayer), null);
    const diagnostics = await page.evaluate(() => ['INVALID_KEY', 'INCORRECT_KEY', 'UNAVAILABLE_KEY', 'OVER_REQUEST_LIMIT', 'INVALID_RANGE', 'UNKNOWN'].map(code => {
      try { parseOnlineParcelResponse({ response: { status: 'ERROR', error: { code, text: 'secret-do-not-display' } } }); }
      catch (error) { return error.message; }
    }));
    for (const [index, expected] of [/키 전체/, /현재 사이트:/, /활용 권한/, /한도/, /범위/, /활용 권한/].entries()) assert.match(diagnostics[index], expected);
    assert.ok(diagnostics[1].includes(base));
    assert.ok(diagnostics.every(message => !message.includes('secret-do-not-display')));
    scenario = 'huge';
    await page.locator('#vworldConnect').click();
    await page.waitForFunction(() => document.getElementById('vworldStatus').textContent.includes('너무 많'));
    scenario = 'bad';
    await page.locator('#vworldConnect').click();
    await page.waitForFunction(() => !onlineParcelController);
    assert.equal(await page.evaluate(() => onlineParcelLayer), null);
    scenario = 'empty';
    await page.locator('#vworldConnect').click();
    await page.waitForFunction(() => document.getElementById('vworldStatus').textContent.startsWith('0필지'));
    scenario = 'slow';
    await page.locator('#vworldConnect').click();
    await page.locator('#vworldDisconnect').click();
    await page.waitForTimeout(650);
    assert.equal(await page.evaluate(() => onlineParcelLayer === null && onlineParcelKey === ''), true);
    for (const failure of ['network', 'missing']) {
      scenario = failure;
      await page.locator('#vworldKey').fill('test-only-not-a-real-key');
      await page.locator('#vworldConnect').click();
      await page.waitForFunction(() => !onlineParcelController);
      assert.match(await page.locator('#vworldStatus').textContent(), failure === 'network' ? /연결 실패/ : /응답 형식 오류/);
      assert.equal(await page.locator('script[src*="api.vworld.kr"]').count(), 0);
    }
    await page.evaluate(() => oMap.setZoom(10, { animate: false }));
    const previous = requests.length;
    await page.locator('#vworldKey').fill('test-only-not-a-real-key');
    await page.locator('#vworldConnect').click();
    await page.waitForFunction(() => document.getElementById('vworldStatus').textContent.includes('확대'));
    assert.equal(requests.length, previous);
    await page.reload();
    assert.equal(await page.locator('#vworldKey').inputValue(), '');
    assert.deepEqual(errors, []);
    console.log('PASS mocked VWorld pagination/deduplication, validation, area guard, abort, XSS safety, key/data excluded from storage/export');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
