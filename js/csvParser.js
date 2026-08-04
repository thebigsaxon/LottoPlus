/**
 * CSV Import & Export Utilities for LottoPlus
 */

export function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Determine separator (comma, semicolon, tab)
  const firstLine = lines[0];
  let sep = ',';
  if (firstLine.includes('\t')) sep = '\t';
  else if (firstLine.includes(';')) sep = ';';

  const rows = lines.map(line => {
    // Basic CSV splitting handling quotes
    const regex = new RegExp(`(?:^|${sep})(?:"([^"]*)"|([^"${sep}]*))`, 'g');
    const matches = [];
    let match;
    while ((match = regex.exec(line)) !== null) {
      matches.push((match[1] !== undefined ? match[1] : match[2]).trim());
    }
    return matches;
  });

  const headers = rows[0];
  const dataRows = rows.slice(1);

  return { headers, rows: dataRows };
}

export function autoMapColumns(headers) {
  const mapping = {
    dateIndex: -1,
    ballIndices: [],
    bonusIndex: -1,
    multiplierIndex: -1
  };

  headers.forEach((h, idx) => {
    const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lower.includes('date') || lower.includes('draw')) {
      if (mapping.dateIndex === -1) mapping.dateIndex = idx;
    } else if (lower.includes('powerball') || lower.includes('megaball') || lower.includes('bonus') || lower.includes('pb') || lower.includes('mb')) {
      if (mapping.bonusIndex === -1) mapping.bonusIndex = idx;
    } else if (lower.includes('multiplier') || lower.includes('powerplay') || lower.includes('megaplier')) {
      if (mapping.multiplierIndex === -1) mapping.multiplierIndex = idx;
    } else if (lower.includes('ball') || lower.includes('num') || lower.includes('n') || /^\d+$/.test(lower)) {
      mapping.ballIndices.push(idx);
    }
  });

  // If ball indices not found explicitly, assume remaining numeric columns
  if (mapping.ballIndices.length === 0) {
    headers.forEach((h, idx) => {
      if (idx !== mapping.dateIndex && idx !== mapping.bonusIndex && idx !== mapping.multiplierIndex) {
        mapping.ballIndices.push(idx);
      }
    });
  }

  return mapping;
}

export function convertRowsToDraws(headers, dataRows, mapping, gameType) {
  const draws = [];

  dataRows.forEach((row, i) => {
    if (row.length <= 1) return;

    let rawDate = mapping.dateIndex >= 0 ? row[mapping.dateIndex] : new Date().toISOString().split('T')[0];
    let parsedDate = normalizeDate(rawDate);

    let numbers = mapping.ballIndices.map(idx => parseInt(row[idx], 10)).filter(n => !isNaN(n));
    
    // Sort main numbers ascending
    numbers.sort((a, b) => a - b);

    let bonus = mapping.bonusIndex >= 0 ? parseInt(row[mapping.bonusIndex], 10) : null;
    if (isNaN(bonus)) bonus = null;

    let multiplier = mapping.multiplierIndex >= 0 ? parseInt(row[mapping.multiplierIndex], 10) : null;

    if (numbers.length > 0) {
      draws.push({
        id: `csv-${Date.now()}-${i}`,
        date: parsedDate,
        numbers,
        bonus,
        multiplier
      });
    }
  });

  // Sort by date descending
  draws.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return draws;
}

function normalizeDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const clean = dateStr.trim();
  
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  // MM/DD/YYYY
  const mdy = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdy) {
    const m = mdy[1].padStart(2, '0');
    const d = mdy[2].padStart(2, '0');
    return `${mdy[3]}-${m}-${d}`;
  }

  // Fallback date parser
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return clean;
}
