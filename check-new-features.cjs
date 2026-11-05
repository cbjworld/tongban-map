const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

function storedZipEntries(bytes) {
  const files = {};
  let pos = 0;
  while (bytes.readUInt32LE(pos) === 0x04034b50) {
    const size = bytes.readUInt32LE(pos + 18), nameSize = bytes.readUInt16LE(pos + 26), extra = bytes.readUInt16LE(pos + 28);
    const name = bytes.subarray(pos + 30, pos + 30 + nameSize).toString('utf8');
    const start = pos + 30 + nameSize + extra;
    files[name] = bytes.subarray(start, start + size);
    pos = start + size;
  }
  return files;
}

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
    const filename = path.join(__dirname, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!filename.startsWith(__dirname + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return route.abort();
    const ext = path.extname(filename);
    return route.fulfill({ path: filename, contentType: ({ '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' })[ext] || 'text/plain' });
  });
  try {
    await page.goto('http://test.local/editor.html');
    await page.waitForFunction(() => workReady);
    const fixture = await page.evaluate(() => {
      const ring = [[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]];
      const smaller = [[127,37],[127.005,37],[127.005,37.01],[127,37.01],[127,37]];
      tongShapes = { 1: { rings:[ring], bans:[], banShapes:{}, name:'원래 지도' }, 2: { rings:[ring], bans:[], banShapes:{}, name:'' } };
      boundaryFeature = turf.polygon([smaller]); boundaryRing = null; renderAll(); saveLocalWork();
      const data = buildTongJsonObject();
      const next = regionIndex.find(row => row.code !== activeRegion.code);
      const other = structuredClone(data); other.head.REGION_CODE = next.code; other.head.DONG_NAME = next.fullName;
      other.body[0].UNIT_NAME = '두 번째 지역';
      const draft = { version:1, data:other, draft:{ mode:'tong', points:[[127,37],[127.001,37]], tong:'3', parent:'', ban:'' } };
      localStorage.setItem(workPrefix + next.code, JSON.stringify(draft));
      localStorage.setItem(workPrefix + 'versions:' + next.code, '[]');
      return { current:activeRegion.code, next:next.code, data };
    });
    await page.locator('#checkGeometry').click();
    const headings = await page.locator('#geometryResults summary').allTextContents();
    assert.ok(headings.some(text => /미지정 \d+곳/.test(text)));
    assert.ok(headings.some(text => /겹침 \d+곳/.test(text)));
    assert.ok(headings.some(text => /경계 이탈 \d+곳/.test(text)));
    await page.locator('#fileTools').evaluate(el => { el.open = true; });
    const changed = structuredClone(fixture.data); changed.body[0].UNIT_NAME = '가져온 지도';
    const upload = async (selector, obj) => page.locator(selector).setInputFiles({ name:'map.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(obj)) });
    await upload('#loadTongInput', changed);
    await page.locator('#editorPreview').waitFor({state:'visible'});
    assert.match(await page.locator('#editorPreviewText').textContent(), /통 2개/);
    assert.equal(await page.evaluate(() => tongShapes[1].name), '원래 지도');
    await page.locator('#editorCancel').click();
    assert.equal(await page.evaluate(() => tongShapes[1].name), '원래 지도');
    await upload('#loadTongInput', changed);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#editorApply').click();
    assert.equal(await page.evaluate(() => tongShapes[1].name), '가져온 지도');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportAllBtn').click();
    const download = await downloadPromise;
    const zipPath = path.join(os.tmpdir(), 'tongban-all-' + process.pid + '.zip');
    await download.saveAs(zipPath);
    let entries;
    try {
      const check = spawnSync('python', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None', zipPath], {encoding:'utf8'});
      assert.equal(check.status, 0, check.stderr);
      entries = storedZipEntries(fs.readFileSync(zipPath));
    } finally { fs.unlinkSync(zipPath); }
    assert.ok(entries['README.txt']);
    assert.ok(entries['maps/' + fixture.current + '.json']);
    assert.ok(entries['maps/' + fixture.next + '.json']);
    assert.ok(entries['drafts/' + fixture.next + '.json']);
    assert.equal(JSON.parse(entries['maps/' + fixture.current + '.json']).body[0].UNIT_NAME, '가져온 지도');
    await page.evaluate(code => localStorage.setItem(workPrefix + code, '{broken'), fixture.next);
    await page.locator('#exportAllBtn').click();
    assert.match(await page.locator('#workStatus').textContent(), /전체 백업 실패/);
    assert.equal(await page.evaluate(code => localStorage.getItem(workPrefix + code), fixture.next), '{broken');
    await page.evaluate(([code, raw]) => localStorage.setItem(workPrefix + code, raw), [fixture.next, entries['drafts/' + fixture.next + '.json'].toString('utf8')]);
    await page.evaluate(code => loadRegion(code), fixture.next);
    await page.waitForFunction(code => activeRegion.code === code && workReady, fixture.next);
    await page.locator('#fileTools').evaluate(el => { el.open = true; });
    await page.locator('#loadTongInput').setInputFiles({ name:'draft.json', mimeType:'application/json', buffer:entries['drafts/' + fixture.next + '.json'] });
    await page.locator('#editorPreview').waitFor({state:'visible'});
    assert.match(await page.locator('#editorPreviewText').textContent(), /작성 중인 경계 포함/);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#editorApply').click();
    assert.equal(await page.evaluate(() => isDrawing && drawPoints.length === 2 && tongShapes[1].name === '두 번째 지역'), true);
    await page.evaluate(() => { cancelDrawing(); localStorage.setItem(workPrefix + activeRegion.code, '{broken'); });
    await page.locator('#exportAllBtn').click();
    assert.match(await page.locator('#workStatus').textContent(), /다른 탭|백업 실패/);
    assert.equal(await page.evaluate(() => localStorage.getItem(workPrefix + activeRegion.code)), '{broken');

    await page.goto('http://test.local/index.html');
    await page.waitForFunction(() => viewerMap && viewerRegions.length);
    await upload('#viewerFile', fixture.data);
    await page.locator('#viewerPreview').waitFor({state:'visible'});
    assert.match(await page.locator('#viewerPreviewText').textContent(), /통 2개/);
    await page.locator('#viewerCancel').click();
    await upload('#viewerFile', fixture.data);
    await page.locator('#viewerApply').click();
    await page.waitForFunction(() => viewerData && Object.keys(viewerData.shapes).length === 2);
    const clicked = await page.evaluate(() => {
      const a = [[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]];
      const b = [[127.01,37],[127.02,37],[127.02,37.01],[127.01,37.01],[127.01,37]];
      renderViewer({head:{UNIT_TYPE:'tong'},shapes:{1:{rings:[a],name:'',banShapes:{1:{rings:[a]}}},2:{rings:[b],name:'',banShapes:{2:{rings:[b]}}}}},null,'시험');
      viewerMap.fire('click', {latlng:L.latLng(37.005,127.01)});
      const boundary = document.getElementById('viewerPointResult').textContent;
      viewerUnits[1].checkbox.checked = false;
      viewerMap.fire('click', {latlng:L.latLng(37.005,127.01)});
      const hidden = document.getElementById('viewerPointResult').textContent;
      viewerMap.fire('click', {latlng:L.latLng(38,128)});
      return {boundary, hidden, outside:document.getElementById('viewerPointResult').textContent};
    });
    assert.match(clicked.boundary, /1통 · 1반.*2통 · 2반/);
    assert.match(clicked.hidden, /1통 · 1반/);
    assert.doesNotMatch(clicked.hidden, /2통/);
    assert.match(clicked.outside, /구역이 없습니다/);
    assert.deepEqual(errors, []);
    console.log('PASS viewer click, multi-region backup and draft recovery, preview and grouped inspection');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
