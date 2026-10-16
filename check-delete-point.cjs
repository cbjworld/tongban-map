const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

for (const file of ['editor_template.html']) {
  const source = fs.readFileSync(path.join(__dirname, 'src', file), 'utf8');
  const triangle = [[0, 0], [1, 0], [0, 1], [0, 0]];
  const square = [[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]];
  for (const kind of ['boundary', 'tong', 'ban']) {
    for (const multipart of kind === 'boundary' ? [false] : [false, true]) {
      const rings = structuredClone(multipart ? [triangle, square] : [triangle]);
      const context = {
        editingTarget: { kind, tongNum: 1, banNum: 2 },
        selectedVertex: { partIndex: 0, vertexIndex: 0 },
        boundaryRing: rings[0],
        tongShapes: { 1: { rings, banShapes: { 2: { rings } } }, 9: { rings: [square] } },
        document: { getElementById: () => ({ disabled: false }) },
        renderAll() {},
        afterVertexChange() { context.changed = true; },
        stopVertexEdit() { context.editingTarget = null; context.selectedVertex = null; },
        setEditStatus() {},
      };
      vm.createContext(context);
      for (const name of ['getEditingRings', 'deleteSelectedPoint']) {
        const start = source.indexOf('function ' + name + '(');
        const end = source.indexOf('\nfunction ', start + 1);
        vm.runInContext(source.slice(start, end), context);
      }
      vm.runInContext('deleteSelectedPoint()', context);
      assert.ok(context.tongShapes[9]);
      if (multipart) {
        assert.equal(rings.length, 1);
        assert.deepEqual(rings[0], square);
        assert.equal(context.selectedVertex, null);
      } else {
        assert.equal(context.editingTarget, null);
        if (kind === 'boundary') assert.equal(context.boundaryRing, null);
        if (kind === 'tong') assert.equal(context.tongShapes[1], undefined);
        if (kind === 'ban') assert.equal(context.tongShapes[1].banShapes[2], undefined);
      }
    }
  }
  console.log('PASS', file, 'triangle deletion and multipart preservation');
}
