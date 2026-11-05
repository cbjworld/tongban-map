var workReady = false;
var workRaw = null;
var workContent = '';
var workTimer;
var workBlocked = false;
function updateBackupNotice(changed) {
  if (!activeRegion) return;
  try {
    var key = workPrefix + 'backup:' + activeRegion.code;
    var started = Number(localStorage.getItem(key));
    if (!started && changed) { started = Date.now(); localStorage.setItem(key, String(started)); }
    document.getElementById('backupStatus').textContent = started && Date.now() - started >= 7 * 86400000 ? '작업을 JSON으로 백업해 주세요.' : '';
  } catch (error) { document.getElementById('backupStatus').textContent = 'JSON 백업을 권장합니다.'; }
}
function noteWorkBackup() {
  if (!activeRegion) return;
  try { localStorage.setItem(workPrefix + 'backup:' + activeRegion.code, String(Date.now())); } catch (error) { return; }
  updateBackupNotice(false);
}
function workStatus(message) { document.getElementById('workStatus').textContent = message; }
function workSnapshot() {
  return JSON.stringify({ version: 1, data: buildTongJsonObject(), draft: isDrawing ? {
    mode: mode, points: drawPoints, tong: document.getElementById('tongNumInput').value,
    parent: document.getElementById('banParentTongSelect').value, ban: document.getElementById('banNumInput').value
  } : null });
}
function workVersions() {
  var data = JSON.parse(localStorage.getItem(workPrefix + 'versions:' + activeRegion.code) || '[]');
  if (!Array.isArray(data) || data.some(function (entry) { return !entry || typeof entry.raw !== 'string' || !Number.isFinite(entry.at); })) throw new Error('이전 작업 목록 오류');
  return data;
}
function refreshWorkVersions() {
  var select = document.getElementById('restoreVersionSelect');
  select.replaceChildren(new Option('시점 선택', ''));
  if (!activeRegion) return;
  try {
    workVersions().forEach(function (entry, index) {
      select.add(new Option(new Date(entry.at).toLocaleString('ko-KR'), String(index)));
    });
  } catch (error) { document.getElementById('versionStatus').textContent = '이전 작업 목록을 읽지 못했습니다.'; }
}
function archiveWorkSnapshot(raw, force) {
  if (!raw || !activeRegion) return;
  try {
    parseLocalWork(raw, activeRegion.code);
    var entries = workVersions(), now = Date.now();
    if (entries.length && (entries[0].raw === raw || (!force && now - entries[0].at < 120000))) return;
    if (raw.length * 2 > 3 * 1024 * 1024) throw new Error('복구본 크기 초과');
    entries.unshift({ at: now, raw: raw });
    while (entries.length > 5 || JSON.stringify(entries).length * 2 > 3 * 1024 * 1024) entries.pop();
    if (!entries.length) throw new Error('복구본 크기 초과');
    localStorage.setItem(workPrefix + 'versions:' + activeRegion.code, JSON.stringify(entries));
    document.getElementById('versionStatus').textContent = '';
    refreshWorkVersions();
  } catch (error) { document.getElementById('versionStatus').textContent = '이전 시점 보관 실패 · JSON으로 백업하세요.'; }
}
function saveImportRecovery() {
  if (!workReady || !activeRegion || workBlocked) { workStatus('복구 준비가 안 되어 불러올 수 없습니다.'); return false; }
  try {
    if (localStorage.getItem(workPrefix + activeRegion.code) !== workRaw) throw new Error('다른 탭에서 변경됨');
    var snapshot = workSnapshot();
    parseLocalWork(snapshot, activeRegion.code);
    localStorage.setItem(workPrefix + 'recovery:' + activeRegion.code, snapshot);
    archiveWorkSnapshot(snapshot, true);
    return true;
  } catch (error) { workStatus('불러오기 전 복구본 저장 실패: ' + error.message + ' · JSON 백업을 확인하세요'); return false; }
}
function restoreWorkVersion(raw, message) {
  if (!workReady || !activeRegion || workBlocked) return;
  try {
    var saved = parseLocalWork(raw, activeRegion.code).value;
    if (!confirm(message + ' 현재 작업도 복구본으로 보관합니다.')) return;
    if (!saveImportRecovery()) return;
    if (editingTarget) stopVertexEdit();
    if (isDrawing) cancelDrawing();
    tongShapes = saved.parsed.shapes;
    boundaryFeature = saved.parsed.head.BOUNDARY || null; boundaryRing = null;
    unitType = saved.parsed.head.UNIT_TYPE || unitType;
    document.getElementById('dongNameInput').value = saved.parsed.head.DONG_NAME;
    updateUnitLabels(); markEdit('이전 작업 복구'); renderAll();
    if (saved.draft) {
      setMode(saved.draft.mode); startDrawing(); drawPoints = saved.draft.points;
      document.getElementById('tongNumInput').value = saved.draft.tong || '';
      document.getElementById('banParentTongSelect').value = saved.draft.parent || '';
      document.getElementById('banNumInput').value = saved.draft.ban || '';
      refreshDrawPreview();
      document.getElementById('drawUndoBtn').disabled = !drawPoints.length;
      document.getElementById('drawFinishBtn').disabled = drawPoints.length < 3;
    }
    if (saveLocalWork()) workStatus('이전 작업 복구됨');
  } catch (error) { workStatus('복구 실패: ' + error.message + ' · 기존 작업 유지'); }
}
document.getElementById('restoreImport').addEventListener('click', function () {
  if (!workReady || !activeRegion || workBlocked) return;
  try {
    var raw = localStorage.getItem(workPrefix + 'recovery:' + activeRegion.code);
    if (!raw) { workStatus('이 지역에 불러오기 전 복구본이 없습니다.'); return; }
    restoreWorkVersion(raw, '불러오기 전 작업으로 복구할까요?');
  } catch (error) { workStatus('복구본을 읽지 못했습니다.'); }
});
document.getElementById('restoreVersion').addEventListener('click', function () {
  if (!workReady || !activeRegion || workBlocked) return;
  try {
    var value = document.getElementById('restoreVersionSelect').value;
    var selected = value !== '' && workVersions()[Number(value)];
    if (!selected) { workStatus('복구할 시점을 선택하세요.'); return; }
    restoreWorkVersion(selected.raw, new Date(selected.at).toLocaleString('ko-KR') + ' 작업으로 복구할까요?');
  } catch (error) { workStatus('이전 작업 목록을 읽지 못했습니다.'); }
});
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
      var previous = workRaw;
      localStorage.setItem(key, content);
      workRaw = content;
      workContent = content;
      archiveWorkSnapshot(previous, false);
      updateBackupNotice(true);
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
  refreshWorkVersions();
  updateBackupNotice(false);
  if (typeof resetEditHistory === 'function') resetEditHistory();
}
document.getElementById('panel').addEventListener('input', scheduleLocalWork);
document.getElementById('panel').addEventListener('change', scheduleLocalWork);
document.addEventListener('visibilitychange', function () { if (document.hidden) saveLocalWork(); });
window.addEventListener('pagehide', saveLocalWork);
