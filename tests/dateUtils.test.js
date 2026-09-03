import test from 'node:test';
import assert from 'node:assert/strict';
import { nextCalendarDate, sessionTargetDrawingDate } from '../js/dateUtils.js';

test('next drawing dates cross month, year, and leap-day boundaries in UTC', () => {
  assert.equal(nextCalendarDate('2026-01-31'), '2026-02-01');
  assert.equal(nextCalendarDate('2026-12-31'), '2027-01-01');
  assert.equal(nextCalendarDate('2028-02-28'), '2028-02-29');
  assert.equal(nextCalendarDate('not-a-date'), '—');
});

test('session target date uses the result date when scored and next date when pending', () => {
  assert.equal(sessionTargetDrawingDate({
    baselineDate: '2026-08-28',
    result: { date: '2026-08-30' }
  }), '2026-08-30');
  assert.equal(sessionTargetDrawingDate({ baselineDate: '2026-08-28' }), '2026-08-29');
});
