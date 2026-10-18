var addressMarker = null;
var addressCancel = null;
var addressRequest = 0;

function clearAddressSearch() {
  addressRequest++;
  if (addressCancel) addressCancel();
  if (addressMarker) addressMarker.remove();
  addressMarker = null;
  document.getElementById('addressStatus').textContent = '';
}

function locateAddress(point, data) {
  var matches = [];
  var near = false;
  var unit = data.head.UNIT_TYPE === 'ri' ? '리' : '통';
  function inspect(rings) {
    var inside = false;
    rings.forEach(function (ring) {
      if (turf.booleanPointInPolygon(point, turf.polygon([ring]))) inside = true;
      if (turf.pointToLineDistance(point, turf.lineString(ring), { units: 'meters' }) <= 5) near = true;
    });
    return inside;
  }
  Object.keys(data.shapes).forEach(function (number) {
    var region = data.shapes[number];
    var inside = inspect(region.rings);
    var bans = Object.keys(region.banShapes).filter(function (ban) { return inspect(region.banShapes[ban].rings); });
    if (inside) matches.push(number + unit + (bans.length ? ' ' + bans.map(function (ban) { return ban + '반'; }).join(' / ') : ' · 반 경계 미지정'));
    if (bans.length > 1 || (!inside && bans.length)) near = true;
  });
  var label = matches.length ? matches.join(' / ') : '현재 지도에 포함되는 통·리·반 없음';
  if (near || matches.length > 1) label += ' · 확인 필요(경계 5m 이내 또는 구역 겹침)';
  return label;
}

function geocodeAddress(address, type, key) {
  return new Promise(function (resolve, reject) {
    var callback = '__tongbanAddress' + Date.now() + addressRequest;
    var script = document.createElement('script');
    var finished = false;
    var timer;
    function finish(error, value) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      script.remove();
      window[callback] = function () {};
      setTimeout(function () { delete window[callback]; }, 60000);
      addressCancel = null;
      if (error) reject(error);
      else resolve(value);
    }
    addressCancel = function () { finish(new Error('검색 취소')); };
    window[callback] = function (payload) {
      var response = payload && payload.response;
      if (!response || response.status !== 'OK') {
        var code = response && response.error && response.error.code;
        var messages = {
          INVALID_KEY: '인증키를 확인하세요. 발급받은 키 전체를 다시 붙여넣으세요.',
          INCORRECT_KEY: '인증키의 등록 URL을 확인하세요. 현재 사이트: ' + new URL('./', location.href).href,
          UNAVAILABLE_KEY: '사용할 수 없는 인증키입니다. 만료·중지 여부와 지오코더 API 활용 권한을 확인하세요.',
          OVER_REQUEST_LIMIT: '일일 호출 한도를 초과했습니다. 한도 초기화 후 다시 검색하세요.'
        };
        var message = response && response.status === 'NOT_FOUND' ? '주소를 찾지 못했습니다. 주소 종류와 전체 주소를 확인하세요.' :
          messages[code] || '주소 조회 실패 · 지오코더 API 권한·인증키·등록 URL·사용량을 확인하세요.';
        finish(new Error(message));
        return;
      }
      var result = response.result && response.result.point;
      var longitude = result && result.x;
      var latitude = result && result.y;
      if (longitude == null || latitude == null || String(longitude).trim() === '' || String(latitude).trim() === '' ||
          !Number.isFinite(Number(longitude)) || !Number.isFinite(Number(latitude)) ||
          Number(longitude) < 120 || Number(longitude) > 135 || Number(latitude) < 30 || Number(latitude) > 40) {
        finish(new Error('주소 좌표 응답이 올바르지 않습니다.'));
        return;
      }
      finish(null, [Number(longitude), Number(latitude)]);
    };
    script.onerror = function () { finish(new Error('주소 서비스 연결 실패')); };
    script.onload = function () { if (!finished) finish(new Error('주소 서비스 응답 형식 오류')); };
    var url = new URL('https://api.vworld.kr/req/address');
    var params = { service: 'address', request: 'getcoord', version: '2.0', crs: 'EPSG:4326',
      address: address, type: type, simple: 'true', refine: 'true', format: 'json',
      key: key, domain: new URL('./', location.href).href, callback: callback };
    Object.keys(params).forEach(function (name) { url.searchParams.set(name, params[name]); });
    script.src = url.href;
    timer = setTimeout(function () { finish(new Error('주소 조회 시간 초과 · 다시 검색하세요.')); }, 20000);
    document.head.appendChild(script);
  });
}

document.getElementById('addressForm').addEventListener('submit', async function (event) {
  event.preventDefault();
  clearAddressSearch();
  var status = document.getElementById('addressStatus');
  var address = document.getElementById('addressQuery').value.trim();
  var key = document.getElementById('addressKey').value.trim();
  if (!viewerData || !Object.keys(viewerData.shapes).length) { status.textContent = '먼저 작성한 통·리·반 지도를 불러오세요.'; return; }
  if (!address || !key) { status.textContent = '전체 주소와 브이월드 인증키를 입력하세요.'; return; }
  var request = addressRequest;
  var data = viewerData;
  status.textContent = '주소 조회 중…';
  try {
    var coordinates = await geocodeAddress(address, document.getElementById('addressType').value, key);
    if (request !== addressRequest || data !== viewerData) return;
    var label = locateAddress(turf.point(coordinates), data);
    status.textContent = label + ' · 주소 대표점 기준 참고 판정';
    var popup = document.createElement('span');
    popup.textContent = address + ' · ' + label;
    addressMarker = L.marker([coordinates[1], coordinates[0]]).addTo(viewerMap).bindPopup(popup).openPopup();
    viewerMap.setView([coordinates[1], coordinates[0]], 18);
  } catch (error) { if (request === addressRequest) status.textContent = error.message; }
});
['addressQuery', 'addressType', 'addressKey'].forEach(function (id) {
  document.getElementById(id).addEventListener('input', clearAddressSearch);
});
document.getElementById('addressClear').addEventListener('click', function () {
  clearAddressSearch();
  document.getElementById('addressKey').value = '';
  document.getElementById('addressQuery').value = '';
});
