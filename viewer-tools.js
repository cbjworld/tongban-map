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
