function moveSharedVertex(ring, vertexIndex, neighbors, point) {
  var tolerance = 1e-9;
  function same(a, b) { return Math.abs(a[0] - b[0]) < tolerance && Math.abs(a[1] - b[1]) < tolerance; }
  function onSegment(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < tolerance) return false;
    var projection = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length;
    return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / length < tolerance && projection >= -tolerance && projection <= length + tolerance;
  }
  function open(r) { return r.slice(0, -1).map(function (p) { return p.slice(); }); }
  function close(r) { return r.concat([r[0].slice()]); }
  var original = open(ring), p = original[vertexIndex];
  var adjacent = [original[(vertexIndex + original.length - 1) % original.length], original[(vertexIndex + 1) % original.length]];
  var updates = [];
  neighbors.forEach(function (other) {
    var vertices = open(other), matching = new Set(), insertAfter = -1;
    vertices.forEach(function (a, i) {
      var b = vertices[(i + 1) % vertices.length];
      if (!onSegment(p, a, b)) return;
      var sharesEdge = adjacent.some(function (q) {
        return (!same(q, p) && onSegment(q, a, b)) || (!same(a, p) && onSegment(a, p, q)) || (!same(b, p) && onSegment(b, p, q));
      });
      if (!sharesEdge) return;
      if (same(a, p)) matching.add(i);
      else if (same(b, p)) matching.add((i + 1) % vertices.length);
      else insertAfter = i;
    });
    matching.forEach(function (i) { vertices[i] = point.slice(); });
    if (insertAfter >= 0 && !matching.size) vertices.splice(insertAfter + 1, 0, point.slice());
    if (matching.size || insertAfter >= 0) updates.push({ ring: other, value: close(vertices) });
  });
  original[vertexIndex] = point.slice();
  updates.push({ ring: ring, value: close(original) });
  try {
    updates.forEach(function (update) {
      validateRings([update.value]);
      if (turf.kinks(turf.polygon([update.value])).features.length) throw new Error('경계가 교차합니다.');
    });
  } catch (error) { return false; }
  updates.forEach(function (update) { update.ring.length = 0; update.value.forEach(function (vertex) { update.ring.push(vertex); }); });
  return true;
}

function sharedVertexNeighbors(ring, index, neighbors) {
  var p = ring[index], count = ring.length - 1, epsilon = 1e-9;
  var adjacent = [ring[(index + count - 1) % count], ring[(index + 1) % count]];
  function same(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) < epsilon; }
  function on(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < epsilon) return false;
    var projection = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len;
    return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len < epsilon && projection >= -epsilon && projection <= len + epsilon;
  }
  return neighbors.filter(function (other) {
    return other.slice(1).some(function (b, i) {
      var a = other[i];
      return on(p, a, b) && adjacent.some(function (q) {
        return (!same(q, p) && on(q, a, b)) || (!same(a, p) && on(a, p, q)) || (!same(b, p) && on(b, p, q));
      });
    });
  });
}

function deleteSharedVertex(ring, index, neighbors) {
  var shared = sharedVertexNeighbors(ring, index, neighbors), point = ring[index];
  if (!shared.length) return null;
  var target = ring.slice(0, -1).map(function (p) { return p.slice(); });
  target.splice(index, 1);
  if (target.length < 3) return false;
  target.push(target[0].slice());
  var updates = [{ ring: ring, value: target }];
  shared.forEach(function (other) {
    var open = other.slice(0, -1).map(function (p) { return p.slice(); });
    var i = open.findIndex(function (p) { return Math.hypot(p[0] - point[0], p[1] - point[1]) < 1e-9; });
    if (i >= 0) { open.splice(i, 1); updates.push({ ring: other, value: open.length ? open.concat([open[0].slice()]) : [] }); }
  });
  try {
    updates.forEach(function (update) {
      validateRings([update.value]);
      if (turf.kinks(turf.polygon([update.value])).features.length) throw new Error('교차 경계');
    });
    shared.forEach(function (other) {
      var changed = updates.find(function (update) { return update.ring === other; });
      var before = turf.union(turf.featureCollection([turf.polygon([ring]), turf.polygon([other])]));
      var after = turf.union(turf.featureCollection([turf.polygon([target]), turf.polygon([changed ? changed.value : other])]));
      var lost = turf.difference(turf.featureCollection([before, after]));
      var gained = turf.difference(turf.featureCollection([after, before]));
      if ((lost && turf.area(lost) > 0.01) || (gained && turf.area(gained) > 0.01)) throw new Error('공통 경계 변경');
      var oldOverlap = turf.intersect(turf.featureCollection([turf.polygon([ring]), turf.polygon([other])]));
      var newOverlap = turf.intersect(turf.featureCollection([turf.polygon([target]), turf.polygon([changed ? changed.value : other])]));
      if ((newOverlap ? turf.area(newOverlap) : 0) - (oldOverlap ? turf.area(oldOverlap) : 0) > 0.01) throw new Error('공통 경계 겹침');
    });
  } catch (error) { return false; }
  updates.forEach(function (update) { update.ring.length = 0; update.value.forEach(function (p) { update.ring.push(p); }); });
  return true;
}

function snapDrawingPoint(latlng) {
  if (!document.getElementById('snapEnabled').checked) return [latlng.lng, latlng.lat];
  var pointer = oMap.latLngToContainerPoint(latlng), best = null, exact = null, distance = matchMedia('(pointer: coarse)').matches ? 18 : 10;
  var vertexDistance = distance, vertex = null;
  function scan(ring) {
    for (var i = 1; i < ring.length; i++) {
      var a = oMap.latLngToContainerPoint([ring[i - 1][1], ring[i - 1][0]]), b = oMap.latLngToContainerPoint([ring[i][1], ring[i][0]]);
      if (pointer.distanceTo(a) < vertexDistance) { vertexDistance = pointer.distanceTo(a); vertex = ring[i - 1]; }
      if (pointer.distanceTo(b) < vertexDistance) { vertexDistance = pointer.distanceTo(b); vertex = ring[i]; }
      var closest = L.LineUtil.closestPointOnSegment(pointer, a, b), delta = pointer.distanceTo(closest);
      if (delta < distance) {
        distance = delta; best = closest;
        var ratio = a.distanceTo(b) ? a.distanceTo(closest) / a.distanceTo(b) : 0;
        exact = [ring[i - 1][0] + (ring[i][0] - ring[i - 1][0]) * ratio, ring[i - 1][1] + (ring[i][1] - ring[i - 1][1]) * ratio];
      }
    }
  }
  Object.keys(tongShapes).forEach(function (number) {
    var shape = tongShapes[number]; shape.rings.forEach(scan);
    Object.keys(shape.banShapes || {}).forEach(function (ban) { shape.banShapes[ban].rings.forEach(scan); });
  });
  if (boundaryRing) scan(boundaryRing);
  if (boundaryFeature) {
    var polygons = boundaryFeature.geometry.type === 'Polygon' ? [boundaryFeature.geometry.coordinates] : boundaryFeature.geometry.coordinates;
    polygons.forEach(function (polygon) { polygon.forEach(scan); });
  }
  if (vertex) return vertex.slice();
  if (!best) return [latlng.lng, latlng.lat];
  if (exact) return exact.slice();
  var result = oMap.containerPointToLatLng(best);
  return [result.lng, result.lat];
}
