var onlineParcelLayer = null;
var onlineParcelController = null;
var onlineParcelTimer;
var onlineParcelKey = '';
var onlineParcelSequence = 0;
var onlineParcelRequestId = 0;
function requestOnlineParcels(url, signal) {
  return new Promise(function (resolve, reject) {
    var callback = '__vworldParcel' + Date.now() + (++onlineParcelRequestId);
    var script = document.createElement('script');
    var settled = false;
    function finish(error, payload) {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      script.remove();
      window[callback] = function () {};
      setTimeout(function () { delete window[callback]; }, 60000);
      if (error) reject(error);
      else resolve(payload);
    }
    function abort() { finish(new DOMException('Aborted', 'AbortError')); }
    if (signal.aborted) { abort(); return; }
    window[callback] = function (payload) { finish(null, payload); };
    script.onerror = function () { finish(new Error('브이월드 연결 실패 · 네트워크 또는 서비스 상태를 확인하세요.')); };
    script.onload = function () { if (!settled) finish(new Error('브이월드 응답 형식 오류 · 인증키와 등록 URL을 확인하세요.')); };
    url.searchParams.set('callback', callback);
    script.src = url.href;
    signal.addEventListener('abort', abort, { once: true });
    document.head.appendChild(script);
  });
}
function onlineParcelStatus(message) { document.getElementById('vworldStatus').textContent = message; }
function clearOnlineParcels() {
  onlineParcelSequence++;
  clearTimeout(onlineParcelTimer);
  if (onlineParcelController) onlineParcelController.abort();
  onlineParcelController = null;
  if (onlineParcelLayer) onlineParcelLayer.remove();
  onlineParcelLayer = null;
}
function onlineParcelBox() {
  if (!activeRegion) throw new Error('먼저 지역을 선택하세요.');
  var boundary = boundaryFeature || (boundaryRing && ringToTurfPoly(boundaryRing));
  if (!boundary) throw new Error('지역 외곽선이 필요합니다.');
  var regionBox = turf.bbox(boundary);
  var view = oMap.getBounds();
  var box = [Math.max(view.getWest(), regionBox[0]), Math.max(view.getSouth(), regionBox[1]),
    Math.min(view.getEast(), regionBox[2]), Math.min(view.getNorth(), regionBox[3])];
  if (box[0] >= box[2] || box[1] >= box[3]) throw new Error('선택한 지역 안으로 지도를 이동하세요.');
  if (turf.area(turf.bboxPolygon(box)) > 1900000) throw new Error('지도를 더 확대하세요. 조회 범위는 2㎢ 미만입니다.');
  return { box: box, boundary: boundary };
}
function parseOnlineParcelResponse(payload) {
  var response = payload && payload.response;
  if (!response) throw new Error('API 응답 형식 오류');
  if (response.status === 'NOT_FOUND') return { features: [], pages: 1 };
  if (response.status !== 'OK') {
    var code = response.error && response.error.code;
    var messages = {
      INVALID_KEY: '인증키를 확인하세요.', INCORRECT_KEY: '인증키의 등록 URL과 현재 사이트 주소를 확인하세요.',
      UNAVAILABLE_KEY: '사용할 수 없는 인증키입니다.', OVER_REQUEST_LIMIT: '일일 호출 한도를 초과했습니다.',
      INVALID_RANGE: '조회 범위를 더 줄여주세요.'
    };
    throw new Error(messages[code] || '브이월드 요청이 거절되었습니다. API 설정을 확인하세요.');
  }
  var collection = response.result && response.result.featureCollection;
  var pages = Number(response.page && response.page.total);
  if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features) ||
      collection.features.length > 1000 || !Number.isInteger(pages) || pages < 1) throw new Error('API 응답 형식 오류');
  if (pages > 10) throw new Error('필지가 너무 많습니다. 지도를 더 확대하세요.');
  if (collection.crs && !/4326|CRS84/i.test(JSON.stringify(collection.crs))) throw new Error('API 좌표계 오류');
  collection.features.forEach(validateBoundary);
  return { features: collection.features, pages: pages };
}
async function loadOnlineParcels() {
  clearOnlineParcels();
  if (!onlineParcelKey) return;
  var sequence = onlineParcelSequence;
  var region = activeRegion;
  var controller = new AbortController();
  onlineParcelController = controller;
  var timeout;
  try {
    var area = onlineParcelBox();
    var unique = new Map();
    var pages = 1;
    for (var page = 1; page <= pages; page++) {
      onlineParcelStatus('필지 조회 중… ' + page + '/' + pages);
      var url = new URL('https://api.vworld.kr/req/data');
      var params = { service: 'data', version: '2.0', request: 'GetFeature', data: 'LP_PA_CBND_BUBUN',
        key: onlineParcelKey, domain: new URL('./', location.href).href, format: 'json', errorFormat: 'json',
        crs: 'EPSG:4326', geometry: 'true', attribute: 'true', columns: 'pnu,jibun,addr',
        size: '1000', page: String(page), geomFilter: 'BOX(' + area.box.join(',') + ')' };
      Object.keys(params).forEach(function (name) { url.searchParams.set(name, params[name]); });
      timeout = setTimeout(function () { controller.abort(); }, 20000);
      var parsed = parseOnlineParcelResponse(await requestOnlineParcels(url, controller.signal));
      clearTimeout(timeout);
      if (sequence !== onlineParcelSequence || region !== activeRegion) return;
      pages = parsed.pages;
      parsed.features.forEach(function (feature) {
        if (!turf.booleanIntersects(area.boundary, feature)) return;
        var props = feature.properties || {};
        var pnu = String(props.pnu || '');
        if (!/^\d{19}$/.test(pnu)) throw new Error('필지 식별번호 형식 오류');
        unique.set(pnu, { type: 'Feature', geometry: feature.geometry, properties: {
          pnu: pnu, jibun: requireText(props.jibun || '', '지번', 200), addr: requireText(props.addr || '', '주소', 300)
        } });
      });
    }
    onlineParcelLayer = L.geoJSON({ type: 'FeatureCollection', features: Array.from(unique.values()) }, {
      style: { color: '#c77512', weight: 1.5, fillOpacity: 0.06 },
      onEachFeature: function (feature, layer) {
        var label = document.createElement('span');
        label.textContent = feature.properties.addr || feature.properties.jibun || feature.properties.pnu;
        layer.bindTooltip(label);
        layer.on('click', function () {
          if (isDrawing || editingTarget || isPickingParcel) return;
          var owner = findParcelOwner(feature);
          onlineParcelStatus(label.textContent + ' · ' + (owner.tongNum == null ? '미배정' :
            owner.tongNum + unitLabel() + (owner.banNum == null ? '' : ' ' + owner.banNum + '반')) + ' (참고 판정) · 조회 전용');
        });
      }
    }).addTo(oMap);
    onlineParcelStatus(unique.size + '필지 · 조회 전용 · 저장·편입 제외');
  } catch (error) {
    if (sequence !== onlineParcelSequence || region !== activeRegion) return;
    if (error.name === 'TypeError' || error.name === 'SyntaxError') onlineParcelStatus('조회 실패 · 네트워크/CORS 또는 API 응답을 확인하세요.');
    else if (error.name === 'AbortError') onlineParcelStatus('조회 시간 초과 · 다시 연결하세요.');
    else onlineParcelStatus(error.message);
  } finally {
    clearTimeout(timeout);
    if (onlineParcelController === controller) onlineParcelController = null;
  }
}
function scheduleOnlineParcels() {
  clearOnlineParcels();
  if (onlineParcelKey) onlineParcelTimer = setTimeout(loadOnlineParcels, 700);
}
document.getElementById('vworldConnect').addEventListener('click', function () {
  onlineParcelKey = document.getElementById('vworldKey').value.trim();
  if (!onlineParcelKey) { clearOnlineParcels(); onlineParcelStatus('인증키를 입력하세요.'); return; }
  loadOnlineParcels();
});
document.getElementById('vworldDisconnect').addEventListener('click', function () {
  onlineParcelKey = '';
  document.getElementById('vworldKey').value = '';
  clearOnlineParcels();
  onlineParcelStatus('연결 해제됨 · 키 삭제됨');
});
document.getElementById('vworldKey').addEventListener('input', function () {
  onlineParcelKey = '';
  clearOnlineParcels();
});
window.addEventListener('load', function () {
  if (!oMap) return;
  oMap.on('movestart', clearOnlineParcels);
  oMap.on('moveend', scheduleOnlineParcels);
  oMap.attributionControl.addAttribution('온라인 필지: <a href="https://www.vworld.kr/">국토교통부 · 브이월드</a>');
});
