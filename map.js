function createMap(container) {
  var map = L.map(container, { zoomControl: false }).setView([37.53745, 127.00595], 16);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).addTo(map);
  return map;
}

function mapPathOptions(options) {
  var pane = 'geometry-' + (options.zIndex || 0);
  if (!options.map.getPane(pane)) {
    options.map.createPane(pane).style.zIndex = 400 + (options.zIndex || 0);
  }
  return {
    pane: pane, interactive: false,
    weight: options.strokeWeight, color: options.strokeColor,
    opacity: options.strokeOpacity, fillColor: options.fillColor,
    fillOpacity: options.fillOpacity,
    dashArray: options.strokeStyle === 'shortdash' ? '5 5' : null
  };
}

function mapPolygon(options) {
  return L.polygon(options.path, mapPathOptions(options)).addTo(options.map);
}

function mapPolyline(options) {
  return L.polyline(options.path, mapPathOptions(options)).addTo(options.map);
}

function mapLabel(options) {
  return L.marker(options.position, {
    interactive: false, keyboard: false, zIndexOffset: options.zIndex || 0,
    icon: L.divIcon({ html: options.content, className: '', iconSize: [0, 0], iconAnchor: [0, 0] })
  });
}

function mapIcon(url, size, options) {
  return L.icon({ iconUrl: url, iconSize: [size.x, size.y], iconAnchor: [options.offset.x, options.offset.y] });
}

function mapMarker(options) {
  return L.marker(options.position, {
    icon: options.image, draggable: !!options.draggable,
    bubblingMouseEvents: false, zIndexOffset: options.zIndex || 0
  }).addTo(options.map);
}
