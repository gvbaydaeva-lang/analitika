import { ensureMonth, writeMergedSales } from '../domain/monthModel.js';

function newCatalogId() {
  return `cat-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Применить импортированные строки к черновику состояния.
 * @param {import('../state.js').AppState} draft
 * @param {Array<{name:string,sku:string,purchase:number,retail:number,soldQty:number,stockQty:number}>} rows
 * @param {string} periodKey например 2026-04
 */
export function applyImportRows(draft, rows, periodKey) {
  ensureMonth(draft, periodKey);

  for (const row of rows) {
    const sku = String(row.sku || '').trim();
    const name = String(row.name || '').trim();
    if (!name && !sku) continue;

    let p = draft.catalog.find((c) => {
      if (sku && String(c.sku || '').trim() === sku) return true;
      if (!sku && name && String(c.name || '').trim() === name) return true;
      return false;
    });

    if (!p) {
      p = {
        id: newCatalogId(),
        name: name || sku,
        sku: sku || name,
        retail: Math.max(0, row.retail),
        purchase: Math.max(0, row.purchase),
        category: 'Импорт',
        stockQty: Math.max(0, Math.floor(row.stockQty || 0)),
      };
      draft.catalog.push(p);
      for (const k of Object.keys(draft.months)) {
        ensureMonth(draft, k);
        const sales = draft.months[k].sales || [];
        if (!sales.some((s) => s.catalogId === p.id)) {
          sales.push({ catalogId: p.id, qty: 0 });
        }
        draft.months[k].sales = sales;
      }
    } else {
      if (name) p.name = name;
      if (sku) p.sku = sku;
      p.retail = Math.max(0, row.retail);
      p.purchase = Math.max(0, row.purchase);
      p.stockQty = Math.max(0, Math.floor(Number(row.stockQty) || 0));
    }

    writeMergedSales(draft, periodKey);
    const sales = draft.months[periodKey].sales;
    const idx = sales.findIndex((s) => s.catalogId === p.id);
    const sold = Math.max(0, Math.floor(row.soldQty || 0));
    if (idx >= 0) sales[idx] = { catalogId: p.id, qty: sold };
    else sales.push({ catalogId: p.id, qty: sold });
  }
}
