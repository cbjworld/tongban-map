const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8000/';
const screenshotDir = path.join(__dirname, '.test-results');
fs.mkdirSync(screenshotDir, { recursive: true });

async function upload(page, selector, data, name = 'test.json') {
  await page.locator(selector).setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
    page.on('dialog', dialog => dialog.accept());
    await page.route('**://tile.openstreetmap.org/**', route => route.abort());
    await page.goto(baseUrl + 'editor.html');
    await page.waitForFunction(() => activeRegion && !document.getElementById('panel').inert);
    assert.equal(await page.locator('#parcelTools').getAttribute('open'), null);
    assert.equal(await page.locator('#editTools').getAttribute('open'), null);
    await page.locator('#parcelTools summary').click();
    assert.ok(await page.locator('#loadParcelsInput').count());
    const rural = await page.evaluate(() => regionIndex.find(row => /[읍면]$/.test(row.name)));
    await page.evaluate(code => loadRegion(code), rural.code);
    assert.equal(await page.locator('#unitTypeSelect').inputValue(), 'ri');
    assert.equal(await page.locator('#modeTongBtn').innerText(), '리 경계');
    const parcel = await page.evaluate(() => {
      const point = turf.pointOnFeature(boundaryFeature).geometry.coordinates;
      const ring = [[point[0],point[1]],[point[0]+0.0001,point[1]],[point[0]+0.0001,point[1]+0.0001],[point[0],point[1]]];
      return { type: 'Feature', properties: { JIBUN: '1-1', legal_name: '테스트리', PNU: '1111010100100010001' }, geometry: { type: 'Polygon', coordinates: [ring] } };
    });
    await upload(page, '#loadParcelsInput', { type: 'FeatureCollection', features: [parcel] });
    await page.waitForFunction(() => currentDongParcels() && currentDongParcels().length === 1);
    const label = await page.evaluate(() => currentDongParcels()[0].j);
    await page.fill('#parcelSearchInput', label);
    await page.press('#parcelSearchInput', 'Enter');
    await page.fill('#assignTongInput', '1');
    await page.fill('#assignBanInput', '2');
    await page.click('#assignParcelBtn');
    await page.waitForFunction(() => tongShapes[1] && tongShapes[1].banShapes[2]);
    await page.locator('input[aria-label="1리 이름"]').fill('<img src=x onerror=alert(1)> 테스트리');
    await page.locator('input[aria-label="1리 이름"]').press('Tab');
    assert.equal(await page.locator('.tong-label img').count(), 0);
    const saved = await page.evaluate(() => buildTongJsonObject());
    assert.equal(saved.head.UNIT_TYPE, 'ri');
    assert.equal(saved.head.REGION_CODE, rural.code);
    assert.ok(saved.head.BOUNDARY);
    assert.ok(saved.body[0].UNIT_NAME.includes('테스트리'));
    assert.equal(saved.body[0].COT_LEADER_NAME, undefined);
    await upload(page, '#loadTongInput', saved);
    await page.waitForFunction(() => document.getElementById('loadStatus').textContent.includes('불러옴'));
    const snapshot = await page.evaluate(() => JSON.stringify(tongShapes));
    const malformed = structuredClone(saved);
    malformed.body[0].COT_COORD_DATA = [[[[NaN, 0],[0,0],[0,0],[NaN,0]]]];
    await upload(page, '#loadTongInput', malformed);
    await page.waitForFunction(() => document.getElementById('loadStatus').textContent.includes('실패'));
    assert.equal(await page.evaluate(() => JSON.stringify(tongShapes)), snapshot);
    await upload(page, '#loadParcelsInput', { type: 'FeatureCollection', features: [{ ...parcel, geometry: { type: 'Point', coordinates: [0,0] } }] });
    await page.waitForFunction(() => document.getElementById('parcelImportStatus').textContent.includes('실패'));
    assert.equal(await page.evaluate(() => currentDongParcels().length), 1);
    await page.fill('#parcelSearchInput', '<img src=x onerror=alert(1)>');
    await page.click('#parcelFindBtn');
    assert.equal(await page.locator('#parcelFindStatus img').count(), 0);
    assert.ok(await page.evaluate(() => csvCell('=1+1').startsWith("'")));
    const holes = await page.evaluate(() => {
      const feature = turf.polygon([[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[1,2],[2,2],[2,1],[1,1]]]);
      const triangles = geometryToRings(feature.geometry);
      return Math.abs(triangles.reduce((area, ring) => area + turf.area(turf.polygon([ring])), 0) - turf.area(feature)) / turf.area(feature);
    });
    assert.ok(holes < 0.001);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { oMap.invalidateSize(); oMap.fitBounds(boundaryLine.getBounds(), { animate: false }); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotDir, 'editor-mobile.png') });
    const layout = await page.evaluate(() => {
      const panel = document.getElementById('panel').getBoundingClientRect();
      const map = document.getElementById('gisMap').getBoundingClientRect();
      return panel.right <= innerWidth && map.bottom <= panel.top + 1 && document.documentElement.scrollWidth <= innerWidth;
    });
    assert.ok(layout);
    const viewer = await browser.newPage({ viewport: { width: 390, height: 844 } });
    viewer.on('pageerror', error => errors.push(error.message));
    await viewer.route('**://tile.openstreetmap.org/**', route => route.abort());
    await viewer.goto(baseUrl + 'index.html');
    await viewer.waitForFunction(() => viewerMap && viewerLayers);
    assert.equal(await viewer.locator('#drawStartBtn').count(), 0);
    await upload(viewer, '#viewerFile', saved);
    await viewer.waitForFunction(() => viewerData && viewerData.head.UNIT_TYPE === 'ri');
    assert.ok((await viewer.locator('#viewerList').innerText()).includes('테스트리'));
    assert.equal(await viewer.locator('#viewerList img').count(), 0);
    await viewer.evaluate(() => { viewerMap.invalidateSize(); viewerMap.fitBounds(viewerLayers.getBounds(), { animate: false }); });
    await viewer.waitForTimeout(300);
    await viewer.screenshot({ path: path.join(screenshotDir, 'viewer-mobile.png') });
    await upload(viewer, '#viewerFile', { head: {}, body: [] });
    await viewer.waitForFunction(() => document.getElementById('viewerStatus').textContent.includes('실패'));
    assert.equal(await viewer.evaluate(() => viewerData.head.REGION_CODE), rural.code);
    assert.deepEqual(errors, []);
    assert.ok(requests.every(request => request.method === 'GET'));
    console.log('PASS: rural mode, parcel import/assignment, export/reimport, invalid-input rollback, XSS/CSV safety, hole preservation, mobile layout, read-only viewer; no POST requests');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
