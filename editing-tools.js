var editHistory = [];
var editNames = [];
var nextEditName = '';
var editPosition = -1;
var applyingEdit = false;
var labelsMovable = false;
var inspectionLayer = null;
var comparisonLayer = null;
function clearEditingOverlays() {
  if (inspectionLayer) inspectionLayer.remove();
  if (comparisonLayer) comparisonLayer.remove();
  inspectionLayer = comparisonLayer = null;
  document.getElementById('geometryResults').replaceChildren();
}
function editSnapshot() {
  return JSON.stringify({ shapes: tongShapes, boundary: boundaryFeature, ring: boundaryRing,
    unit: unitType, name: document.getElementById('dongNameInput').value });
}
function updateHistoryButtons() {
  document.getElementById('historyUndo').disabled = editPosition <= 0;
  document.getElementById('historyRedo').disabled = editPosition >= editHistory.length - 1;
  var list = document.getElementById('historyList');
  list.replaceChildren();
  editNames.forEach(function (name, index) {
    var item = document.createElement('li');
    item.textContent = name + (index === editPosition ? ' · 현재' : index > editPosition ? ' · 취소됨' : '');
    list.appendChild(item);
  });
}
function markEdit(name) { nextEditName = name; }
function resetEditHistory() {
  clearEditingOverlays();
  editHistory = [editSnapshot()];
  editNames = ['작업 시작'];
  nextEditName = '';
  editPosition = 0;
  document.getElementById('editingStatus').textContent = '';
  updateHistoryButtons();
}
function recordEdit() {
  if (applyingEdit || !workReady || workBlocked) return;
  var snapshot = editSnapshot();
  if (snapshot === editHistory[editPosition]) { nextEditName = ''; return; }
  clearEditingOverlays();
  editHistory = editHistory.slice(0, editPosition + 1);
  editNames = editNames.slice(0, editPosition + 1);
  editHistory.push(snapshot);
  editNames.push(nextEditName || '지도 변경');
  nextEditName = '';
  var size = editHistory.reduce(function (total, item) { return total + item.length * 2; }, 0);
  while (editHistory.length > 1 && (editHistory.length > 50 || size > 5 * 1024 * 1024)) { size -= editHistory.shift().length * 2; editNames.shift(); }
  editPosition = editHistory.length - 1;
  document.getElementById('editingStatus').textContent = '';
  updateHistoryButtons();
}
function moveEditHistory(direction) {
  var status = document.getElementById('editingStatus');
  if (!workReady || workBlocked) return;
  if (isDrawing) { status.textContent = '그리기를 완료하거나 취소한 뒤 실행하세요. 그리는 중에는 점 취소를 사용하세요.'; return; }
  recordEdit();
  var next = editPosition + direction;
  if (next < 0 || next >= editHistory.length) return;
  if (localStorage.getItem(workPrefix + activeRegion.code) !== workRaw) {
    status.textContent = '다른 탭에서 변경됨 · JSON 백업 후 새로고침하세요.';
    return;
  }
  var saved = JSON.parse(editHistory[next]);
  clearEditingOverlays();
  applyingEdit = true;
  try {
    if (editingTarget) stopVertexEdit();
    if (isPickingParcel) togglePickMode();
    tongShapes = saved.shapes;
    boundaryFeature = saved.boundary;
    boundaryRing = saved.ring;
    unitType = saved.unit;
    document.getElementById('dongNameInput').value = saved.name;
    updateUnitLabels();
    editPosition = next;
    renderAll();
    saveLocalWork();
    status.textContent = direction < 0 ? '실행 취소됨' : '다시 실행됨';
  } finally { applyingEdit = false; updateHistoryButtons(); }
}
function inspectMapGeometry(shapes, locations) {
  var problems = [];
  function geometry(rings) {
    if (!rings.length) return null;
    var polygons = rings.map(function (ring) {
      var polygon = turf.polygon([ring]);
      if (turf.kinks(polygon).features.length) throw new Error('자기 교차 경계');
      return polygon;
    });
    return polygons.length === 1 ? polygons[0] : turf.union(turf.featureCollection(polygons));
  }
  function overlaps(entries) {
    entries.forEach(function (entry, index) {
      entries.slice(index + 1).forEach(function (other) {
        if (!turf.booleanIntersects(entry.feature, other.feature)) return;
        var intersection = turf.intersect(turf.featureCollection([entry.feature, other.feature]));
        if (intersection && turf.area(intersection) > 0.01) {
          problems.push(entry.label + ' / ' + other.label + ' 겹침');
          if (locations) locations.push({ feature: intersection, label: entry.label + ' / ' + other.label + ' 겹침', color: '#d23b33' });
        }
      });
    });
  }
  var parents = [];
  Object.keys(shapes).forEach(function (number) {
    var label = number + unitLabel();
    try {
      var parent = geometry(shapes[number].rings);
      if (!parent) { problems.push(label + ' 경계 없음'); return; }
      parents.push({ label: label, feature: parent });
      if (locations && (boundaryFeature || boundaryRing)) {
        var region = boundaryFeature || turf.polygon([boundaryRing]);
        var beyond = turf.difference(turf.featureCollection([parent, region]));
        if (beyond && turf.area(beyond) > 0.01) {
          problems.push(label + ' 지역 외곽선 밖');
          locations.push({ feature: beyond, label: label + ' 지역 외곽선 밖', color: '#d23b33', edit: 'tong:' + number });
        }
      }
      var children = [];
      Object.keys(shapes[number].banShapes || {}).forEach(function (ban) {
        var childLabel = label + ' ' + ban + '반';
        try {
          var child = geometry(shapes[number].banShapes[ban].rings);
          if (!child) { problems.push(childLabel + ' 경계 없음'); return; }
          children.push({ label: childLabel, feature: child });
          var outside = turf.difference(turf.featureCollection([child, parent]));
          if (outside && turf.area(outside) > 0.01) {
            problems.push(childLabel + ' 상위 구역 밖');
            if (locations) locations.push({ feature: outside, label: childLabel + ' 상위 구역 밖', color: '#d23b33', edit: 'ban:' + number + ':' + ban });
          }
        } catch (error) { problems.push(childLabel + ' 검사 실패 · 경계 형식을 확인하세요'); }
      });
      overlaps(children);
      if (locations) {
        var covered = children.length === 0 ? null : children.length === 1 ? children[0].feature : turf.union(turf.featureCollection(children.map(function (child) { return child.feature; })));
        var missing = covered ? turf.difference(turf.featureCollection([parent, covered])) : parent;
        if (missing && turf.area(missing) > 0.01) {
          problems.push(label + ' 반 미지정 영역');
          locations.push({ feature: missing, label: label + ' 반 미지정 영역', color: '#e99500', drawBan: number });
        }
      }
    } catch (error) { problems.push(label + ' 검사 실패 · 자기 교차 또는 경계 형식을 확인하세요'); }
  });
  try { overlaps(parents); } catch (error) { problems.push('구역 간 겹침 검사 실패'); }
  if (locations && parents.length && (boundaryFeature || boundaryRing)) {
    try {
      var boundary = boundaryFeature || turf.polygon([boundaryRing]);
      var combined = parents.length === 1 ? parents[0].feature : turf.union(turf.featureCollection(parents.map(function (entry) { return entry.feature; })));
      var gap = turf.difference(turf.featureCollection([boundary, combined]));
      if (gap && turf.area(gap) > 0.01) {
        locations.push({ feature: gap, label: '미지정 영역', color: '#e99500' });
        problems.push('미지정 영역 있음');
      }
    } catch (error) { problems.push('미지정 영역 검사 실패'); }
  }
  return problems;
}
document.getElementById('historyUndo').addEventListener('click', function () { moveEditHistory(-1); });
document.getElementById('historyRedo').addEventListener('click', function () { moveEditHistory(1); });
document.getElementById('checkGeometry').addEventListener('click', function () {
  var status = document.getElementById('editingStatus');
  if (!workReady) return;
  if (inspectionLayer) { clearEditingOverlays(); status.textContent = ''; return; }
  if (!Object.keys(tongShapes).length) { status.textContent = '검사할 구역이 없습니다.'; return; }
  clearEditingOverlays();
  var locations = [];
  var problems = inspectMapGeometry(tongShapes, locations);
  inspectionLayer = L.featureGroup().addTo(oMap);
  locations.forEach(function (item) {
    var layer = L.geoJSON(item.feature, { style: { color: item.color, weight: 2, fillOpacity: 0.35 } }).bindTooltip(item.label).addTo(inspectionLayer);
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label + ' 위치 보기';
    button.addEventListener('click', function () { oMap.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 18 }); });
    document.getElementById('geometryResults').appendChild(button);
    if (item.edit || item.drawBan) {
      var fix = document.createElement('button'); fix.type = 'button';
      fix.textContent = item.label + (item.edit ? ' 편집하기' : ' 반 그리기');
      fix.addEventListener('click', function () {
        if (isDrawing || isPickingParcel) { status.textContent = '현재 그리기 또는 필지 선택을 먼저 마치세요.'; return; }
        oMap.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 18 });
        if (editingTarget) stopVertexEdit();
        if (item.edit) {
          document.getElementById('editTools').open = true;
          document.getElementById('editTargetSelect').value = item.edit;
          startVertexEdit();
        } else {
          document.getElementById('drawTools').open = true;
          setMode('ban'); document.getElementById('banParentTongSelect').value = item.drawBan;
          setDrawStatus('반 번호를 입력하고 그리기를 시작하세요.');
        }
      });
      document.getElementById('geometryResults').appendChild(fix);
    }
  });
  status.textContent = problems.length ? problems.join(' · ') : '겹침·상위 구역 이탈·자기 교차 없음 (공식 경계 정확도 검증 아님)';
});
document.getElementById('compareEdits').addEventListener('click', function () {
  if (comparisonLayer) { clearEditingOverlays(); document.getElementById('editingStatus').textContent = ''; return; }
  clearEditingOverlays();
  var status = document.getElementById('editingStatus');
  if (isDrawing || editPosition <= 0) { status.textContent = '비교할 이전 변경이 없습니다. 그리기를 먼저 완료하세요.'; return; }
  var previous = JSON.parse(editHistory[editPosition - 1]).shapes;
  comparisonLayer = L.featureGroup().addTo(oMap);
  function flatten(shapes) {
    var result = {};
    Object.keys(shapes).forEach(function (number) {
      result['unit:' + number] = shapes[number].rings;
      Object.keys(shapes[number].banShapes || {}).forEach(function (ban) { result['ban:' + number + ':' + ban] = shapes[number].banShapes[ban].rings; });
    });
    return result;
  }
  var before = flatten(previous), current = flatten(tongShapes);
  [before, current].forEach(function (shapes, index) {
    Object.keys(shapes).forEach(function (key) {
      if (before[key] && current[key] && JSON.stringify(before[key]) === JSON.stringify(current[key])) return;
      L.geoJSON({ type: 'MultiPolygon', coordinates: shapes[key].map(function (ring) { return [ring]; }) },
        { style: { color: index ? '#168454' : '#d43d38', weight: 3, fillOpacity: 0.12, dashArray: index ? null : '6 4' }, interactive: false }).addTo(comparisonLayer);
    });
  });
  status.textContent = comparisonLayer.getLayers().length ? '빨강 점선: 이전 · 초록: 현재' : '이전 변경에 경계 차이가 없습니다.';
});
document.getElementById('moveLabels').addEventListener('click', function () {
  if (isDrawing || editingTarget || isPickingParcel) { document.getElementById('editingStatus').textContent = '그리기와 점 편집을 먼저 종료하세요.'; return; }
  labelsMovable = !labelsMovable;
  this.setAttribute('aria-pressed', String(labelsMovable));
  renderAll();
  document.getElementById('editingStatus').textContent = labelsMovable ? '통·리 라벨을 구역 안에서 끌어 옮기세요.' : '';
});
