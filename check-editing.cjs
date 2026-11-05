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
      const ring = [[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]];
      tongShapes = { 1: { rings: [ring], bans: [], banShapes: {}, name: '' }, 2: { rings: [ring], bans: [], banShapes: {}, name: '' } };
      renderAll();
      if (tongPolygons[0].options.fillColor === tongPolygons[1].options.fillColor) throw Error('Unit fills must differ');
      const firstLabel = tongLabels[0].getElement().querySelector('.tong-label');
      const secondLabel = tongLabels[1].getElement().querySelector('.tong-label');
      if (firstLabel.style.backgroundColor === secondLabel.style.backgroundColor) throw Error('Unit labels must differ');
      const expected = document.createElement('span'); expected.style.backgroundColor = unitColors(1).label;
      if (tongPolygons[0].options.fillColor !== unitColors(1).fill || firstLabel.style.backgroundColor !== expected.style.backgroundColor) throw Error('Unit colors inconsistent');
      if (tongPolygons[0].options.color !== tongPolygons[1].options.color) throw Error('Tong outline changed');
    });
    await page.evaluate(() => {
      const ring = [[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]];
      tongShapes = { 1: { rings: [ring], bans: [1], banShapes: { 1: { rings: [ring] } }, name: '' } };
      renderAll();
      if (Number(oMap.getPane(tongPolygons[0].options.pane).style.zIndex) <= Number(oMap.getPane(banPolygons[0].options.pane).style.zIndex)) throw Error('Tong boundary is not above ban');
    });
    await page.evaluate(() => {
      const ring = [[127,37],[127.01,37],[127.01,37.01],[127,37.01],[127,37]];
      tongShapes = { 1: { rings: [ring], bans: [], banShapes: {}, name: '' } };
      renderAll();
    });
    await page.locator('#moveLabels').click();
    assert.equal(await page.evaluate(() => tongLabels[0].options.draggable), true);
    await page.evaluate(() => { tongLabels[0].setLatLng([37.005,127.005]); tongLabels[0].fire('dragend'); });
    assert.deepEqual(await page.evaluate(() => tongShapes[1].labelPoint), [127.005,37.005]);
    assert.deepEqual(await page.evaluate(() => parseMapData(buildTongJsonObject()).shapes[1].labelPoint), [127.005,37.005]);
    assert.equal(await page.evaluate(() => {
      const data = buildTongJsonObject();
      data.body[0].LABEL_COORD = [Infinity, 37];
      try { parseMapData(data); return false; } catch { return true; }
    }), true);
    await page.evaluate(() => { tongLabels[0].setLatLng([38,128]); tongLabels[0].fire('dragend'); });
    assert.deepEqual(await page.evaluate(() => tongShapes[1].labelPoint), [127.005,37.005]);
    await page.locator('#moveLabels').click();
    await page.evaluate(() => {
      const outer = [[127,37],[127.02,37],[127.02,37.02],[127,37.02],[127,37]];
      const savedBoundary = boundaryFeature;
      boundaryFeature = turf.polygon([outer]);
      const locations = [];
      const issues = inspectMapGeometry(tongShapes, locations);
      boundaryFeature = savedBoundary;
      if (!issues.includes('미지정 영역 있음') || !locations.some(item => item.label === '미지정 영역')) throw Error('Gap not displayed');
    });
    await page.locator('#historyUndo').click();
    assert.equal(await page.evaluate(() => tongShapes[1].labelPoint || null), null);
    await page.locator('#historyRedo').click();
    assert.deepEqual(await page.evaluate(() => tongShapes[1].labelPoint), [127.005,37.005]);
    await page.evaluate(() => {
      const key = workPrefix + 'backup:' + activeRegion.code;
      localStorage.setItem(key, String(Date.now() - 8 * 86400000));
      updateBackupNotice(false);
    });
    assert.match(await page.locator('#backupStatus').textContent(), /백업/);
    await page.evaluate(() => noteWorkBackup());
    assert.equal(await page.locator('#backupStatus').textContent(), '');
    await page.evaluate(() => {
      const small = [[127,37],[127.001,37],[127.001,37.001],[127,37.001],[127,37]];
      const large = [[127.02,37],[127.03,37],[127.03,37.002],[127.022,37.002],[127.022,37.01],[127.02,37.01],[127.02,37]];
      tongShapes = { 1: { rings: [small, large], bans: [], banShapes: {}, name: '' } };
      renderAll();
      const marker = tongLabels[0].getLatLng();
      const box = tongLabels[0].getElement().querySelector('.tong-label');
      if (box.getBoundingClientRect().width < box.scrollWidth - 1 || box.getBoundingClientRect().width < 20) throw Error('Label box does not fit text');
      if (!turf.booleanPointInPolygon(turf.point([marker.lng, marker.lat]), turf.polygon([large]))) throw Error('Label outside largest part');
      tongShapes[1].rings = [small];
      renderAll();
      const moved = tongLabels[0].getLatLng();
      if (!turf.booleanPointInPolygon(turf.point([moved.lng, moved.lat]), turf.polygon([small]))) throw Error('Label did not move');
      const exported = buildTongJsonObject().body[0].COT_VALUE_01.split('｜').map(Number);
      if (Math.abs(exported[0] - moved.lat) > 1e-9 || Math.abs(exported[1] - moved.lng) > 1e-9) throw Error('Export label differs');
    });
    await page.evaluate(() => { setMode('boundary'); startDrawing(); });
    await page.evaluate(() => mapClickWhileDrawing({ latlng: L.latLng(37, 127) }));
    await page.evaluate(() => mapClickWhileDrawing({ latlng: L.latLng(37, 127) }));
    assert.equal(await page.evaluate(() => drawPoints.length), 1);
    await page.locator('#modeTongBtn').click();
    assert.equal(await page.evaluate(() => mode), 'boundary');
    assert.match(await page.locator('#drawStatus').textContent(), /완성하거나 취소/);
    await page.evaluate(() => undoDrawPoint());
    assert.match(await page.locator('#drawStatus').textContent(), /점 0개/);
    await page.evaluate(() => cancelDrawing());
    await page.locator('#modeTongBtn').click();
    assert.equal(await page.evaluate(() => mode), 'tong');
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
    await page.locator('body').press('Control+z');
    assert.equal(await page.evaluate(() => Object.keys(tongShapes).length), 0);
    await page.locator('body').press('Control+Shift+z');
    assert.equal(await page.evaluate(() => tongShapes[1].name), '원본');
    await page.evaluate(() => {
      setMode('boundary'); startDrawing();
      drawPoints = [[127,37],[127.01,37],[127.01,37.01]];
      handleMapClick({ latlng: L.latLng(37,127) });
      if (isDrawing || !boundaryRing) throw new Error('Closing near first point failed');
    });
    await page.locator('#historyUndo').click();
    await page.evaluate(() => { delete tongShapes[1]; renderAll(); });
    await page.locator('#historyUndo').click();
    assert.equal(await page.evaluate(() => tongShapes[1].name), '원본');
    await page.evaluate(() => { tongShapes[1].name = '새 편집'; renderAll(); });
    assert.equal(await page.locator('#historyRedo').isDisabled(), true);
    await page.evaluate(() => { tongShapes[1].rings[0][1][0] += 0.001; renderAll(); });
    await page.locator('#compareEdits').click();
    assert.ok(await page.evaluate(() => comparisonLayer && comparisonLayer.getLayers().length === 2));
    await page.locator('#historyUndo').click();
    assert.equal(await page.evaluate(() => comparisonLayer), null);
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
