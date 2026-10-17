var viewerMap;
var viewerRegions = [];
var viewerLayers;
var viewerRequest = 0;
var viewerData = null;
var viewerLocalCode = null;

function viewerStatus(message) { document.getElementById('viewerStatus').textContent = message; }
function viewerOptions(id, rows, placeholder) {
  var select = document.getElementById(id);
  select.replaceChildren(new Option(placeholder, ''));
  rows.forEach(function (row) { select.add(new Option(row.name, row.code)); });
}
function viewerDistricts() {
  var districts = new Map();
  viewerRegions.filter(function (row) { return row.sido === document.getElementById('sidoSelect').value; }).forEach(function (row) {
    districts.set(row.sgg, { code: row.sgg, name: row.sggName });
  });
  viewerOptions('sggSelect', Array.from(districts.values()), '시군구 선택');
  viewerOptions('dongSelect', [], '읍면동 선택');
}
function viewerDongs() {
  viewerOptions('dongSelect', viewerRegions.filter(function (row) { return row.sgg === document.getElementById('sggSelect').value; }), '읍면동 선택');
}
function renderViewer(data, boundary, title) {
  clearAddressSearch();
  var layers = L.featureGroup();
  var list = document.createDocumentFragment();
  if (boundary) L.geoJSON(boundary, { style: { color: '#4b6ebe', fill: false, weight: 3 } }).addTo(layers);
  var unit = data && data.head.UNIT_TYPE === 'ri' ? '리' : '통';
  Object.keys(data ? data.shapes : {}).forEach(function (number) {
    var shape = data.shapes[number];
    var label = number + unit + (shape.name ? ' · ' + shape.name : '');
    var geometry = { type: 'MultiPolygon', coordinates: shape.rings.map(function (ring) { return [ring]; }) };
    var polygon = L.geoJSON(geometry, { style: { color: 'hsl(' + Number(number) * 47 % 360 + ',62%,34%)', fillOpacity: 0.3, weight: 2 } }).addTo(layers);
    var tooltip = document.createElement('span');
    tooltip.textContent = label;
    polygon.bindTooltip(tooltip, { permanent: true, direction: 'center' });
    var button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', function () { viewerMap.fitBounds(polygon.getBounds(), { padding: [20, 20], maxZoom: 18 }); });
    list.appendChild(button);
    Object.keys(shape.banShapes).forEach(function (ban) {
      L.geoJSON({ type: 'MultiPolygon', coordinates: shape.banShapes[ban].rings.map(function (ring) { return [ring]; }) },
        { style: { color: '#333', weight: 1.5, dashArray: '4 4', fill: false } }).bindTooltip(escapeHtml(label + ' ' + ban + '반')).addTo(layers);
    });
  });
  if (viewerLayers) viewerLayers.remove();
  viewerLayers = layers.addTo(viewerMap);
  viewerData = data;
  document.getElementById('viewerList').replaceChildren(list);
  document.getElementById('viewerTitle').textContent = title;
  viewerMap.stop();
  if (layers.getBounds().isValid()) viewerMap.fitBounds(layers.getBounds(), { padding: [30, 30], maxZoom: 16, animate: false });
}
async function loadViewerRegion(code) {
  clearAddressSearch();
  var row = viewerRegions.find(function (entry) { return entry.code === code; });
  if (!row) return;
  var request = ++viewerRequest;
  viewerLocalCode = code;
  try {
    var saved = readLocalWork(code);
    if (saved) {
      renderViewer(saved.value.parsed, saved.value.parsed.head.BOUNDARY, saved.value.parsed.head.DONG_NAME);
      viewerStatus('이 브라우저의 내 작업 · 완성된 경계');
      return;
    }
    var response = await fetch('data/regions/' + code + '.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    var boundary = validateBoundary(await response.json());
    if (request !== viewerRequest) return;
    renderViewer(null, boundary, row.fullName);
    viewerStatus('지역 외곽선 · 통·리·반 JSON을 불러오세요.');
  } catch (error) { if (request === viewerRequest) viewerStatus('불러오기 실패: ' + error.message); }
}
async function bootApp() {
  try {
    if (!window.L) throw new Error('지도 라이브러리를 불러오지 못했습니다.');
    viewerMap = createMap(document.getElementById('gisMap'));
    viewerMap.attributionControl.addAttribution('주소 검색: <a href="https://www.vworld.kr/">브이월드</a>');
    viewerMap.attributionControl.addAttribution('경계: <a href="https://github.com/vuski/admdongkor">SGIS · vuski/admdongkor · CC BY 4.0</a>');
    var response = await fetch('data/regions/index.json');
    if (!response.ok) throw new Error('지역 목록 HTTP ' + response.status);
    viewerRegions = await response.json();
    var provinces = new Map();
    viewerRegions.forEach(function (row) { provinces.set(row.sido, { code: row.sido, name: row.sidoName }); });
    viewerOptions('sidoSelect', Array.from(provinces.values()), '시도 선택');
    var initial = viewerRegions.find(function (row) { return row.code === lastWorkRegion(); }) || viewerRegions.find(function (row) { return row.code === '1117068500'; });
    document.getElementById('sidoSelect').value = initial.sido;
    viewerDistricts();
    document.getElementById('sggSelect').value = initial.sgg;
    viewerDongs();
    document.getElementById('dongSelect').value = initial.code;
    document.getElementById('viewerFile').disabled = false;
    await loadViewerRegion(initial.code);
  } catch (error) { viewerStatus(error.message); }
}
document.getElementById('sidoSelect').addEventListener('change', viewerDistricts);
document.getElementById('sggSelect').addEventListener('change', viewerDongs);
document.getElementById('dongSelect').addEventListener('change', function () { loadViewerRegion(this.value); });
document.getElementById('viewerFile').addEventListener('change', async function () {
  var file = this.files[0];
  if (!file) return;
  clearAddressSearch();
  var request = ++viewerRequest;
  viewerLocalCode = null;
  try {
    var data = parseMapData(await readJsonUpload(file));
    var boundary = data.head.BOUNDARY || null;
    if (!boundary && data.head.REGION_CODE) {
      var response = await fetch('data/regions/' + data.head.REGION_CODE + '.json');
      if (response.ok) boundary = validateBoundary(await response.json());
    }
    if (request !== viewerRequest) return;
    var region = viewerRegions.find(function (row) { return row.code === data.head.REGION_CODE; });
    if (region) {
      document.getElementById('sidoSelect').value = region.sido;
      viewerDistricts();
      document.getElementById('sggSelect').value = region.sgg;
      viewerDongs();
      document.getElementById('dongSelect').value = region.code;
    } else {
      document.getElementById('sidoSelect').value = '';
      viewerDistricts();
    }
    renderViewer(data, boundary, data.head.DONG_NAME);
    viewerStatus(Object.keys(data.shapes).length + '개 경계 · ' + file.name);
  } catch (error) { if (request === viewerRequest) viewerStatus('불러오기 실패: ' + error.message); }
  this.value = '';
});
window.addEventListener('load', bootApp);
window.addEventListener('storage', function (event) {
  if (viewerLocalCode && event.key === workPrefix + viewerLocalCode) loadViewerRegion(viewerLocalCode);
});
