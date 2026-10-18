var batchVersion = 0;
var batchRunning = false;
var batchRows = [];
var batchResults = [];
['sidoSelect', 'sggSelect'].forEach(function (id) {
  document.getElementById(id).addEventListener('change', clearAddressSearch);
});
function parseAddressCsv(text) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (text.length > 65536 || /[\u0000\uFFFD]/.test(text)) throw new Error('UTF-8 CSV, 64KiB 이하 파일을 사용하세요.');
  var rows = [], cell = '', quoted = false, closed = false;
  for (var index = 0; index < text.length; index++) {
    var character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (character === '"') { quoted = false; closed = true; }
      else cell += character;
    } else if (character === '\n') {
      rows.push(cell.trim()); cell = ''; closed = false;
    } else if (character === ',' || (closed && character.trim()) || (character === '"' && cell)) {
      throw new Error('주소 열 하나만 사용하고 쉼표가 포함된 주소는 큰따옴표로 감싸세요.');
    } else if (character === '"' && !closed) quoted = true;
    else if (!closed) cell += character;
  }
  if (quoted) throw new Error('CSV 큰따옴표가 닫히지 않았습니다.');
  if (cell.trim() || closed) rows.push(cell.trim());
  if (!/^(주소|address)$/i.test(rows.shift() || '')) throw new Error('첫 줄에 주소 또는 address 열 이름이 필요합니다.');
  rows = rows.filter(function (row) { return row; });
  if (!rows.length || rows.length > 100 || rows.some(function (row) { return row.length > 300 || /[\n\t]/.test(row); })) {
    throw new Error('주소는 1~100건, 각 300자 이하의 한 줄이어야 합니다.');
  }
  return rows;
}
function batchStatus(message) { document.getElementById('batchStatus').textContent = message; }
function updateBatchButtons() {
  document.getElementById('batchStart').disabled = batchRunning;
  document.getElementById('batchCancel').disabled = !batchRunning;
  document.getElementById('batchExport').disabled = batchRunning || !batchResults.length;
}
function stopBatchSearch() {
  batchVersion++;
  if (batchRunning && addressCancel) addressCancel();
  batchRunning = false;
  updateBatchButtons();
}
function resetBatchSearch() {
  stopBatchSearch();
  batchResults = [];
  batchStatus('');
  updateBatchButtons();
}
document.getElementById('batchFile').addEventListener('change', async function () {
  resetBatchSearch();
  batchRows = [];
  var file = this.files[0];
  var version = batchVersion;
  if (!file) return;
  try {
    if (file.size > 65536) throw new Error('64KiB 이하 CSV 파일을 사용하세요.');
    var text = await file.text();
    if (version !== batchVersion) return;
    batchRows = parseAddressCsv(text);
    batchStatus(batchRows.length + '건 준비됨 · 아직 전송하지 않았습니다.');
  } catch (error) { if (version === batchVersion) batchStatus(error.message); }
});
document.getElementById('batchStart').addEventListener('click', async function () {
  clearAddressSearch();
  var key = document.getElementById('addressKey').value.trim();
  if (!viewerData || !Object.keys(viewerData.shapes).length) { batchStatus('먼저 작성한 통·리·반 지도를 불러오세요.'); return; }
  if (!key || !batchRows.length) { batchStatus('인증키와 주소 CSV를 준비하세요.'); return; }
  var version = batchVersion;
  var data = viewerData;
  var rows = batchRows.slice();
  var type = document.getElementById('addressType').value;
  var cache = new Map();
  batchRunning = true;
  updateBatchButtons();
  for (var index = 0; index < rows.length; index++) {
    if (version !== batchVersion || data !== viewerData) return;
    batchStatus((index + 1) + '/' + rows.length + ' 조회 중…');
    var result = cache.get(rows[index]);
    if (!result) {
      try {
        var coordinates = await geocodeAddress(rows[index], type, key);
        if (version !== batchVersion || data !== viewerData) return;
        result = [rows[index], locateAddress(turf.point(coordinates), data), '참고 판정'];
      } catch (error) {
        if (version !== batchVersion || data !== viewerData) return;
        result = [rows[index], '', error.message];
        if (error.code !== 'NOT_FOUND') {
          batchResults.push(result);
          batchRunning = false;
          updateBatchButtons();
          batchStatus('오류로 중단 · ' + batchResults.length + '/' + rows.length + '건 처리 · ' + error.message);
          return;
        }
      }
      cache.set(rows[index], result);
      batchResults.push(result);
      if (index < rows.length - 1) await new Promise(function (resolve) { setTimeout(resolve, 500); });
    } else batchResults.push(result);
  }
  if (version !== batchVersion) return;
  batchRunning = false;
  updateBatchButtons();
  batchStatus(batchResults.length + '건 처리 완료 · 결과를 저장하세요.');
});
document.getElementById('batchCancel').addEventListener('click', function () {
  stopBatchSearch();
  batchStatus('취소됨 · 완료된 ' + batchResults.length + '건만 저장할 수 있습니다.');
});
document.getElementById('batchClear').addEventListener('click', function () {
  resetBatchSearch();
  batchRows = [];
  document.getElementById('batchFile').value = '';
});
document.getElementById('batchExport').addEventListener('click', function () {
  if (batchRunning || !batchResults.length) return;
  var csv = '\uFEFF' + [['주소', '통·리·반', '상태']].concat(batchResults).map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
  var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  var link = document.createElement('a');
  link.href = url; link.download = 'address-tongban.csv';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
});
var printView = null;
window.addEventListener('beforeprint', function () {
  if (!viewerMap) return;
  if (!printView) printView = { center: viewerMap.getCenter(), zoom: viewerMap.getZoom(), bounds: viewerMap.getBounds() };
  document.getElementById('printTitle').textContent = document.getElementById('viewerTitle').textContent || '통·리·반 지도';
  viewerMap.closePopup();
  viewerMap.invalidateSize({ animate: false });
  viewerMap.fitBounds(printView.bounds, { animate: false });
  if (viewerLayers) viewerLayers.eachLayer(function (layer) { if (layer.openTooltip) layer.openTooltip(); });
});
window.addEventListener('afterprint', function () {
  if (!printView) return;
  viewerMap.invalidateSize({ animate: false });
  viewerMap.setView(printView.center, printView.zoom, { animate: false });
  printView = null;
  if (viewerLayers) viewerLayers.eachLayer(function (layer) {
    if (layer.getTooltip && layer.getTooltip() && !layer.getTooltip().options.permanent) layer.closeTooltip();
  });
});
document.getElementById('printMap').addEventListener('click', function () {
  if (viewerMap) window.print();
});
