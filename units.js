var unitType = 'tong';
function unitLabel() { return unitType === 'ri' ? '리' : '통'; }
function unitName(number) {
  var shape = tongShapes[number];
  return number + unitLabel() + (shape && shape.name ? ' · ' + shape.name : '');
}
function updateUnitLabels() {
  document.querySelectorAll('[data-unit-text]').forEach(function (element) {
    element.textContent = element.dataset.unitText.replaceAll('{unit}', unitLabel());
  });
  document.getElementById('tongNumInput').placeholder = unitLabel() + ' 번호';
  document.getElementById('assignTongInput').placeholder = '편입할 ' + unitLabel() + ' 번호';
  document.getElementById('unitTypeSelect').value = unitType;
  document.title = unitLabel() + '·반 경계 편집기';
}
document.getElementById('unitTypeSelect').addEventListener('change', function () {
  unitType = this.value;
  updateUnitLabels();
  renderAll();
});
window.addEventListener('beforeunload', function (event) {
  if (Object.keys(tongShapes).length || boundaryRing || isDrawing) { event.preventDefault(); event.returnValue = ''; }
});
