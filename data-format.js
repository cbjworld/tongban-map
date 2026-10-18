function requireNumber(value, label) {
  if (!/^[1-9]\d{0,5}$/.test(String(value))) throw new Error(label + ': 1~999999의 정수가 필요합니다.');
  return Number(value);
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
    shapes[number] = { rings: validateRings(item.COT_COORD_DATA[0]), bans: bans, banShapes: banShapes,
      name: requireText(item.UNIT_NAME || '', '통/리 이름', 100) };
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
