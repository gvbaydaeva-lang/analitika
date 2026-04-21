import { PERIODS } from './periods.js';
import { inferChannelSegment } from '../domain/channelSegment.js';

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

export function defaultGoogleSheets() {
  return {
    spreadsheetId: '',
    sheetRange: 'Лист1!A:C',
    colDate: 'A',
    colAmount: 'B',
    colCategory: 'C',
    accessToken: '',
    refreshToken: '',
    tokenExpiresAt: null,
  };
}

export function defaultIntegrations() {
  return {
    googleSheetsApiKey: '',
    moiskladApiKey: '',
    crmApiKey: '',
    oneCNotes: '',
    googleOAuthClientId: '',
    googleRedirectUri: '',
    googleSheets: defaultGoogleSheets(),
  };
}

export function defaultBusinessSettings() {
  return {
    taxRatePct: 6,
    currentCash: 300000,
    whatIfPricePct: 0,
    whatIfMarketingPct: 0,
    currency: 'RUB',
    lastSheetsSyncAt: null,
    sessionPin: '0000',
  };
}

function firstDayFromPeriodKey(key) {
  return `${String(key)}-01`;
}

function catalogIdForPeriodProduct(catalog, p) {
  const hit =
    catalog.find((c) => c.sku === p.sku) ||
    catalog.find((c) => c.name === p.sku) ||
    catalog.find((c) => c.name === p.name);
  return hit?.id || catalog[0].id;
}

function monthFromPeriod(d, catalog) {
  return {
    orders: d.orders,
    channels: (d.channels || []).map((c) => ({
      name: c.name,
      revenue: c.revenue,
      spend: c.spend,
      delta: c.delta,
      segment: inferChannelSegment(c.name),
    })),
    sales: (d.products || []).map((p) => ({
      catalogId: catalogIdForPeriodProduct(catalog, p),
      qty: p.qty,
    })),
  };
}

/** Апрель 2026: разнообразные продажи, соцсети, расходы и плановые списания для прогноза кассы. */
function buildApril2026Month(catalog) {
  const id = (sku) => catalog.find((c) => c.sku === sku)?.id || catalog[0].id;
  const sales = [
    { catalogId: id('ACC-1'), qty: 25 },
    { catalogId: id('ACC-1'), qty: 35 },
    { catalogId: id('SKU-B'), qty: 18 },
    { catalogId: id('SKU-B'), qty: 16 },
    { catalogId: id('SKU-C'), qty: 12 },
    { catalogId: id('SKU-C'), qty: 10 },
    { catalogId: id('SKU-B'), qty: 12 },
    { catalogId: id('SKU-A'), qty: 4 },
    { catalogId: id('SRV-1'), qty: 2 },
    { catalogId: id('SKU-D'), qty: 2 },
    { catalogId: id('ACC-1'), qty: 20 },
    { catalogId: id('SKU-B'), qty: 10 },
    { catalogId: id('SKU-E'), qty: 1 },
    { catalogId: id('SKU-B'), qty: 6 },
    { catalogId: id('SKU-C'), qty: 6 },
  ];
  return {
    orders: 94,
    channels: [
      {
        name: 'Instagram',
        revenue: 42000,
        spend: 12000,
        delta: 6,
        segment: 'social_instagram',
      },
      {
        name: 'Telegram',
        revenue: 28500,
        spend: 9000,
        delta: 4,
        segment: 'social_telegram',
      },
      {
        name: 'VK',
        revenue: 19800,
        spend: 6000,
        delta: 3,
        segment: 'social_vk',
      },
      {
        name: 'Яндекс.Директ',
        revenue: 38000,
        spend: 15000,
        delta: -2,
        segment: 'context',
      },
    ],
    sales,
  };
}

function buildAprilExpenseLines() {
  const key = '2026-04';
  return [
    {
      id: uid('exp'),
      periodKey: key,
      category: 'utilities',
      amount: 3200,
      note: 'Связь и интернет (офис + склад)',
      status: 'fact',
      opDate: '2026-04-05',
    },
    {
      id: uid('exp'),
      periodKey: key,
      category: 'marketing',
      amount: 12500,
      note: 'Доп. маркетинг: SMM и контент',
      status: 'fact',
      opDate: '2026-04-08',
    },
    {
      id: uid('exp'),
      periodKey: key,
      category: 'other',
      amount: 4800,
      note: 'Канцтовары и хознужды',
      status: 'fact',
      opDate: '2026-04-10',
    },
    {
      id: uid('exp'),
      periodKey: key,
      category: 'marketing',
      amount: 8200,
      note: 'Таргет и посевы',
      status: 'fact',
      opDate: '2026-04-12',
    },
    {
      id: uid('exp'),
      periodKey: key,
      category: 'other',
      amount: 6200,
      note: 'Курьерская доставка клиентам',
      status: 'fact',
      opDate: '2026-04-15',
    },
    {
      id: uid('exp'),
      periodKey: key,
      category: 'utilities',
      amount: 1800,
      note: 'Телефония',
      status: 'fact',
      opDate: '2026-04-18',
    },
    {
      id: uid('exp'),
      periodKey: key,
      category: 'marketing',
      amount: 52000,
      note: 'План: оплата рекламному агентству (апрель)',
      status: 'plan',
      opDate: '2026-04-24',
    },
    {
      id: uid('exp'),
      periodKey: key,
      category: 'other',
      amount: 65000,
      note: 'План: закупка товара под майские продажи',
      status: 'plan',
      opDate: '2026-04-28',
    },
    {
      id: uid('exp'),
      periodKey: '2026-05',
      category: 'other',
      amount: 88000,
      note: 'План: оборудование и монтаж',
      status: 'plan',
      opDate: '2026-05-03',
    },
    {
      id: uid('exp'),
      periodKey: '2026-05',
      category: 'marketing',
      amount: 42000,
      note: 'План: весенняя рекламная кампания',
      status: 'plan',
      opDate: '2026-05-12',
    },
  ];
}

/** Начальное состояние учёта из демо-периодов */
export function createSeedState() {
  const catalog = [
    { id: 'cat-seed-a', name: 'Товар A', sku: 'SKU-A', retail: 2200, purchase: 880, category: 'A', stockQty: 24 },
    { id: 'cat-seed-b', name: 'Товар B', sku: 'SKU-B', retail: 900, purchase: 650, category: 'C', stockQty: 120 },
    { id: 'cat-seed-s', name: 'Услуга «Старт»', sku: 'SRV-1', retail: 4500, purchase: 900, category: 'B', stockQty: 0 },
    { id: 'cat-seed-c', name: 'Товар C', sku: 'SKU-C', retail: 1500, purchase: 720, category: 'C', stockQty: 40 },
    { id: 'cat-seed-d', name: 'Товар D', sku: 'SKU-D', retail: 3400, purchase: 1100, category: 'A', stockQty: 12 },
    { id: 'cat-seed-e', name: 'Набор «Профи»', sku: 'SKU-E', retail: 5600, purchase: 2100, category: 'B', stockQty: 8 },
    { id: 'cat-seed-acc', name: 'Аксессуар', sku: 'ACC-1', retail: 490, purchase: 200, category: 'C', stockQty: 200 },
  ];

  const months = {};
  for (const [key, d] of Object.entries(PERIODS)) {
    if (key === '2026-04') continue;
    months[key] = monthFromPeriod(d, catalog);
  }
  months['2026-04'] = buildApril2026Month(catalog);

  const payroll = [
    { id: uid('pay'), fullName: 'Иванов А.П.', position: 'Операционный директор', amount: 95000 },
    { id: uid('pay'), fullName: 'Петрова Е.С.', position: 'Маркетолог', amount: 72000 },
  ];
  const rent = [{ id: uid('rent'), title: 'Аренда офиса и склада', amount: 38000 }];

  const expenseLines = [];
  for (const [key, d] of Object.entries(PERIODS)) {
    if (key === '2026-04') continue;
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
  for (const row of buildAprilExpenseLines()) {
    expenseLines.push(row);
  }

  const settings = {
    ...defaultBusinessSettings(),
    currentCash: 185000,
  };

  return {
    version: 7,
    catalog,
    months,
    payroll,
    rent,
    expenseLines,
    dataSource: defaultDataSource(),
    integrations: defaultIntegrations(),
    settings,
    preImportBackups: [],
  };
}
