var workReady = false;
var workRaw = null;
var workContent = '';
var workTimer;
var workBlocked = false;
function workStatus(message) { document.getElementById('workStatus').textContent = message; }
function workSnapshot() {
  return JSON.stringify({ version: 1, data: buildTongJsonObject(), draft: isDrawing ? {
    mode: mode, points: drawPoints, tong: document.getElementById('tongNumInput').value,
    parent: document.getElementById('banParentTongSelect').value, ban: document.getElementById('banNumInput').value
  } : null });
}
function saveLocalWork() {
  clearTimeout(workTimer);
  if (!workReady || !activeRegion) return !workBlocked;
  try {
    if (workBlocked) throw new Error('복구 실패 · 원본 저장본은 보존됩니다');
    var content = workSnapshot();
    var key = workPrefix + activeRegion.code;
    if (localStorage.getItem(key) !== workRaw) throw new Error('다른 탭에서 변경됨 · JSON 백업 후 새로고침하세요');
    if (content !== workContent) {
      parseMapData(JSON.parse(content).data);
      localStorage.setItem(key, content);
      workRaw = content;
      workContent = content;
    }
    localStorage.setItem(workPrefix + 'last', activeRegion.code);
    workStatus('이 브라우저에 저장됨');
    return true;
  } catch (error) {
    workStatus('자동 저장 실패: ' + error.message + ' · JSON으로 저장하세요');
    return false;
  }
}
function scheduleLocalWork() {
  if (!workReady) return;
  if (typeof recordEdit === 'function') recordEdit();
  workStatus('저장 중…');
  clearTimeout(workTimer);
  workTimer = setTimeout(saveLocalWork, 300);
}
function restoreLocalWork() {
  workReady = false;
  workBlocked = false;
  workRaw = null;
  try {
    var saved = readLocalWork(activeRegion.code);
    if (saved) {
      workRaw = saved.raw;
      var work = saved.value;
      tongShapes = work.parsed.shapes;
      boundaryFeature = work.parsed.head.BOUNDARY || boundaryFeature;
      boundaryRing = null;
      unitType = work.parsed.head.UNIT_TYPE || unitType;
      document.getElementById('dongNameInput').value = work.parsed.head.DONG_NAME;
      updateUnitLabels();
      renderAll();
      if (work.draft) {
        setMode(work.draft.mode);
        startDrawing();
        drawPoints = work.draft.points;
        document.getElementById('tongNumInput').value = work.draft.tong || '';
        document.getElementById('banParentTongSelect').value = work.draft.parent || '';
        document.getElementById('banNumInput').value = work.draft.ban || '';
        refreshDrawPreview();
        document.getElementById('drawUndoBtn').disabled = !drawPoints.length;
        document.getElementById('drawFinishBtn').disabled = drawPoints.length < 3;
      }
    }
    workContent = saved ? workSnapshot() : '';
    localStorage.setItem(workPrefix + 'last', activeRegion.code);
    workStatus(saved ? '내 작업 복구됨' : '변경 내용은 이 브라우저에 자동 저장');
  } catch (error) {
    workBlocked = true;
    workStatus('자동 복구 실패: ' + error.message + ' · 기존 저장본 유지');
  }
  workReady = true;
  if (typeof resetEditHistory === 'function') resetEditHistory();
}
document.getElementById('panel').addEventListener('input', scheduleLocalWork);
document.getElementById('panel').addEventListener('change', scheduleLocalWork);
document.addEventListener('visibilitychange', function () { if (document.hidden) saveLocalWork(); });
window.addEventListener('pagehide', saveLocalWork);
