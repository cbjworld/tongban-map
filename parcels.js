function parseParcelData(data) {
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > 10000) throw new Error('최대 10,000필지의 GeoJSON FeatureCollection이 필요합니다.');
  if (!activeRegion || (!boundaryFeature && !boundaryRing)) throw new Error('먼저 지역을 선택해주세요.');
  if (data.crs && !/4326|CRS84/i.test(JSON.stringify(data.crs))) throw new Error('WGS84(EPSG:4326)로 변환한 파일을 사용해주세요.');
  var boundary = boundaryFeature || ringToTurfPoly(boundaryRing);
  var identifiers = new Set();
  var parcels = [];
  data.features.forEach(function (feature) {
    validateBoundary(feature);
    if (!turf.booleanIntersects(boundary, feature)) return;
    var props = feature.properties || {};
    var pnu = String(props.pnu || props.PNU || '');
    if (pnu && !/^\d{19}$/.test(pnu)) throw new Error('PNU는 19자리 숫자여야 합니다.');
    var jibun = props.jibun || props.JIBUN || props.j;
    if (!jibun && pnu) jibun = (pnu[10] === '2' ? '산 ' : '') + Number(pnu.slice(11, 15)) + (Number(pnu.slice(15)) ? '-' + Number(pnu.slice(15)) : '');
    requireText(jibun, '지번(jibun/JIBUN)', 200);
    var legalName = props.legal_name || props.emd_nm || props.EMD_NM || '';
    requireText(legalName, '법정동/리명', 100);
    var label = (legalName ? legalName + ' ' : '') + jibun + (pnu ? ' [' + pnu + ']' : '');
    var identifier = pnu || label;
    if (identifiers.has(identifier)) throw new Error('중복 필지입니다. PNU 또는 법정동·리명을 포함해 구분해주세요.');
    identifiers.add(identifier);
    parcels.push({ j: label, pnu: pnu, road_address: requireText(props.road_address || '', '도로명주소', 300),
      g: feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates });
  });
  if (!parcels.length) throw new Error('선택한 지역과 겹치는 필지가 없습니다. 좌표계와 지역을 확인해주세요.');
  return parcels;
}

document.getElementById('loadParcelsInput').addEventListener('change', async function () {
  var file = this.files[0];
  if (!file) return;
  var region = activeRegion;
  var status = document.getElementById('parcelImportStatus');
  try {
    var data = await readJsonUpload(file);
    if (region !== activeRegion) throw new Error('지역이 변경되었습니다. 다시 불러와주세요.');
    var parcels = parseParcelData(data);
    if (currentDongParcels() && !confirm('현재 필지 자료를 교체할까요? 작성한 통·리·반 경계는 유지됩니다.')) return;
    PARCELS_BY_DONG = {};
    PARCELS_BY_DONG[activeRegion.fullName] = parcels;
    populateParcelSection();
    status.textContent = parcels.length + '필지 불러옴 · ' + file.name;
  } catch (error) { status.textContent = '불러오기 실패: ' + error.message; }
  this.value = '';
});
