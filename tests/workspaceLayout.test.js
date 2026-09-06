import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayout, panelSpan, PANEL_DEFAULTS } from '../js/workspaceLayout.js';

test('damaged or older layout preferences retain every card exactly once', () => {
  const layout = normalizeLayout([{ id: 'board', span: 99, height: -20 }, { id: 'board', span: 4 }, null, { id: 'retired' }, { id: 'history', span: NaN, height: Infinity }]);
  assert.equal(layout.length, PANEL_DEFAULTS.length);
  assert.equal(new Set(layout.map(p => p.id)).size, PANEL_DEFAULTS.length);
  assert.deepEqual(layout[0], { id: 'board', span: 12, height: 180 });
  assert.deepEqual(layout[1], { id: 'history', span: 7, height: null });
  assert.deepEqual(normalizeLayout({}), normalizeLayout(null));
});

test('layout roundtrip preserves card order, manual dimensions, and content-fit mode', () => {
  const layout = normalizeLayout([{ id: 'evidence', span: 5, height: 420 }, { id: 'history', span: 8, height: null }]);
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(layout))), layout);
});

test('narrow windows reflow without overwriting saved wide-window proportions', () => {
  assert.equal(panelSpan(5, 760), 12);
  assert.equal(panelSpan(5, 1600), 5);
  assert.equal(panelSpan(3, 900), 5);
  assert.equal(panelSpan(12, 900), 12);
});
