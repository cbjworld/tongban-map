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

document.getElementById('shareBundleBtn').addEventListener('click', function () {
  var data = buildTongJsonObject();
  var instructions = '통·리·반 지도 공유하기\r\n\r\n1. 압축을 풀어 tongban.json을 꺼냅니다.\r\n2. https://cbjworld.github.io/tongban-map/ 에서 통·리·반 JSON을 선택합니다.\r\n3. 편집하려면 지도 편집하기에서 JSON을 불러옵니다.\r\n\r\n이 파일에는 작성한 지도와 이름이 포함됩니다. 공유 전 내용을 확인하세요.\r\n';
  var url = URL.createObjectURL(makeShareZip([{ name: 'tongban.json', text: JSON.stringify(data, null, 2) }, { name: 'README.txt', text: instructions }]));
  var link = document.createElement('a'); link.href = url; link.download = 'tongban-map.zip';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  if (typeof noteWorkBackup === 'function') noteWorkBackup();
});
