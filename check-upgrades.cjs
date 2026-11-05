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
    const topology = await page.evaluate(() => {
      const left = [[0,0],[1,0],[1,1],[0,1],[0,0]];
      const right = [[1,0],[2,0],[2,1],[1,1],[1,0]];
      const corner = [[1,1],[1.5,1.5],[1,2],[1,1]];
      const moved = moveSharedVertex(left, 2, [right, corner], [1.2,1]);
      const splitLeft = [[0,0],[1,0],[1,.5],[1,1],[0,1],[0,0]];
      const splitRight = [[1,0],[2,0],[2,1],[1,1],[1,0]];
      const split = moveSharedVertex(splitLeft, 2, [splitRight], [1.2,.5]);
      const before = JSON.stringify(left);
      const invalid = moveSharedVertex(left, 2, [right], [0,0]);
      return { moved, right, corner, split, splitRight, invalid, unchanged: before === JSON.stringify(left) };
    });
    assert.equal(topology.moved, true);
    assert.ok(topology.right.some(p => p[0] === 1.2 && p[1] === 1));
    assert.deepEqual(topology.corner[0], [1,1]);
    assert.equal(topology.split, true);
    assert.ok(topology.splitRight.some(p => p[0] === 1.2 && p[1] === .5));
    assert.equal(topology.invalid, false);
    assert.equal(topology.unchanged, true);
    const sharedEdit = await page.evaluate(() => {
      const left = [[127,37],[127.01,37],[127.01,37.005],[127.01,37.01],[127,37.01],[127,37]];
      const right = [[127.01,37],[127.02,37],[127.02,37.01],[127.01,37.01],[127.01,37]];
      boundaryFeature = boundaryRing = null;
      tongShapes = { 1: { rings: [left], bans: [], banShapes: {}, name: '' }, 2: { rings: [right], bans: [], banShapes: {}, name: '' } };
      renderAll();
      document.getElementById('editTargetSelect').value = 'tong:1'; startVertexEdit();
      const marker = editVertexMarkers.find(item => item.vertexIndex === 2).marker;
      marker.setLatLng([37.005,127.012]); marker.fire('dragend');
      const neighbor = tongShapes[2].rings.some(ring => ring.some(p => Math.abs(p[0] - 127.012) < 1e-9 && Math.abs(p[1] - 37.005) < 1e-9));
      const merged = turf.union(turf.featureCollection([turf.polygon([tongShapes[1].rings[0]]), turf.polygon([tongShapes[2].rings[0]])]));
      const original = turf.polygon([[[127,37],[127.02,37],[127.02,37.01],[127,37.01],[127,37]]]);
      const gap = turf.difference(turf.featureCollection([original, merged]));
      stopVertexEdit();
      return { neighbor, gapArea: gap ? turf.area(gap) : 0 };
    });
    assert.equal(sharedEdit.neighbor, true);
    assert.ok(sharedEdit.gapArea < 0.01);
    const sharedPoints = await page.evaluate(() => {
      const left = [[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]];
      const right = [[127.01,37],[127.02,37],[127.02,37.01],[127.01,37.01],[127.01,37]];
      tongShapes = { 1: { rings: [left], bans: [], banShapes: {}, name: '' }, 2: { rings: [right], bans: [], banShapes: {}, name: '' } };
      renderAll(); document.getElementById('editTargetSelect').value = 'tong:1'; startVertexEdit();
      editMidpointMarkers.find(item => item.afterIndex === 1).marker.fire('click');
      const has = shape => shape.rings.some(ring => ring.some(p => Math.abs(p[0] - 127.01) < 1e-9 && Math.abs(p[1] - 37.005) < 1e-9));
      const added = has(tongShapes[1]) && has(tongShapes[2]);
      const idx = tongShapes[1].rings[0].findIndex(p => Math.abs(p[0] - 127.01) < 1e-9 && Math.abs(p[1] - 37.005) < 1e-9);
      selectedVertex = { partIndex: 0, vertexIndex: idx }; deleteSelectedPoint();
      const removed = !has(tongShapes[1]) && !has(tongShapes[2]);
      stopVertexEdit();
      return { added, removed };
    });
    assert.deepEqual(sharedPoints, { added: true, removed: true });
    const bentDelete = await page.evaluate(() => {
      const left = [[127,37],[127.01,37],[127.012,37.005],[127.01,37.01],[127,37.01],[127,37]];
      const right = [[127.01,37],[127.02,37],[127.02,37.01],[127.01,37.01],[127.012,37.005],[127.01,37]];
      const result = deleteSharedVertex(left, 2, [right]);
      return { result, leftHasPoint: left.some(p => p[0] === 127.012), rightHasPoint: right.some(p => p[0] === 127.012) };
    });
    assert.deepEqual(bentDelete, { result: true, leftHasPoint: false, rightHasPoint: false });
    const unsafeDelete = await page.evaluate(() => {
      const triangle = [[0,0],[1,0],[1,1],[0,0]], neighbor = [[1,0],[2,0],[2,1],[1,1],[1,0]];
      const before = JSON.stringify([triangle, neighbor]);
      return { result: deleteSharedVertex(triangle, 1, [neighbor]), unchanged: before === JSON.stringify([triangle, neighbor]) };
    });
    assert.deepEqual(unsafeDelete, { result: false, unchanged: true });
    const drawing = await page.evaluate(() => {
      setMode('boundary'); startDrawing(); document.getElementById('snapEnabled').checked = false;
      [[127,37],[127.01,37.01],[127,37.01]].forEach(p => mapClickWhileDrawing({latlng: L.latLng(p[1],p[0])}));
      mapClickWhileDrawing({ latlng: L.latLng(37.003, 127.01) });
      const rejected = drawPoints.length === 3 && /교차/.test(document.getElementById('drawStatus').textContent);
      drawPoints = [[127,37],[127.01,37.01],[127.002,37.01],[127.01,37.003]];
      finishDrawing();
      const finishBlocked = isDrawing && /교차/.test(document.getElementById('drawStatus').textContent);
      const finishStatus = document.getElementById('drawStatus').textContent;
      cancelDrawing(); startDrawing();
      [[127,37],[127.01,37],[127.02,37]].forEach(p => mapClickWhileDrawing({latlng: L.latLng(p[1],p[0])}));
      const noArea = /면적이 없는/.test(document.getElementById('drawStatus').textContent);
      cancelDrawing(); document.getElementById('snapEnabled').checked = true;
      return { rejected, finishBlocked, finishStatus, noArea };
    });
    assert.equal(drawing.rejected, true);
    assert.equal(drawing.finishBlocked, true, drawing.finishStatus);
    assert.equal(drawing.noArea, true);
    const gapParts = await page.evaluate(() => {
      const outer = [[127,37],[127.03,37],[127.03,37.01],[127,37.01],[127,37]];
      const band = [[127.01,37],[127.02,37],[127.02,37.01],[127.01,37.01],[127.01,37]];
      boundaryFeature = boundaryRing = null;
      const locations = [];
      inspectMapGeometry({ 1: { rings: [outer], banShapes: { 1: { rings: [band] } } } }, locations);
      return locations.filter(item => item.gap).map(item => item.label);
    });
    assert.deepEqual(gapParts, ['1통 반 미지정 영역 1', '1통 반 미지정 영역 2']);
    await page.setViewportSize({ width: 390, height: 844 });
    const mapHeight = await page.locator('#gisMap').evaluate(el => el.clientHeight);
    await page.locator('#panelToggle').click();
    assert.ok(await page.locator('#gisMap').evaluate(el => el.clientHeight) > mapHeight);
    await page.locator('#panelToggle').click();
    await page.setViewportSize({ width: 1280, height: 800 });
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
    const checks = await page.evaluate(() => {
      const ring = [[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]];
      const small = [[127,37],[127.005,37],[127.005,37.01],[127,37.01],[127,37]];
      boundaryFeature = turf.polygon([small]); boundaryRing = null;
      const locations = [];
      inspectMapGeometry({ 1: { rings: [ring], banShapes: {} } }, locations);
      return locations.map(item => item.label);
    });
    assert.ok(checks.includes('1통 지역 외곽선 밖'));
    assert.ok(checks.includes('1통 반 미지정 영역'));
    await page.locator('#checkGeometry').click();
    await page.locator('#checkGeometry').click();
    await page.getByRole('button', { name: '1통 반 미지정 영역 숨기기' }).click();
    assert.equal(await page.getByRole('button', { name: '1통 반 미지정 영역 위치 보기' }).isVisible(), false);
    await page.getByRole('button', { name: '1통 반 미지정 영역 다시 표시' }).click();
    await page.getByRole('button', { name: '1통 반 미지정 영역 반 그리기' }).click();
    assert.equal(await page.evaluate(() => mode), 'ban');
    assert.equal(await page.locator('#banParentTongSelect').inputValue(), '1');
    await page.evaluate(() => { boundaryFeature = null; saveLocalWork(); });
    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(() => { const data = buildTongJsonObject(); data.body[0].UNIT_NAME = '교체된 작업'; applyTongJsonData(data, 'test.json'); saveLocalWork(); });
    assert.equal(await page.evaluate(() => tongShapes[1].name), '교체된 작업');
    await page.reload();
    await page.waitForFunction(() => workReady);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#fileTools').evaluate(el => { el.open = true; });
    await page.locator('#restoreImport').click();
    assert.equal(await page.evaluate(() => tongShapes[1].name), '');
    await page.evaluate(() => {
      tongShapes[1].name = '첫 번째'; renderAll(); saveLocalWork(); saveImportRecovery();
      tongShapes[1].name = '두 번째'; renderAll(); saveLocalWork(); saveImportRecovery();
      tongShapes[1].name = '현재'; renderAll(); saveLocalWork();
    });
    await page.reload(); await page.waitForFunction(() => workReady);
    const versionIndex = await page.evaluate(() => workVersions().findIndex(entry => JSON.parse(entry.raw).data.body[0].UNIT_NAME === '첫 번째'));
    assert.ok(versionIndex >= 0);
    await page.locator('#fileTools').evaluate(el => { el.open = true; });
    await page.locator('#restoreVersionSelect').selectOption(String(versionIndex));
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#restoreVersion').click();
    assert.equal(await page.evaluate(() => tongShapes[1].name), '첫 번째');
    await page.evaluate(() => { tongShapes[1].name = ''; renderAll(); saveLocalWork(); });
    const snapped = await page.evaluate(() => {
      oMap.setView([37.005,127.005], 16, { animate: false });
      const vertex = L.latLng(37,127), nearby = oMap.containerPointToLatLng(oMap.latLngToContainerPoint(vertex).add([2,2]));
      return snapDrawingPoint(nearby);
    });
    assert.ok(Math.abs(snapped[0] - 127) < .000001 && Math.abs(snapped[1] - 37) < .000001);
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
      renderViewer({ head: { UNIT_TYPE: 'tong' }, shapes: { 1: { rings, name: '가람', banShapes: { 1: { rings } } }, 2: { rings, name: '누리', banShapes: {} } } }, null, '시험');
    });
    assert.match(await page.locator('#viewerList').innerText(), /약 .*㎡/);
    assert.match(await page.locator('#viewerList').innerText(), /1반 · 약/);
    await page.locator('#viewerSearch').fill('누리');
    assert.equal(await page.locator('.viewerGroup:visible').count(), 1);
    await page.getByRole('button', { name: '2통 · 누리' }).click();
    assert.match(await page.locator('#viewerSearchStatus').textContent(), /1개/);
    await page.locator('#viewerSearch').fill('없음');
    assert.match(await page.locator('#viewerSearchStatus').textContent(), /0개/);
    assert.deepEqual(errors, []);
    console.log('PASS shared boundary add/delete, drawing validation, gap controls, version recovery, viewer search and share ZIP');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
