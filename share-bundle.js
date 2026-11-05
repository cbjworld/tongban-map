function makeShareZip(files) {
  var encoder = new TextEncoder(), parts = [], directory = [], offset = 0;
  function header(size) { var bytes = new Uint8Array(size); return { bytes: bytes, view: new DataView(bytes.buffer) }; }
  files.forEach(function (file) {
    var name = encoder.encode(file.name), data = encoder.encode(file.text), crc = 0xffffffff;
    data.forEach(function (byte) { crc ^= byte; for (var i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); });
    crc = (crc ^ 0xffffffff) >>> 0;
    var local = header(30), central = header(46);
    local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x800, true);
    local.view.setUint32(14, crc, true); local.view.setUint32(18, data.length, true); local.view.setUint32(22, data.length, true); local.view.setUint16(26, name.length, true);
    central.view.setUint32(0, 0x02014b50, true); central.view.setUint16(4, 20, true); central.view.setUint16(6, 20, true); central.view.setUint16(8, 0x800, true);
    central.view.setUint32(16, crc, true); central.view.setUint32(20, data.length, true); central.view.setUint32(24, data.length, true); central.view.setUint16(28, name.length, true); central.view.setUint32(42, offset, true);
    parts.push(local.bytes, name, data); directory.push(central.bytes, name);
    offset += local.bytes.length + name.length + data.length;
  });
  var directorySize = directory.reduce(function (sum, part) { return sum + part.length; }, 0);
  var end = header(22);
  end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, files.length, true); end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, directorySize, true); end.view.setUint32(16, offset, true);
  return new Blob(parts.concat(directory, [end.bytes]), { type: 'application/zip' });
}

function downloadShareZip(files, filename) {
  var url = URL.createObjectURL(makeShareZip(files));
  var link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}
document.getElementById('shareBundleBtn').addEventListener('click', function () {
  var data = buildTongJsonObject();
  var instructions = '통·리·반 지도 공유하기\r\n\r\n1. 압축을 풀어 tongban.json을 꺼냅니다.\r\n2. https://cbjworld.github.io/tongban-map/ 에서 통·리·반 JSON을 선택합니다.\r\n3. 편집하려면 지도 편집하기에서 JSON을 불러옵니다.\r\n\r\n이 파일에는 작성한 지도와 이름이 포함됩니다. 공유 전 내용을 확인하세요.\r\n';
  downloadShareZip([{ name: 'tongban.json', text: JSON.stringify(data, null, 2) }, { name: 'README.txt', text: instructions }], 'tongban-map.zip');
  if (typeof noteWorkBackup === 'function') noteWorkBackup();
});
document.getElementById('exportAllBtn').addEventListener('click', function () {
  if (!workReady || !saveLocalWork()) return;
  try {
    var codes = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i), code = key && key.startsWith(workPrefix) ? key.slice(workPrefix.length) : '';
      if (/^\d{10}$/.test(code)) codes.push(code);
    }
    codes.sort();
    if (!codes.length) { workStatus('백업할 지역이 없습니다.'); return; }
    var files = [], drafts = 0;
    codes.forEach(function (code) {
      var saved;
      try { saved = readLocalWork(code); } catch (error) { throw new Error(code + ' 지역의 저장본을 읽을 수 없습니다.'); }
      if (!saved) throw new Error(code + ' 지역의 저장본이 사라졌습니다.');
      files.push({ name: 'maps/' + code + '.json', text: JSON.stringify(saved.value.data, null, 2) });
      if (saved.value.draft) { drafts++; files.push({ name: 'drafts/' + code + '.json', text: saved.raw }); }
    });
    var instructions = '모든 지역 백업\r\n\r\nmaps 폴더에는 완성된 지도 JSON이 지역 코드별로 저장됩니다.\r\n편집기에서 해당 지역을 선택한 후 JSON을 불러오세요. 뷰어에서도 지도 JSON을 열 수 있습니다.\r\ndrafts 폴더에는 완성되지 않은 그리기를 포함한 작업이 있습니다. 편집기에서 같은 지역을 선택하고 해당 파일을 불러오면 이어서 그릴 수 있습니다.\r\n브라우저에 저장된 작업만 포함되며 필지 원본과 이전 복구 이력은 포함되지 않습니다.\r\n파일에는 작성한 이름과 경계가 포함됩니다. 공유 전 내용을 확인하세요.\r\n';
    files.unshift({ name: 'README.txt', text: instructions });
    downloadShareZip(files, 'tongban-all-regions.zip');
    workStatus(codes.length + '개 지역 백업 · 작성 중인 경계 ' + drafts + '개 포함');
  } catch (error) { workStatus('전체 백업 실패: ' + error.message + ' 기존 작업은 그대로 보관됩니다.'); }
});
