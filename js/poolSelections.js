import { sanitizeAutomaticSelection } from './automaticPivot.js?v=1';
/** Full-number selections and immutable pool snapshots, separate from tickets. */
import { normalizeWorkbenchSettings } from './pivotWorkbench.js?v=4';

export function cleanPoolNumbers(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .filter(value => typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim())))
    .map(Number).filter(number => Number.isInteger(number) && number >= 1 && number <= 42))].sort((a, b) => a - b);
}

export function sanitizePoolDraft(draft) {
  if (!draft || !/^\d{4}-\d{2}-\d{2}$/.test(draft.baselineDate || '')) return null;
  return { baselineDate: draft.baselineDate, selectedNumbers: cleanPoolNumbers(draft.selectedNumbers) };
}

export function currentPoolDraft(draft, board) {
  const current = sanitizePoolDraft(draft);
  const eligible = new Set(board.eligibleNumbers || []);
  return {
    baselineDate: board.source?.date || '',
    selectedNumbers: current?.baselineDate === board.source?.date
      ? current.selectedNumbers.filter(number => eligible.has(number)) : []
  };
}

export function togglePoolNumber(draft, board, number) {
  const current = currentPoolDraft(draft, board);
  if (!board.eligibleNumbers?.includes(number)) return current;
  return { ...current, selectedNumbers: current.selectedNumbers.includes(number)
    ? current.selectedNumbers.filter(value => value !== number)
    : [...current.selectedNumbers, number].sort((a, b) => a - b) };
}

export function sanitizePoolSelections(values) {
  return (Array.isArray(values) ? values : []).flatMap((item, index) => {
    const poolNumbers = cleanPoolNumbers(item?.poolNumbers);
    if (!poolNumbers.length) return [];
    const selectedNumbers = cleanPoolNumbers(item?.selectedNumbers).filter(number => poolNumbers.includes(number));
    return [{
      id: String(item.id || `pool-${index + 1}`).slice(0, 160),
      savedAt: String(item.savedAt || '').slice(0, 40),
      poolNumbers,
      selectedNumbers,
      pivots: [...new Set((Array.isArray(item.pivots) ? item.pivots : [])
        .filter(digit => Number.isInteger(digit) && digit >= 0 && digit <= 9))].sort((a, b) => a - b).slice(0, 2),
      workbenchSettings: normalizeWorkbenchSettings(item.workbenchSettings),
      automaticSelection: sanitizeAutomaticSelection(item.automaticSelection)
    }];
  });
}

export function poolSelectionKey(selection) {
  return JSON.stringify([selection.poolNumbers, selection.selectedNumbers, selection.pivots]);
}

export function scorePoolSelections(selections, actualNumbers) {
  const winning = new Set(cleanPoolNumbers(actualNumbers));
  return sanitizePoolSelections(selections).map(selection => ({
    selectionId: selection.id,
    poolMatchedNumbers: selection.poolNumbers.filter(number => winning.has(number)),
    selectedMatchedNumbers: selection.selectedNumbers.filter(number => winning.has(number))
  }));
}
