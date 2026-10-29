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
    page.on('request', request => { if (/vworld\.kr/.test(request.url())) requests.push(request.url()); });
    await page.route('**://tile.openstreetmap.org/**', route => route.abort());
    await page.goto(base);
    await page.waitForFunction(() => viewerLayers);
    assert.equal(await page.locator('#addressForm, #batchTools, input[type=password]').count(), 0);
    await page.evaluate(() => {
      const rings = [[[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]]];
      renderViewer({ head: { UNIT_TYPE: 'tong' }, shapes: { 1: { rings, name: '', banShapes: { 2: { rings } } } } }, null, '인쇄 시험 지도');
    });
    const toggle = page.getByRole('checkbox', { name: '1통 표시' });
    await toggle.uncheck();
    assert.equal(await page.evaluate(() => viewerLayers.getLayers().length), 0);
    await toggle.check();
    assert.equal(await page.evaluate(() => viewerLayers.getLayers().length), 1);
    const original = await page.evaluate(() => ({ zoom: viewerMap.getZoom(), lat: viewerMap.getCenter().lat }));
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    assert.equal(await page.locator('#panel').isVisible(), false);
    assert.equal(await page.locator('#printHeading').isVisible(), true);
    assert.equal(await page.locator('#printTitle').textContent(), '인쇄 시험 지도');
    assert.equal(await page.locator('.leaflet-control-attribution').isVisible(), true);
    assert.ok((await page.locator('.leaflet-tooltip').allTextContents()).some(text => text.includes('2반')));
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    assert.equal(await page.evaluate(() => viewerMap.getZoom()), original.zoom);
    assert.ok(Math.abs(await page.evaluate(() => viewerMap.getCenter().lat) - original.lat) < 0.00001);
    assert.deepEqual(errors, []);
    assert.equal(requests.length, 0);
    console.log('PASS key-free viewer, no VWorld requests, print labels/attribution/PDF and map restoration');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
