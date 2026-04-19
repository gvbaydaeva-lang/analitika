/** Операции с месячными продажами (общие для UI и импорта). */

export function ensureMonth(state, key) {
  if (!state.months[key]) {
    state.months[key] = { orders: 0, channels: [], sales: [] };
  }
  return state.months[key];
}

export function getMergedSales(state, key) {
  const month = state.months[key] || { sales: [] };
  const lines = [...(month.sales || [])];
  const ids = new Set(lines.map((l) => l.catalogId));
  for (const p of state.catalog) {
    if (!ids.has(p.id)) lines.push({ catalogId: p.id, qty: 0 });
  }
  return lines;
}

export function writeMergedSales(draft, key) {
  ensureMonth(draft, key);
  draft.months[key].sales = getMergedSales(draft, key);
}
