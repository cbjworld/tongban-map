const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'unpkg.com') {
      const name = url.pathname.endsWith('.js') ? 'leaflet.js' : 'leaflet.css';
      return route.fulfill({ path: require.resolve('leaflet/dist/' + name), contentType: name.endsWith('.js') ? 'application/javascript' : 'text/css' });
    }
    if (url.hostname !== 'test.local') return route.abort();
    const filename = path.join(__dirname, decodeURIComponent(url.pathname));
    if (!filename.startsWith(__dirname + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return route.abort();
    const ext = path.extname(filename);
    await route.fulfill({ path: filename, contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' })[ext] || 'text/plain' });
  });
  try {
    await page.goto('http://test.local/editor.html');
    await page.waitForFunction(() => workReady);
    await page.evaluate(() => {
      const ring = [[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]];
      boundaryFeature = boundaryRing = null;
      tongShapes = { 1: { rings: [ring], bans: [], banShapes: {}, name: '' }, 2: { rings: [ring], bans: [], banShapes: {}, name: '' } };
      markEdit('경계 그리기'); renderAll();
    });
    assert.match(await page.locator('#shapeList').innerText(), /약 .*㎡/);
    assert.match(await page.locator('#historyList').textContent(), /경계 그리기/);
    await page.locator('#checkGeometry').click();
    await page.getByRole('button', { name: /1통 \/ 2통 겹침 위치 보기/ }).click();
    const center = await page.evaluate(() => oMap.getCenter());
    assert.ok(Math.abs(center.lng - 127.005) < .01 && Math.abs(center.lat - 37.005) < .01);
    const labelState = await page.evaluate(async () => {
      oMap.setView([37.005, 127.005], 16, { animate: false });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { points: tongLabels.map(label => label.getLatLng()), stored: tongShapes[1].labelPoint };
    });
    assert.notDeepEqual(labelState.points[0], labelState.points[1]);
    assert.equal(labelState.stored, undefined);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#shareBundleBtn').click();
    const download = await downloadPromise;
    const zipPath = path.join(os.tmpdir(), 'tongban-test-' + process.pid + '.zip');
    await download.saveAs(zipPath);
    try {
      const test = spawnSync('python', ['-c', 'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert set(z.namelist()) == {"tongban.json","README.txt"}; assert len(json.loads(z.read("tongban.json"))["body"]) == 2; assert "github.io" in z.read("README.txt").decode() ', zipPath], { encoding: 'utf8' });
      assert.equal(test.status, 0, test.stderr);
    } finally { fs.unlinkSync(zipPath); }
    await page.goto('http://test.local/index.html');
    await page.waitForFunction(() => viewerMap && viewerRegions.length);
    await page.evaluate(() => {
      const rings = [[[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]]];
      renderViewer({ head: { UNIT_TYPE: 'tong' }, shapes: { 1: { rings, name: '', banShapes: { 1: { rings } } } } }, null, '시험');
    });
    assert.match(await page.locator('#viewerList').innerText(), /약 .*㎡/);
    assert.match(await page.locator('#viewerList').innerText(), /1반 · 약/);
    assert.deepEqual(errors, []);
    console.log('PASS inspection navigation, history, label overlap, areas, and valid share ZIP');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
