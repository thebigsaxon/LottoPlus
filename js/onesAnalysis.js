export function onesDigit(value) {
  return Math.abs(Number(value)) % 10;
}

export function drawToOnes(draw) {
  return (draw?.numbers || []).map((number, column) => ({
    digit: onesDigit(number),
    number,
    column
  }));
}

export function arithmeticRelationships(a, b) {
  const left = onesDigit(a);
  const right = onesDigit(b);
  return [
    { operation: 'add', symbol: '+', result: (left + right) % 10 },
    { operation: 'subtract', symbol: '−', result: Math.abs(left - right) },
    { operation: 'multiply', symbol: '×', result: (left * right) % 10 }
  ];
}

export function mathematicalSequenceRelationships(a, b) {
  const left = onesDigit(a);
  const right = onesDigit(b);
  const rawRelationships = [
    {
      operation: 'add',
      result: (left + right) % 10,
      explanation: left + right >= 10
        ? `${left} + ${right} = ${left + right} → ${(left + right) % 10}`
        : `${left} + ${right} = ${left + right}`
    },
    {
      operation: 'subtract',
      result: Math.abs(left - right),
      explanation: `${Math.max(left, right)} − ${Math.min(left, right)} = ${Math.abs(left - right)}`
    },
    {
      operation: 'borrow-left',
      result: (left + 10 - right) % 10,
      explanation: `${left + 10} − ${right} = ${left + 10 - right}`
    },
    {
      operation: 'borrow-right',
      result: (right + 10 - left) % 10,
      explanation: `${right + 10} − ${left} = ${right + 10 - left}`
    }
  ];

  const uniqueByResult = new Map();
  rawRelationships.forEach(relationship => {
    if (!uniqueByResult.has(relationship.result)) {
      uniqueByResult.set(relationship.result, relationship);
    }
  });
  return [...uniqueByResult.values()].sort((a, b) => a.result - b.result);
}

export function classifyOnesHeat(draws) {
  const counts = Array(10).fill(0);
  (draws || []).forEach(draw => {
    drawToOnes(draw).forEach(({ digit }) => { counts[digit] += 1; });
  });

  const distinctCounts = [...new Set(counts)].sort((a, b) => b - a);
  const hotCutoff = distinctCounts[Math.min(2, distinctCounts.length - 1)] ?? 0;
  const warmCutoff = distinctCounts[Math.min(5, distinctCounts.length - 1)] ?? 0;

  return counts.map((count, digit) => ({
    digit,
    count,
    tier: count >= hotCutoff ? 'hot' : (count >= warmCutoff ? 'warm' : 'cold')
  }));
}

export function movementType(fromColumn, toColumn) {
  const delta = toColumn - fromColumn;
  if (delta === 0) return 'same column';
  if (delta === -1) return 'sister left';
  if (delta === 1) return 'sister right';
  return null;
}
