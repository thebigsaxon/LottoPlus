/** Date-only helpers that avoid local-time and daylight-saving shifts. */

export function nextCalendarDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return '—';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '—';
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export function sessionTargetDrawingDate(session = {}) {
  return typeof session.result?.date === 'string' && session.result.date
    ? session.result.date
    : nextCalendarDate(session.baselineDate);
}
