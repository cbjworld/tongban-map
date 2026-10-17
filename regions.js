var regionIndex = [];
var activeRegion = null;
var boundaryFeature = null;

function regionOptions(id, entries, placeholder) {
  var select = document.getElementById(id);
  select.replaceChildren(new Option(placeholder, ''));
  entries.forEach(function (entry) { select.add(new Option(entry.name, entry.code)); });
}

function populateDistricts() {
  var province = document.getElementById('sidoSelect').value;
  var districts = new Map();
  regionIndex.filter(function (entry) { return entry.sido === province; }).forEach(function (entry) {
    districts.set(entry.sgg, { code: entry.sgg, name: entry.sggName });
  });
  regionOptions('sggSelect', Array.from(districts.values()), '시군구 선택');
  regionOptions('dongSelect', [], '읍면동 선택');
}

function populateRegions() {
  var district = document.getElementById('sggSelect').value;
  regionOptions('dongSelect', regionIndex.filter(function (entry) { return entry.sgg === district; }), '읍면동 선택');
}

function restoreRegionSelection() {
  if (!activeRegion) return;
  document.getElementById('sidoSelect').value = activeRegion.sido;
  populateDistricts();
  document.getElementById('sggSelect').value = activeRegion.sgg;
  populateRegions();
  document.getElementById('dongSelect').value = activeRegion.code;
}

async function readRegionJson(path) {
  var response = await fetch('data/regions/' + path);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

async function loadRegion(code) {
  var entry = regionIndex.find(function (item) { return item.code === code; });
  if (!entry || (activeRegion && activeRegion.code === code)) return;
  if (activeRegion && !saveLocalWork()) {
    restoreRegionSelection();
    return;
  }
  var panel = document.getElementById('panel');
  panel.inert = true;
  document.getElementById('gisMap').inert = true;
  setDrawStatus('지역 경계 불러오는 중…');
  try {
    var results = await Promise.all([
      readRegionJson(entry.code + '.json'),
      entry.parcels ? readRegionJson(entry.code + '-parcels.json') : Promise.resolve(null)
    ]);
    validateBoundary(results[0]);
    workReady = false;
    clearTimeout(workTimer);
    if (editingTarget) stopVertexEdit();
    if (isDrawing) cancelDrawing();
    if (isPickingParcel) togglePickMode();
    activeRegion = entry;
    boundaryFeature = results[0];
    boundaryRing = null;
    tongShapes = {};
    unitType = /[읍면]$/.test(entry.name) ? 'ri' : 'tong';
    updateUnitLabels();
    document.getElementById('parcelImportStatus').textContent = '';
    PARCELS_BY_DONG = {};
    if (results[1]) PARCELS_BY_DONG[entry.fullName] = results[1];
    document.getElementById('dongNameInput').value = entry.fullName;
    restoreRegionSelection();
    renderAll();
    restoreLocalWork();
    oMap.stop();
    oMap.fitBounds(boundaryLine.getBounds(), { padding: [30, 30], maxZoom: 16, animate: false });
    populateParcelSection();
    document.getElementById('regionStatus').textContent = entry.fullName;
    setDrawStatus('');
  } catch (error) {
    restoreRegionSelection();
    setDrawStatus('지역을 불러오지 못했습니다: ' + error.message, 'warn');
  } finally {
    panel.inert = false;
    document.getElementById('gisMap').inert = false;
  }
}

async function initRegions() {
  try {
    regionIndex = await readRegionJson('index.json');
    if (!Array.isArray(regionIndex) || !regionIndex.length || regionIndex.some(function (entry) {
      return !/^\d{10}$/.test(entry.code) || !entry.fullName || !entry.sido || !entry.sgg;
    })) throw new Error('잘못된 지역 목록');
    var provinces = new Map();
    regionIndex.forEach(function (entry) { provinces.set(entry.sido, { code: entry.sido, name: entry.sidoName }); });
    regionOptions('sidoSelect', Array.from(provinces.values()), '시도 선택');
    regionOptions('sggSelect', [], '시군구 선택');
    regionOptions('dongSelect', [], '읍면동 선택');
    oMap.attributionControl.addAttribution('경계: <a href="https://sgis.kostat.go.kr">SGIS</a> · <a href="https://github.com/vuski/admdongkor">vuski/admdongkor</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>');
    var latest = lastWorkRegion();
    await loadRegion(regionIndex.some(function (entry) { return entry.code === latest; }) ? latest : '1117068500');
  } catch (error) {
    setDrawStatus('지역 목록을 불러오지 못했습니다. 새로고침해주세요: ' + error.message, 'warn');
  }
}

document.getElementById('sidoSelect').addEventListener('change', populateDistricts);
document.getElementById('sggSelect').addEventListener('change', populateRegions);
document.getElementById('dongSelect').addEventListener('change', function () { loadRegion(this.value); });
