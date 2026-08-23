/** Flexible CSV importer for SC Palmetto Cash 5 exports. */

import { validateDraw } from './validation.js';

export function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect header separator
  const firstLine = lines[0];
  let sep = ',';
  if (firstLine.includes('\t')) sep = '\t';
  else if (firstLine.includes(';')) sep = ';';

  const rows = lines.map(line => {
    const regex = new RegExp(`(?:^|${sep})(?:"([^"]*)"|([^"${sep}]*))`, 'g');
    const matches = [];
    let match;
    while ((match = regex.exec(line)) !== null) {
      const val = (match[1] !== undefined ? match[1] : match[2]).trim();
      matches.push(val);
    }
    return matches;
  });

  // Filter out duplicate header lines inside multi-game concatenated CSV files
  const header = rows[0];
  const dataRows = rows.slice(1).filter(r => {
    if (r.length === 0) return false;
    // Check if row is a repeated header line
    if (r[0].toLowerCase().replace(/[^a-z]/g, '') === 'date') return false;
    return true;
  });

  return { headers: header, rows: dataRows };
}

export function autoMapColumns(headers) {
  const mapping = {
    dateIndex: -1,
    winningNumbersIndex: -1,
    ballIndices: [],
    ignoredIndices: []
  };

  headers.forEach((h, idx) => {
    const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lower.includes('date') || lower.includes('draw')) {
      if (mapping.dateIndex === -1) mapping.dateIndex = idx;
    } else if (lower.includes('winning') || lower.includes('number') || lower.includes('combination')) {
      if (mapping.winningNumbersIndex === -1) mapping.winningNumbersIndex = idx;
    } else if (lower.includes('bonus') || lower.includes('multiplier') || lower.includes('play')) {
      mapping.ignoredIndices.push(idx);
    } else if (lower.includes('ball') || lower.includes('num') || lower.includes('n') || /^\d+$/.test(lower)) {
      mapping.ballIndices.push(idx);
    }
  });

  if (mapping.winningNumbersIndex === -1 && mapping.ballIndices.length === 0) {
    headers.forEach((h, idx) => {
      if (idx !== mapping.dateIndex && !mapping.ignoredIndices.includes(idx)) {
        mapping.ballIndices.push(idx);
      }
    });
  }

  return mapping;
}

export function convertRowsToDraws(headers, dataRows, mapping) {
  const draws = [];
  const errors = [];

  dataRows.forEach((row, i) => {
    if (row.length <= 1) return;

    let rawDate = mapping.dateIndex >= 0 ? row[mapping.dateIndex] : "";
    if (!rawDate || rawDate.trim() === "") return;

    let parsedDate = normalizeDate(rawDate);

    let numbers = [];
    if (mapping.winningNumbersIndex >= 0 && row[mapping.winningNumbersIndex]) {
      const cellVal = row[mapping.winningNumbersIndex];
      // Ignore Double Play add-on rows
      if (cellVal.toLowerCase().includes("double play")) return;

      const matchedInts = cellVal.match(/\d+/g);
      if (matchedInts) {
        numbers = matchedInts.map(n => parseInt(n, 10));
      }
    } else if (mapping.ballIndices.length > 0) {
      numbers = mapping.ballIndices.map(idx => parseInt(row[idx], 10)).filter(n => !isNaN(n));
    }

    if (numbers.length === 0) return;

    const candidateDraw = {
      id: `csv-${Date.now()}-${i}`,
      date: parsedDate,
      numbers
    };

    const valResult = validateDraw(candidateDraw);
    if (valResult.valid) {
      draws.push(valResult.draw);
    } else {
      errors.push(`Row ${i + 2}: ${valResult.errors.join(', ')}`);
    }
  });

  // Sort by date descending
  draws.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return { draws, errors };
}

export function normalizeDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const clean = dateStr.trim();
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  const mdy = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdy) {
    const m = mdy[1].padStart(2, '0');
    const d = mdy[2].padStart(2, '0');
    return `${mdy[3]}-${m}-${d}`;
  }

  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return clean;
}
