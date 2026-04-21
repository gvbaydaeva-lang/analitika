/** @typedef {import('./state.js').AppState} AppState */

import { inferChannelSegment, CHANNEL_SEGMENT_IDS } from './domain/channelSegment.js';

export const EXPENSE_CATEGORIES = [
  { id: 'marketing', label: 'Маркетинг (доп.)' },
  { id: 'utilities', label: 'Коммуналка' },
  { id: 'other', label: 'Прочее' },
];

/** Сегмент маркетингового канала для вкладки «Маркетинг». */
export const MARKETING_SEGMENTS = [
  { id: 'social_instagram', label: 'Instagram', group: 'Соцсети' },
  { id: 'social_telegram', label: 'Telegram', group: 'Соцсети' },
  { id: 'social_vk', label: 'VK', group: 'Соцсети' },
  { id: 'context', label: 'Контекстная реклама', group: 'Контекст' },
  { id: 'direct', label: 'Прямые продажи', group: 'Прямые' },
];

export const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export function periodKey(y, m) {
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function prevPeriod(y, m) {
  if (m <= 1) return { y: y - 1, m: 12 };
  return { y, m: m - 1 };
}

export function catalogById(state, id) {
  return state.catalog.find((c) => c.id === id);
}

/** Сумма маркетинга по каналам */
export function channelSpendTotal(month) {
  return (month.channels || []).reduce((s, c) => s + (Number(c.spend) || 0), 0);
}

/** Расчёт показателей за месяц */
export function computeMonth(state, y, m) {
  const key = periodKey(y, m);
  const month = state.months[key] || { orders: 0, channels: [], sales: [] };
  const orders = Number(month.orders) || 0;

  let revenue = 0;
  let cogs = 0;
  const saleRows = [];

  for (const line of month.sales || []) {
    const p = catalogById(state, line.catalogId);
    if (!p) continue;
    const qty = Number(line.qty) || 0;
    const lineRev = qty * (Number(p.retail) || 0);
    const lineCogs = qty * (Number(p.purchase) || 0);
    revenue += lineRev;
    cogs += lineCogs;
    saleRows.push({ catalogId: line.catalogId, product: p, qty, lineRev, lineCogs });
  }

  const marketingChannels = channelSpendTotal(month);
  const linesForMonth = (state.expenseLines || []).filter((e) => e.periodKey === key);
  const marketingExtra = linesForMonth.filter((e) => e.category === 'marketing').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const utilitiesExtra = linesForMonth.filter((e) => e.category === 'utilities').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const otherExtra = linesForMonth.filter((e) => e.category === 'other').reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const payrollTotal = (state.payroll || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const rentTotal = (state.rent || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const marketingTotal = marketingChannels + marketingExtra;
  const grossProfit = revenue - cogs;
  const taxRatePct = Math.max(0, Number(state.settings?.taxRatePct) || 0);

  let soldPieces = 0;
  const enrichedProductsBase = saleRows.map((row) => {
    const { product: p, qty, lineRev, lineCogs } = row;
    soldPieces += qty;
    const share = revenue > 0 ? lineRev / revenue : 0;
    const mktOnLine = share * marketingTotal;
    const mktPerUnit = qty > 0 ? mktOnLine / qty : 0;
    const grossPerUnit = (Number(p.retail) || 0) - (Number(p.purchase) || 0);
    const marginPct = p.retail ? (grossPerUnit / p.retail) * 100 : 0;
    const contribPerUnit = grossPerUnit - mktPerUnit;
    const contribTotal = contribPerUnit * qty;
    const stockQty = Math.max(0, Math.floor(Number(p.stockQty) || 0));
    const stockValueCost = stockQty * (Number(p.purchase) || 0);
    const stockValueRetail = stockQty * (Number(p.retail) || 0);
    return {
      catalogId: line.catalogId,
      sku: p.name,
      cat: p.category,
      qty,
      retail: p.retail,
      purchase: p.purchase,
      revenue: lineRev,
      cogsTotal: lineCogs,
      grossPerUnit,
      marginPct,
      mktPerUnit,
      contribPerUnit,
      contribTotal,
      stockQty,
      stockValueCost,
      stockValueRetail,
      soldQty: qty,
      soldRevenue: lineRev,
    };
  });
  const sortedByContrib = [...enrichedProductsBase].sort((a, b) => b.contribTotal - a.contribTotal);
  const totalContrib = sortedByContrib.reduce((s, p) => s + Math.max(0, p.contribTotal), 0);
  let cumulative = 0;
  const abcBySku = new Map();
  for (const p of sortedByContrib) {
    cumulative += Math.max(0, p.contribTotal);
    const share = totalContrib > 0 ? cumulative / totalContrib : 0;
    const abc = share <= 0.8 ? 'A' : share <= 0.95 ? 'B' : 'C';
    abcBySku.set(p.sku, abc);
  }
  const enrichedProducts = enrichedProductsBase.map((p) => ({
    ...p,
    abc: abcBySku.get(p.sku) || 'C',
  }));

  let stockPieces = 0;
  let stockRubPurchase = 0;
  let stockRubRetail = 0;
  for (const p of state.catalog || []) {
    const sq = Math.max(0, Math.floor(Number(p.stockQty) || 0));
    stockPieces += sq;
    stockRubPurchase += sq * (Number(p.purchase) || 0);
    stockRubRetail += sq * (Number(p.retail) || 0);
  }

  const inventory = {
    soldPieces,
    soldRevenueRub: revenue,
    stockPieces,
    stockRubPurchase,
    stockRubRetail,
  };

  const channels = (month.channels || []).map((c) => {
    const spend = Number(c.spend) || 0;
    const rev = Number(c.revenue) || 0;
    const romi = spend > 0 ? rev / spend : 0;
    const cogsAlloc = revenue > 0 ? (rev / revenue) * cogs : 0;
    const profit = rev - cogsAlloc - spend;
    const segment =
      c.segment && CHANNEL_SEGMENT_IDS.includes(c.segment) ? c.segment : inferChannelSegment(c.name);
    const taxAlloc = revenue > 0 && taxes > 0 ? (rev / revenue) * taxes : 0;
    const netProfitChannel = rev - spend - cogsAlloc - taxAlloc;
    return {
      ...c,
      segment,
      spend,
      revenue: rev,
      romi,
      profit,
      cogsAlloc,
      taxAlloc,
      netProfitChannel,
      delta: Number(c.delta) || 0,
    };
  });

  const totalOpex = marketingTotal + payrollTotal + rentTotal + utilitiesExtra + otherExtra;
  const netBeforeTax = revenue - cogs - totalOpex;
  const taxes = netBeforeTax > 0 ? (netBeforeTax * taxRatePct) / 100 : 0;
  const net = netBeforeTax - taxes;

  const avgOrder = orders > 0 ? revenue / orders : 0;
  const mktPerOrder = orders > 0 ? marketingTotal / orders : 0;
  const contribPerOrder = orders > 0 ? (grossProfit - marketingTotal) / orders : 0;
  const netPerOrder = orders > 0 ? net / orders : 0;
  const purchaseShare = revenue > 0 ? cogs / revenue : 0;
  const cac = orders > 0 ? marketingTotal / orders : 0;
  const avgGrossPerOrder = orders > 0 ? grossProfit / orders : 0;
  const grossMarginRatio = revenue > 0 ? grossProfit / revenue : 0;
  const ltv = grossMarginRatio > 0 ? avgGrossPerOrder * 3 : 0;
  const burnRate = Math.max(0, totalOpex - grossProfit);
  const runwayMonths = burnRate > 0 ? (Number(state.settings?.currentCash) || 0) / burnRate : Infinity;

  return {
    key,
    revenue,
    cogs,
    marketingTotal,
    marketingChannels,
    marketingExtra,
    payrollTotal,
    rentTotal,
    utilitiesExtra,
    otherExtra,
    grossProfit,
    totalOpex,
    taxRatePct,
    taxes,
    netBeforeTax,
    net,
    orders,
    avgOrder,
    mktPerOrder,
    contribPerOrder,
    netPerOrder,
    purchaseShare,
    ltv,
    cac,
    burnRate,
    runwayMonths,
    channels,
    products: enrichedProducts,
    pie: {
      cogs,
      marketing: marketingTotal,
      payroll: payrollTotal,
      rent: rentTotal,
      utilities: utilitiesExtra,
      other: otherExtra,
    },
    inventory,
  };
}

export function computeWithPrev(state, y, m) {
  const cur = computeMonth(state, y, m);
  const { y: py, m: pm } = prevPeriod(y, m);
  const prev = computeMonth(state, py, pm);
  const prevNet = prev.net;
  const netDeltaPct = prevNet ? ((cur.net - prevNet) / Math.abs(prevNet)) * 100 : 0;
  const revDeltaPct = prev.revenue ? ((cur.revenue - prev.revenue) / prev.revenue) * 100 : 0;
  const mktDeltaPct = prev.marketingTotal ? ((cur.marketingTotal - prev.marketingTotal) / prev.marketingTotal) * 100 : 0;
  const prevCogs = prev.cogs || cur.cogs;
  const cogsDeltaPct = prevCogs ? ((cur.cogs - prevCogs) / prevCogs) * 100 : 0;
  const whatIfPricePct = Number(state.settings?.whatIfPricePct) || 0;
  const whatIfMarketingPct = Number(state.settings?.whatIfMarketingPct) || 0;
  const whatIfRevenue = cur.revenue * (1 + whatIfPricePct / 100);
  const whatIfMarketing = cur.marketingTotal * (1 + whatIfMarketingPct / 100);
  const whatIfGross = whatIfRevenue - cur.cogs;
  const whatIfNetBeforeTax = whatIfRevenue - cur.cogs - (cur.totalOpex - cur.marketingTotal + whatIfMarketing);
  const whatIfTaxes = whatIfNetBeforeTax > 0 ? (whatIfNetBeforeTax * cur.taxRatePct) / 100 : 0;
  const whatIfNet = whatIfNetBeforeTax - whatIfTaxes;
  const burnDeltaPct =
    prev.burnRate > 0.01 ? ((cur.burnRate - prev.burnRate) / prev.burnRate) * 100 : 0;

  return {
    ...cur,
    prev,
    netDeltaPct,
    revDeltaPct,
    mktDeltaPct,
    cogsDeltaPct,
    burnDeltaPct,
    whatIf: {
      pricePct: whatIfPricePct,
      marketingPct: whatIfMarketingPct,
      revenue: whatIfRevenue,
      marketing: whatIfMarketing,
      net: whatIfNet,
      taxes: whatIfTaxes,
    },
  };
}

/** 30 календарных дней от 1-го числа выбранного месяца (при нехватке дней — переход на следующий месяц). */
export function thirtyDatesFromMonthStart(y, m) {
  const out = [];
  let cy = y;
  let cm = m;
  let cd = 1;
  for (let i = 0; i < 30; i += 1) {
    const dim = new Date(cy, cm, 0).getDate();
    if (cd > dim) {
      cd = 1;
      cm += 1;
      if (cm > 12) {
        cm = 1;
        cy += 1;
      }
    }
    out.push(`${cy}-${String(cm).padStart(2, '0')}-${String(cd).padStart(2, '0')}`);
    cd += 1;
  }
  return out;
}

/**
 * Матрица платежного календаря: строки — категории + ФОТ + аренда + каналы; столбцы — 30 дней.
 * В ячейках — суммы плановых/фактических списаний по дате (строки журнала) или равномерное распределение ФОТ/аренды/каналов.
 */
export function buildPaymentCalendarMatrix(state, y, m) {
  const dates = thirtyDatesFromMonthStart(y, m);
  const dim = computeMonth(state, y, m);
  const dailyPayroll = dim.payrollTotal / 30;
  const dailyRent = dim.rentTotal / 30;
  const dailyChannels = dim.marketingChannels / 30;

  const rowDefs = [
    ...EXPENSE_CATEGORIES.map((c) => ({ id: c.id, label: c.label, type: 'lines' })),
    { id: 'channels', label: 'Реклама (каналы)', type: 'flat' },
    { id: 'payroll', label: 'ФОТ (равно по дням)', type: 'flat' },
    { id: 'rent', label: 'Аренда (равно по дням)', type: 'flat' },
  ];

  const rows = rowDefs.map((def) => {
    const cells = dates.map((iso) => {
      if (def.type === 'flat') {
        if (def.id === 'channels') return dailyChannels;
        if (def.id === 'payroll') return dailyPayroll;
        if (def.id === 'rent') return dailyRent;
      }
      return (state.expenseLines || [])
        .filter((e) => e.opDate === iso && e.category === def.id)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    });
    return { id: def.id, label: def.label, cells, editable: def.type === 'lines' };
  });

  const dailyTotal = dates.map((_, col) => rows.reduce((s, r) => s + (Number(r.cells[col]) || 0), 0));
  const cash0 = Number(state.settings?.currentCash) || 0;
  const balances = [];
  const gapCols = [];
  let bal = cash0;
  for (let i = 0; i < 30; i += 1) {
    bal -= dailyTotal[i];
    balances.push(bal);
    gapCols.push(bal < 0);
  }

  return { dates, dayLabels: dates.map((d) => d.slice(8)), rows, dailyTotal, balances, gapCols };
}

/** Сводка по сегментам маркетинга и детализация по каналам. */
export function computeMarketingRollup(state, y, m) {
  const dim = computeMonth(state, y, m);
  const bySeg = new Map();
  for (const def of MARKETING_SEGMENTS) {
    bySeg.set(def.id, {
      def,
      channels: [],
      revenue: 0,
      spend: 0,
      cogsAlloc: 0,
      taxAlloc: 0,
      netProfitChannel: 0,
    });
  }
  for (const ch of dim.channels) {
    const sid = ch.segment && bySeg.has(ch.segment) ? ch.segment : 'direct';
    const bucket = bySeg.get(sid) || bySeg.get('direct');
    bucket.channels.push(ch);
    bucket.revenue += ch.revenue;
    bucket.spend += ch.spend;
    bucket.cogsAlloc += ch.cogsAlloc || 0;
    bucket.taxAlloc += ch.taxAlloc || 0;
    bucket.netProfitChannel += ch.netProfitChannel || 0;
  }
  return { segments: [...bySeg.values()], monthDim: dim };
}

export function cashProjection30d(state, fromDate = new Date()) {
  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  const lines = state.expenseLines || [];
  const currentCash = Number(state.settings?.currentCash) || 0;
  let balance = currentCash;
  let minBalance = balance;
  const points = [];
  for (let i = 0; i < 30; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dayOut = lines
      .filter((x) => x.opDate === iso && x.status === 'plan')
      .reduce((s, x) => s + (Number(x.amount) || 0), 0);
    balance -= dayOut;
    minBalance = Math.min(minBalance, balance);
    points.push({ date: iso, balance });
  }
  return {
    currentCash,
    forecastBalance: balance,
    minBalance,
    hasCashGap: minBalance < 0,
    points,
  };
}

/** Серия для графика прибыли: все ключи месяцев из state + сортировка */
export function sortedMonthKeys(state) {
  const keys = new Set(Object.keys(state.months || {}));
  return [...keys].sort();
}

export function profitSeries(state, lastN = 12) {
  const keys = sortedMonthKeys(state);
  const slice = keys.slice(-lastN);
  const labels = [];
  const profits = [];
  const revenues = [];
  for (const key of slice) {
    const [ys, ms] = key.split('-').map(Number);
    const c = computeMonth(state, ys, ms);
    labels.push(`${MONTH_NAMES[ms - 1].slice(0, 3)} ${ys}`);
    profits.push(Math.round(c.net));
    revenues.push(Math.round(c.revenue));
  }
  return { labels, profits, revenues, keys: slice };
}

export { inferChannelSegment, CHANNEL_SEGMENT_IDS } from './domain/channelSegment.js';
