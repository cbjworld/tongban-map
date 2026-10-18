var editHistory = [];
var editPosition = -1;
var applyingEdit = false;
function editSnapshot() {
  return JSON.stringify({ shapes: tongShapes, boundary: boundaryFeature, ring: boundaryRing,
    unit: unitType, name: document.getElementById('dongNameInput').value });
}
function updateHistoryButtons() {
  document.getElementById('historyUndo').disabled = editPosition <= 0;
  document.getElementById('historyRedo').disabled = editPosition >= editHistory.length - 1;
}
function resetEditHistory() {
  editHistory = [editSnapshot()];
  editPosition = 0;
  document.getElementById('editingStatus').textContent = '';
  updateHistoryButtons();
}
function recordEdit() {
  if (applyingEdit || !workReady || workBlocked) return;
  var snapshot = editSnapshot();
  if (snapshot === editHistory[editPosition]) return;
  editHistory = editHistory.slice(0, editPosition + 1);
  editHistory.push(snapshot);
  var size = editHistory.reduce(function (total, item) { return total + item.length * 2; }, 0);
  while (editHistory.length > 1 && (editHistory.length > 50 || size > 5 * 1024 * 1024)) size -= editHistory.shift().length * 2;
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
  applyingEdit = true;
  try {
    if (editingTarget) stopVertexEdit();
    if (isPickingParcel) togglePickMode();
    clearOnlineParcels();
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
function inspectMapGeometry(shapes) {
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
        if (intersection && turf.area(intersection) > 0.01) problems.push(entry.label + ' / ' + other.label + ' 겹침');
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
      var children = [];
      Object.keys(shapes[number].banShapes || {}).forEach(function (ban) {
        var childLabel = label + ' ' + ban + '반';
        try {
          var child = geometry(shapes[number].banShapes[ban].rings);
          if (!child) { problems.push(childLabel + ' 경계 없음'); return; }
          children.push({ label: childLabel, feature: child });
          var outside = turf.difference(turf.featureCollection([child, parent]));
          if (outside && turf.area(outside) > 0.01) problems.push(childLabel + ' 상위 구역 밖');
        } catch (error) { problems.push(childLabel + ' 검사 실패 · 경계 형식을 확인하세요'); }
      });
      overlaps(children);
    } catch (error) { problems.push(label + ' 검사 실패 · 자기 교차 또는 경계 형식을 확인하세요'); }
  });
  try { overlaps(parents); } catch (error) { problems.push('구역 간 겹침 검사 실패'); }
  return problems;
}
document.getElementById('historyUndo').addEventListener('click', function () { moveEditHistory(-1); });
document.getElementById('historyRedo').addEventListener('click', function () { moveEditHistory(1); });
document.getElementById('checkGeometry').addEventListener('click', function () {
  var status = document.getElementById('editingStatus');
  if (!workReady) return;
  if (!Object.keys(tongShapes).length) { status.textContent = '검사할 구역이 없습니다.'; return; }
  var problems = inspectMapGeometry(tongShapes);
  status.textContent = problems.length ? problems.join(' · ') : '겹침·상위 구역 이탈·자기 교차 없음 (공식 경계 정확도 검증 아님)';
});
