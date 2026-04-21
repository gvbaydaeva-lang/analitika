import { PERIODS } from './periods.js';

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Снимок «бизнес-данных» без цепочки бэкапов (для копий перед импортом) */
export function coreDataFromState(s) {
  return {
    version: s.version,
    catalog: structuredClone(s.catalog || []),
    months: structuredClone(s.months || {}),
    payroll: structuredClone(s.payroll || []),
    rent: structuredClone(s.rent || []),
    expenseLines: structuredClone(s.expenseLines || []),
    dataSource: structuredClone(s.dataSource || defaultDataSource()),
    integrations: structuredClone(s.integrations || defaultIntegrations()),
    settings: structuredClone(s.settings || defaultBusinessSettings()),
  };
}

export function defaultDataSource() {
  return {
    kind: 'demo',
    format: null,
    label: 'Демо-данные',
    fileName: null,
    updatedAt: new Date().toISOString(),
  };
}

export function defaultIntegrations() {
  return {
    googleSheetsApiKey: '',
    moiskladApiKey: '',
    crmApiKey: '',
    oneCNotes: '',
  };
}

export function defaultBusinessSettings() {
  return {
    taxRatePct: 6,
    currentCash: 300000,
    whatIfPricePct: 0,
    whatIfMarketingPct: 0,
  };
}

function firstDayFromPeriodKey(key) {
  return `${String(key)}-01`;
}

/** Начальное состояние учёта из демо-периодов */
export function createSeedState() {
  const catalog = [
    { id: 'cat-seed-a', name: 'Товар A', sku: 'SKU-A', retail: 2200, purchase: 880, category: 'A', stockQty: 0 },
    { id: 'cat-seed-b', name: 'Товар B', sku: 'SKU-B', retail: 900, purchase: 650, category: 'C', stockQty: 0 },
    { id: 'cat-seed-s', name: 'Услуга «Старт»', sku: 'SRV-1', retail: 4500, purchase: 900, category: 'B', stockQty: 0 },
  ];
  const ids = [catalog[0].id, catalog[1].id, catalog[2].id];

  const months = {};
  for (const [key, d] of Object.entries(PERIODS)) {
    months[key] = {
      orders: d.orders,
      channels: d.channels.map((c) => ({
        name: c.name,
        revenue: c.revenue,
        spend: c.spend,
        delta: c.delta,
      })),
      sales: d.products.map((p, i) => ({
        catalogId: ids[i],
        qty: p.qty,
      })),
    };
  }

  const april = PERIODS['2026-04'];
  const fl = april.fixedLines || [];

  const payroll = [];
  const rent = [];
  const expenseLines = [];
  for (const line of fl) {
    if (line.label.toLowerCase().includes('зарплат')) {
      payroll.push({
        id: uid('pay'),
        fullName: 'Фонд оплаты труда',
        position: 'ФОТ',
        amount: line.amount,
      });
    } else if (line.label.toLowerCase().includes('аренд')) {
      rent.push({ id: uid('rent'), title: line.label, amount: line.amount });
    }
  }
  if (!rent.length) rent.push({ id: uid('rent'), title: 'Аренда', amount: 8000 });
  if (!payroll.length) payroll.push({ id: uid('pay'), fullName: 'Сотрудники', position: 'ФОТ', amount: 10000 });

  for (const [key, d] of Object.entries(PERIODS)) {
    for (const line of d.fixedLines || []) {
      const l = line.label.toLowerCase();
      if (l.includes('коммунал')) {
        expenseLines.push({
          id: uid('exp'),
          periodKey: key,
          category: 'utilities',
          amount: line.amount,
          note: line.label,
          status: 'fact',
          opDate: firstDayFromPeriodKey(key),
        });
      }
    }
  }

  return {
    version: 5,
    catalog,
    months,
    payroll,
    rent,
    expenseLines,
    dataSource: defaultDataSource(),
    integrations: defaultIntegrations(),
    settings: defaultBusinessSettings(),
    preImportBackups: [],
  };
}
