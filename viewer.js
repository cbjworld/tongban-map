var viewerMap;
var viewerRegions = [];
var viewerLayers;
var viewerRequest = 0;
var viewerData = null;
var viewerLocalCode = null;
var viewerLabelEntries = [];
function arrangeViewerLabels() { requestAnimationFrame(function () { if (viewerMap) arrangeMapLabels(viewerMap, viewerLabelEntries); }); }

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
  viewerLabelEntries = [];
  var layers = L.featureGroup();
  var list = document.createDocumentFragment();
  if (boundary) L.geoJSON(boundary, { style: { color: '#4b6ebe', fill: false, weight: 3 } }).addTo(layers);
  var unit = data && data.head.UNIT_TYPE === 'ri' ? '리' : '통';
  Object.keys(data ? data.shapes : {}).forEach(function (number) {
    var shape = data.shapes[number];
    var colors = unitColors(number);
    var label = number + unit + (shape.name ? ' · ' + shape.name : '');
    var group = L.featureGroup().addTo(layers);
    var geometry = { type: 'MultiPolygon', coordinates: shape.rings.map(function (ring) { return [ring]; }) };
    var polygon = L.geoJSON(geometry, { pane: 'viewerTong', style: { color: colors.stroke, fillColor: colors.fill, fillOpacity: 0.25, weight: 3 } }).addTo(group);
    var tooltip = document.createElement('span');
    tooltip.textContent = label;
    tooltip.style.backgroundColor = colors.label;
    var center = shapeLabelPoint(shape.rings, shape.labelPoint);
    var marker = L.circleMarker([center[1], center[0]], { radius: 0, opacity: 0, fillOpacity: 0, interactive: false })
      .bindTooltip(tooltip, { permanent: true, direction: 'center', className: 'unitTooltip' }).addTo(group);
    viewerLabelEntries.push({ marker: marker, rings: shape.rings, manual: shape.labelPoint, element: function () { return marker.getTooltip().getElement(); } });
    var button = document.createElement('button');
    button.textContent = label;
    button.addEventListener('click', function () {
      if (!checkbox.checked) { checkbox.checked = true; layers.addLayer(group); }
      viewerMap.fitBounds(polygon.getBounds(), { padding: [20, 20], maxZoom: 18 });
    });
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.setAttribute('aria-label', label + ' 표시');
    checkbox.addEventListener('change', function () {
      if (checkbox.checked) layers.addLayer(group);
      else layers.removeLayer(group);
      arrangeViewerLabels();
    });
    var row = document.createElement('div');
    row.className = 'viewerUnit';
    row.appendChild(checkbox);
    row.appendChild(button);
    var area = document.createElement('span');
    area.className = 'viewerArea';
    area.textContent = '약 ' + formatArea(shape.rings);
    row.appendChild(area);
    list.appendChild(row);
    Object.keys(shape.banShapes).forEach(function (ban) {
      L.geoJSON({ type: 'MultiPolygon', coordinates: shape.banShapes[ban].rings.map(function (ring) { return [ring]; }) },
        { pane: 'viewerBan', style: { color: '#c97700', weight: 2.5, dashArray: '4 4', fill: false } }).bindTooltip(escapeHtml(label + ' ' + ban + '반')).addTo(group);
      var banArea = document.createElement('div');
      banArea.className = 'viewerBanArea';
      banArea.textContent = ban + '반 · 약 ' + formatArea(shape.banShapes[ban].rings);
      list.appendChild(banArea);
    });
  });
  if (viewerLayers) viewerLayers.remove();
  viewerLayers = layers.addTo(viewerMap);
  viewerData = data;
  document.getElementById('viewerList').replaceChildren(list);
  document.getElementById('viewerTitle').textContent = title;
  viewerMap.stop();
  if (layers.getBounds().isValid()) viewerMap.fitBounds(layers.getBounds(), { padding: [30, 30], maxZoom: 16, animate: false });
  arrangeViewerLabels();
}
async function loadViewerRegion(code) {
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
    viewerMap.on('zoomend', arrangeViewerLabels);
    viewerMap.createPane('viewerBan').style.zIndex = 410;
    viewerMap.createPane('viewerTong').style.zIndex = 411;
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
function clearViewerSelection() {
  viewerRequest++;
  viewerLocalCode = null;
  renderViewer(null, null, '');
  viewerStatus('읍면동을 선택하세요.');
}
document.getElementById('sidoSelect').addEventListener('change', function () { clearViewerSelection(); viewerDistricts(); });
document.getElementById('sggSelect').addEventListener('change', function () { clearViewerSelection(); viewerDongs(); });
document.getElementById('dongSelect').addEventListener('change', function () {
  if (this.value) loadViewerRegion(this.value);
  else clearViewerSelection();
});
document.getElementById('viewerFile').addEventListener('change', async function () {
  var file = this.files[0];
  if (!file) return;
  var request = ++viewerRequest;
  try {
    var data = parseMapData(await readJsonUpload(file));
    var boundary = data.head.BOUNDARY || null;
    if (!boundary && data.head.REGION_CODE) {
      var response = await fetch('data/regions/' + data.head.REGION_CODE + '.json');
      if (response.ok) boundary = validateBoundary(await response.json());
    }
    if (request !== viewerRequest) return;
    viewerLocalCode = null;
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
