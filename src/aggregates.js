/** @typedef {import('./state.js').AppState} AppState */

export const EXPENSE_CATEGORIES = [
  { id: 'marketing', label: 'Маркетинг (доп.)' },
  { id: 'utilities', label: 'Коммуналка' },
  { id: 'other', label: 'Прочее' },
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

  let soldPieces = 0;
  const enrichedProducts = saleRows.map((row) => {
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
    return { ...c, spend, revenue: rev, romi, profit, delta: Number(c.delta) || 0 };
  });

  const totalOpex = marketingTotal + payrollTotal + rentTotal + utilitiesExtra + otherExtra;
  const net = revenue - cogs - totalOpex;

  const avgOrder = orders > 0 ? revenue / orders : 0;
  const mktPerOrder = orders > 0 ? marketingTotal / orders : 0;
  const contribPerOrder = orders > 0 ? (grossProfit - marketingTotal) / orders : 0;
  const netPerOrder = orders > 0 ? net / orders : 0;
  const purchaseShare = revenue > 0 ? cogs / revenue : 0;

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
    net,
    orders,
    avgOrder,
    mktPerOrder,
    contribPerOrder,
    netPerOrder,
    purchaseShare,
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
  return { ...cur, prev, netDeltaPct, revDeltaPct, mktDeltaPct, cogsDeltaPct };
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
