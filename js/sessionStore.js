function uniqueSortedNumbers(values) {
  return [...new Set((values || []).map(Number))].sort((a, b) => a - b);
}

export function clearCandidateState(workspace = {}) {
  return {
    ...workspace,
    candidateDigits: [],
    selectedEvidenceDigit: null,
    fullCandidates: [],
    rowBuilder: []
  };
}

export function validateTicketRow(numbers) {
  const normalized = uniqueSortedNumbers(numbers);
  const valid = normalized.length === 5 && normalized.every(number => Number.isInteger(number) && number >= 1 && number <= 42);
  return { valid, numbers: valid ? normalized : [] };
}

export function createDraftRow(numbers, label = 'uncertain', note = '') {
  const result = validateTicketRow(numbers);
  if (!result.valid) throw new Error('A ticket row requires five unique Cash 5 numbers from 1 to 42.');
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    numbers: result.numbers,
    label: ['strong', 'uncertain', 'ugly'].includes(label) ? label : 'uncertain',
    note: String(note || '')
  };
}

export function finalizeSession(workspace, latestDraw, now = new Date()) {
  if (!latestDraw) throw new Error('A latest draw is required to finalize a session.');
  if (!workspace.draftRows?.length) throw new Error('Add at least one complete ticket row before finalizing.');

  const snapshot = {
    id: `session-${now.getTime()}`,
    status: 'locked',
    finalizedAt: now.toISOString(),
    baselineDrawId: latestDraw.id,
    baselineDate: latestDraw.date,
    motifSelections: structuredCloneSafe(workspace.motifSelections || []),
    motifMatches: structuredCloneSafe(workspace.motifMatches || []),
    // Retained as empty compatibility fields for older version-3 projects.
    candidateDigits: [],
    fullCandidates: [],
    rows: structuredCloneSafe(workspace.draftRows),
    result: null
  };
  return snapshot;
}

export function formatSessionForMessage(session) {
  if (!session?.rows?.length) return '';
  const heading = `Cash 5 slips — next draw after ${session.baselineDate}`;
  const rows = session.rows.map((row, index) => (
    `Row ${index + 1}: ${row.numbers.map(number => String(number).padStart(2, '0')).join(' - ')}`
  ));
  return [heading, ...rows].join('\n');
}

export function editSessionInBuilder(workspace, sessionId, now = Date.now()) {
  const sessions = workspace?.sessions || [];
  const session = sessions.find(item => item.id === sessionId);
  if (!session) return workspace;
  const keepHistoricalSession = session.status === 'scored' || Boolean(session.result);
  const editableRows = session.rows.map((row, index) => ({
    ...structuredCloneSafe(row),
    id: keepHistoricalSession ? `row-${now}-${index}` : row.id
  }));
  return {
    ...workspace,
    draftRows: [...(workspace.draftRows || []), ...editableRows],
    sessions: keepHistoricalSession ? sessions : sessions.filter(item => item.id !== sessionId)
  };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

export function scoreSession(session, draws) {
  if (!session || session.result) return session;
  const nextDraw = [...(draws || [])]
    .filter(draw => draw.date > session.baselineDate)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!nextDraw) return session;

  const winning = new Set(nextDraw.numbers);
  return {
    ...session,
    status: 'scored',
    result: {
      drawId: nextDraw.id,
      date: nextDraw.date,
      numbers: [...nextDraw.numbers].sort((a, b) => a - b),
      candidateHits: session.fullCandidates.filter(number => winning.has(number)).length,
      rowScores: session.rows.map(row => ({
        rowId: row.id,
        hits: row.numbers.filter(number => winning.has(number)).length
      }))
    }
  };
}

export function scorePendingSessions(sessions, draws) {
  return (sessions || []).map(session => scoreSession(session, draws));
}
