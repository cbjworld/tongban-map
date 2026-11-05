function requireNumber(value, label) {
  if (!/^[1-9]\d{0,5}$/.test(String(value))) throw new Error(label + ': 1~999999의 정수가 필요합니다.');
  return Number(value);
}

function unitColors(number) {
  var hue = (Number(number) * 137.508) % 360;
  return { stroke: '#1450b7', fill: 'hsl(' + hue + ', 68%, 62%)', label: 'hsl(' + hue + ', 70%, 25%)' };
}

function shapeLabelPoint(rings, manual) {
  if (manual && rings.some(function (ring) { return turf.booleanPointInPolygon(turf.point(manual), turf.polygon([ring])); })) return manual;
  var largest = rings.map(function (ring) { return turf.polygon([ring]); }).reduce(function (best, polygon) {
    return !best || turf.area(polygon) > turf.area(best) ? polygon : best;
  }, null);
  if (!largest) throw new Error('라벨을 표시할 경계가 없습니다.');
  return turf.pointOnFeature(largest).geometry.coordinates;
}

function formatArea(rings) {
  var area = rings.reduce(function (sum, ring) { return sum + turf.area(turf.polygon([ring])); }, 0);
  return area >= 1000000 ? (area / 1000000).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '㎢' : Math.round(area).toLocaleString('ko-KR') + '㎡';
}

function describeMapData(parsed) {
  var count = Object.keys(parsed.shapes).length;
  var bans = Object.keys(parsed.shapes).reduce(function (total, number) { return total + Object.keys(parsed.shapes[number].banShapes).length; }, 0);
  return (parsed.head.DONG_NAME || '지역명 없음') + ' · ' + (parsed.head.UNIT_TYPE === 'ri' ? '리' : '통') + ' ' + count + '개 · 반 ' + bans + '개';
}

function arrangeMapLabels(map, entries) {
  var occupied = [];
  entries.slice().sort(function (a, b) { return Number(!!b.manual) - Number(!!a.manual); }).forEach(function (entry) {
    if (!map.hasLayer(entry.marker)) return;
    var origin = shapeLabelPoint(entry.rings, entry.manual);
    entry.marker.setLatLng([origin[1], origin[0]]);
    var element = entry.element();
    if (!element) return;
    var width = element.offsetWidth || 50, height = element.offsetHeight || 24;
    var base = map.latLngToContainerPoint([origin[1], origin[0]]);
    var offsets = [[0,0]];
    if (!entry.manual) {
      for (var distance = 1; distance <= 3; distance++) {
        [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]].forEach(function (step) { offsets.push([step[0] * distance * (width + 6), step[1] * distance * (height + 6)]); });
      }
    }
    var chosen = null;
    offsets.some(function (offset) {
      var point = L.point(base.x + offset[0], base.y + offset[1]);
      var latlng = map.containerPointToLatLng(point);
      if (!entry.rings.some(function (ring) { return turf.booleanPointInPolygon(turf.point([latlng.lng, latlng.lat]), turf.polygon([ring])); })) return false;
      var box = { left: point.x - width / 2 - 3, right: point.x + width / 2 + 3, top: point.y - height / 2 - 3, bottom: point.y + height / 2 + 3 };
      if (occupied.some(function (other) { return box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top; })) return false;
      chosen = { latlng: latlng, box: box }; return true;
    });
    if (chosen) { entry.marker.setLatLng(chosen.latlng); occupied.push(chosen.box); }
    else occupied.push({ left: base.x - width / 2, right: base.x + width / 2, top: base.y - height / 2, bottom: base.y + height / 2 });
  });
}

function csvCell(value) {
  var text = value == null ? '' : String(value);
  if (/^\s*[=+@-]/.test(text)) text = "'" + text;
  if (/[",\r\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
  return text;
}

function requireText(value, label, maxLength) {
  if (typeof value !== 'string' || value.length > maxLength) throw new Error(label + ' 형식이 올바르지 않습니다.');
  return value;
}

function validateBoundary(feature) {
  if (!feature || feature.type !== 'Feature' || !feature.geometry ||
      !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) throw new Error('Polygon/MultiPolygon GeoJSON이 필요합니다.');
  var polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  if (!Array.isArray(polygons) || !polygons.length) throw new Error('빈 경계입니다.');
  var count = 0;
  polygons.forEach(function (polygon) {
    if (!Array.isArray(polygon) || !polygon.length) throw new Error('빈 폴리곤입니다.');
    polygon.forEach(function (ring) {
      if (!Array.isArray(ring) || ring.length < 4) throw new Error('경계에는 3개 이상의 꼭짓점이 필요합니다.');
      ring.forEach(function (point) {
        if (++count > 200000) throw new Error('경계가 너무 큽니다. 지역별로 나누어 주세요.');
        if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
            Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error('WGS84 경도·위도 좌표가 필요합니다.');
      });
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) throw new Error('닫히지 않은 경계입니다.');
      if (new Set(ring.map(function (point) { return point.join(','); })).size < 3) throw new Error('서로 다른 점이 3개 이상 필요합니다.');
      var area = 0;
      for (var index = 1; index < ring.length; index++) area += (ring[index - 1][0] - ring[0][0]) * (ring[index][1] - ring[0][1]) - (ring[index][0] - ring[0][0]) * (ring[index - 1][1] - ring[0][1]);
      if (Math.abs(area) < 1e-16) throw new Error('면적이 없는 경계입니다.');
    });
  });
  return feature;
}

function validateRings(rings) {
  if (!Array.isArray(rings) || !rings.length) throw new Error('경계 조각이 없습니다.');
  validateBoundary({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: rings.map(function (ring) { return [ring]; }) } });
  return rings;
}

function parseMapData(data) {
  if (!data || !data.head || !Array.isArray(data.body) || data.body.length > 10000) throw new Error('통·리·반 JSON 형식이 아닙니다.');
  requireText(data.head.DONG_NAME, '지역명', 200);
  if (data.head.REGION_CODE != null && !/^\d{10}$/.test(data.head.REGION_CODE)) throw new Error('지역 코드가 올바르지 않습니다.');
  if (data.head.UNIT_TYPE && !['tong', 'ri'].includes(data.head.UNIT_TYPE)) throw new Error('통/리 구분이 올바르지 않습니다.');
  if (data.head.BOUNDARY) validateBoundary(data.head.BOUNDARY);
  var shapes = {};
  data.body.forEach(function (item) {
    if (!item || !Array.isArray(item.COT_COORD_DATA) || item.COT_COORD_DATA.length !== 1) throw new Error('경계 형식이 올바르지 않습니다.');
    var number = requireNumber(item.COT_CONTS_NAME, '통/리 번호');
    if (shapes[number]) throw new Error('중복 통/리 번호입니다.');
    var bans = item.BAN_LIST || [];
    if (!Array.isArray(bans)) throw new Error('반 목록이 올바르지 않습니다.');
    bans = bans.map(function (value) { return requireNumber(value, '반 번호'); });
    var banShapes = {};
    var coordinates = item.BAN_COORD_DATA || {};
    if (typeof coordinates !== 'object' || Array.isArray(coordinates)) throw new Error('반 경계 형식이 올바르지 않습니다.');
    Object.keys(coordinates).forEach(function (key) {
      var ban = requireNumber(key, '반 번호');
      banShapes[ban] = { rings: validateRings(coordinates[key]) };
      if (!bans.includes(ban)) bans.push(ban);
    });
    var labelPoint = item.LABEL_COORD;
    if (labelPoint != null && (!Array.isArray(labelPoint) || labelPoint.length !== 2 ||
        !labelPoint.every(Number.isFinite) || Math.abs(labelPoint[0]) > 180 || Math.abs(labelPoint[1]) > 90)) throw new Error('라벨 좌표가 올바르지 않습니다.');
    shapes[number] = { rings: validateRings(item.COT_COORD_DATA[0]), bans: bans, banShapes: banShapes,
      name: requireText(item.UNIT_NAME || '', '통/리 이름', 100), labelPoint: labelPoint || null };
  });
  return { head: data.head, shapes: shapes };
}

function readJsonUpload(file) {
  if (!file || file.size > 25 * 1024 * 1024) return Promise.reject(new Error('25MB 이하의 지역별 JSON 파일을 사용해주세요.'));
  return file.text().then(function (text) { return JSON.parse(text.replace(/^\uFEFF/, '')); });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (character) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]; });
}
