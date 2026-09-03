import test from 'node:test';
import assert from 'node:assert/strict';
import { browserRectToSvgSpace, buildAutoPairOffsets, buildAutoRingLayout, columnLOutlinePoints, ConnectionEngine, isConnectionTool, LINE_COLOR_PALETTE, lPatternOutlinePoints, normalizeManualConnectionChains, roundedPolygonPath, shouldEndConnectionChain, trimConnectionToRings, visibleConnectionColor } from '../js/connectionEngine.js';

test('Present endpoints complete a connection chain', () => {
  assert.equal(shouldEndConnectionChain('present'), true);
  assert.equal(shouldEndConnectionChain('next'), true);
  assert.equal(shouldEndConnectionChain('present', 'freeform-line'), false);
  assert.equal(shouldEndConnectionChain('past'), false);
  assert.equal(shouldEndConnectionChain(''), false);
  assert.equal(isConnectionTool('freeform-line'), true);
});

test('Free Form continues through Present until explicitly completed', () => {
  globalThis.window = { addEventListener() {}, app: { showToast() {} } };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const makeCell = (cellId, role) => ({
    dataset: { cellId, role },
    classList: { add() {}, remove() {} },
    closest() { return this; }
  });
  const engine = new ConnectionEngine({}, {});
  engine.setTool('freeform-line');

  engine.handleCellClick(makeCell('past-a', 'past'), 'past-a');
  engine.handleCellClick(makeCell('present-a', 'present'), 'present-a');
  assert.equal(engine.startNodeCell.dataset.cellId, 'present-a');

  engine.handleCellClick(makeCell('history-b', 'history'), 'history-b');
  assert.equal(engine.manualLines.length, 2);
  assert.equal(engine.startNodeCell.dataset.cellId, 'history-b');
  assert.equal(engine.completeConnection(), true);
  assert.equal(engine.startNodeCell, null);
  assert.equal(engine.completeConnection(), false);
});

test('multiple Past-to-Present connections start as independent lines', () => {
  globalThis.window = { addEventListener() {}, app: { showToast() {} } };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};

  const makeCell = (cellId, role) => ({
    dataset: { cellId, role },
    classList: { add() {}, remove() {} },
    closest() { return this; }
  });
  const engine = new ConnectionEngine({}, {});
  engine.setTool('connect-line');

  engine.handleCellClick(makeCell('past-a', 'past'), 'past-a');
  engine.handleCellClick(makeCell('present-a', 'present'), 'present-a');
  assert.equal(engine.startNodeCell, null);

  engine.handleCellClick(makeCell('past-b', 'past'), 'past-b');
  engine.handleCellClick(makeCell('present-b', 'present'), 'present-b');
  assert.equal(engine.startNodeCell, null);
  assert.equal(engine.manualLines.length, 2);
  assert.deepEqual(engine.manualLines.map(line => [line.fromCellId, line.toCellId]), [
    ['past-a', 'present-a'],
    ['past-b', 'present-b']
  ]);
  assert.deepEqual(engine.manualLines.map(line => line.color), [
    LINE_COLOR_PALETTE[0],
    LINE_COLOR_PALETTE[0]
  ]);
  assert.equal(engine.selectedColor, LINE_COLOR_PALETTE[0]);
});

test('choosing a palette color keeps that color until the user changes it', () => {
  globalThis.window = { addEventListener() {} };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const engine = new ConnectionEngine({}, {});
  engine.setColor('#b66b2c');
  assert.equal(engine.takeNextLineColor(), '#b66b2c');
  assert.equal(engine.takeNextLineColor(), '#b66b2c');
  engine.setColor('#9b4f62');
  assert.equal(engine.takeNextLineColor(), '#9b4f62');
});

test('connection palette excludes low-contrast Indigo and upgrades legacy Indigo lines', () => {
  assert.equal(LINE_COLOR_PALETTE.includes('#6366f1'), false);
  assert.equal(visibleConnectionColor('#6366f1'), '#187458');
});

test('every segment in one chained connection keeps the same color', () => {
  globalThis.window = { addEventListener() {}, app: { showToast() {} } };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const makeCell = (cellId, role) => ({
    dataset: { cellId, role },
    classList: { add() {}, remove() {} },
    closest() { return this; }
  });
  const engine = new ConnectionEngine({}, {});
  engine.setTool('connect-line');

  engine.handleCellClick(makeCell('history-a', 'history'), 'history-a');
  engine.handleCellClick(makeCell('past-a', 'past'), 'past-a');
  engine.handleCellClick(makeCell('present-a', 'present'), 'present-a');
  assert.deepEqual(engine.manualLines.map(line => line.color), [
    LINE_COLOR_PALETTE[0],
    LINE_COLOR_PALETTE[0]
  ]);
  assert.equal(engine.manualLines[0].connectionId, engine.manualLines[1].connectionId);

  engine.handleCellClick(makeCell('past-b', 'past'), 'past-b');
  engine.handleCellClick(makeCell('present-b', 'present'), 'present-b');
  assert.equal(engine.manualLines[2].color, LINE_COLOR_PALETTE[0]);
  assert.notEqual(engine.manualLines[2].connectionId, engine.manualLines[1].connectionId);
});

test('legacy connected segments migrate to one current chain color', () => {
  const migrated = normalizeManualConnectionChains([
    { id: 'old-1', fromCellId: 'history-5', toCellId: 'past-2', color: '#ec4899' },
    { id: 'old-2', fromCellId: 'past-2', toCellId: 'present-3', color: '#f59e0b' },
    { id: 'old-3', fromCellId: 'past-4', toCellId: 'present-5', color: '#10b981' }
  ]);

  assert.equal(migrated[0].connectionId, migrated[1].connectionId);
  assert.equal(migrated[0].color, '#9b4f62');
  assert.equal(migrated[1].color, '#9b4f62');
  assert.notEqual(migrated[1].connectionId, migrated[2].connectionId);
  assert.equal(migrated[2].color, '#187458');
});

test('manual connection endpoints stop at the outside of their number rings', () => {
  const points = trimConnectionToRings(
    { x: 0, y: 0, radius: 10 },
    { x: 100, y: 0, radius: 20 }
  );
  assert.deepEqual(points, {
    start: { x: 10, y: 0, radius: 10 },
    end: { x: 80, y: 0, radius: 20 }
  });
});

test('browser rectangles are converted back into SVG coordinates after CSS zoom', () => {
  const converted = browserRectToSvgSpace(
    { left: 220, top: 132, right: 264, bottom: 176, width: 44, height: 44 },
    { left: 110, top: 55, width: 550, height: 440 },
    500,
    400
  );
  assert.ok(Math.abs(converted.left - 100) < 0.0001);
  assert.ok(Math.abs(converted.top - 70) < 0.0001);
  assert.ok(Math.abs(converted.right - 140) < 0.0001);
  assert.ok(Math.abs(converted.bottom - 110) < 0.0001);
  assert.ok(Math.abs(converted.width - 40) < 0.0001);
  assert.ok(Math.abs(converted.height - 40) < 0.0001);
});

test('overlapping automatic scenarios get concentric rings and separated paths', () => {
  const lines = [
    { id: 'auto-match-a-b', fromCellId: 'a', toCellId: 'b', patternType: 'match', isAuto: true },
    { id: 'auto-vrun-a-b', fromCellId: 'a', toCellId: 'b', patternType: 'vertical', isAuto: true }
  ];
  const rings = buildAutoRingLayout(lines);
  const offsets = buildAutoPairOffsets(lines);

  assert.deepEqual(rings.get('match:a'), { index: 0, count: 2 });
  assert.deepEqual(rings.get('vertical:a'), { index: 1, count: 2 });
  assert.equal(offsets.get('match:a:b'), -3);
  assert.equal(offsets.get('vertical:a:b'), 3);
});

test('boxed L-pattern shapes do not also allocate line endpoint rings', () => {
  const rings = buildAutoRingLayout([
    {
      id: 'auto-math-l-left-a-b-c',
      fromCellId: 'b',
      toCellId: 'c',
      sequenceCellIds: ['a', 'b', 'c'],
      patternType: 'math-l-pattern',
      isAuto: true
    }
  ]);

  assert.equal(rings.size, 0);
});

test('three-draw sister-output paths do not allocate endpoint rings', () => {
  const rings = buildAutoRingLayout([
    {
      id: 'auto-math-sister-output-right-a-b-c',
      fromCellId: 'a',
      toCellId: 'c',
      sequenceCellIds: ['a', 'b', 'c'],
      patternType: 'math-sister-output',
      hideNodeRings: true,
      isAuto: true
    }
  ]);

  assert.equal(rings.size, 0);
});

test('L-pattern outlines exclude the unused fourth corner on either output side', () => {
  const leftSource = { left: 0, top: 0, right: 10, bottom: 10 };
  const rightSource = { left: 20, top: 0, right: 30, bottom: 10 };
  const leftOutput = { left: 0, top: 20, right: 10, bottom: 30 };
  const rightOutput = { left: 20, top: 20, right: 30, bottom: 30 };

  assert.deepEqual(lPatternOutlinePoints([leftSource, rightSource, leftOutput], 'left', 2), [
    { x: -2, y: -2 }, { x: 32, y: -2 }, { x: 32, y: 12 },
    { x: 12, y: 12 }, { x: 12, y: 32 }, { x: -2, y: 32 }
  ]);
  assert.deepEqual(lPatternOutlinePoints([leftSource, rightSource, rightOutput], 'right', 2), [
    { x: -2, y: -2 }, { x: 32, y: -2 }, { x: 32, y: 32 },
    { x: 18, y: 32 }, { x: 18, y: 12 }, { x: -2, y: 12 }
  ]);
});

test('inverted L outlines keep a vertical stem and a side foot', () => {
  const stemTop = { left: 10, top: 0, right: 20, bottom: 10 };
  const stemBottom = { left: 10, top: 20, right: 20, bottom: 30 };
  const lowerRight = { left: 30, top: 20, right: 40, bottom: 30 };
  const lowerLeft = { left: 0, top: 20, right: 8, bottom: 30 };

  assert.deepEqual(columnLOutlinePoints([stemTop, stemBottom, lowerRight], 'lower-right', 2), [
    { x: 8, y: -2 }, { x: 22, y: -2 }, { x: 22, y: 18 },
    { x: 42, y: 18 }, { x: 42, y: 32 }, { x: 8, y: 32 }
  ]);
  assert.deepEqual(columnLOutlinePoints([stemTop, stemBottom, lowerLeft], 'lower-left', 2), [
    { x: 8, y: -2 }, { x: 22, y: -2 }, { x: 22, y: 32 },
    { x: -2, y: 32 }, { x: -2, y: 18 }, { x: 8, y: 18 }
  ]);
});

test('boxed inverted-L shapes do not also allocate line endpoint rings', () => {
  const rings = buildAutoRingLayout([
    {
      id: 'auto-math-inverted-l-lower-right-a-b-c',
      fromCellId: 'a',
      toCellId: 'c',
      sequenceCellIds: ['a', 'b', 'c'],
      patternType: 'math-inverted-l',
      isAuto: true
    }
  ]);
  assert.equal(rings.size, 0);
});

test('L-pattern polygon paths round both outside and concave corners', () => {
  const path = roundedPolygonPath([
    { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 },
    { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }
  ], 3);

  assert.match(path, /^M /);
  assert.equal((path.match(/ Q /g) || []).length, 6);
  assert.match(path, /Q 10 10/);
  assert.match(path, / Z$/);
});
