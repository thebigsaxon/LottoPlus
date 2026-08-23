/**
 * Selects a recent window independently from the requested display direction.
 * This keeps "Last X" anchored to the newest draws even when the table reads
 * chronologically from top to bottom.
 */
export function filterAndSortDraws(draws, options = {}) {
  const {
    startDate = '',
    endDate = '',
    sortOrder = 'asc',
    limit = 'all'
  } = options;

  let result = Array.isArray(draws) ? [...draws] : [];

  if (startDate) result = result.filter(draw => draw.date >= startDate);
  if (endDate) result = result.filter(draw => draw.date <= endDate);

  // Select the newest records first, regardless of how they will be displayed.
  result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (limit !== 'all') {
    const parsedLimit = Number.parseInt(limit, 10);
    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      result = result.slice(0, parsedLimit);
    }
  }

  if (sortOrder === 'asc') result.reverse();

  return result;
}

export function priorDrawCountToLimit(value, fallback = 14) {
  const priorCount = Number.parseInt(value, 10);
  return (Number.isInteger(priorCount) && priorCount >= 0 ? priorCount : fallback) + 1;
}

export function cash5AnalysisWindow(draws) {
  return filterAndSortDraws(draws, { sortOrder: 'asc', limit: 10 });
}

export function cash5ResearchWindow(draws) {
  return filterAndSortDraws(draws, { sortOrder: 'asc', limit: 50 });
}
