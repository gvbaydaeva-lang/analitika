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
    return { ...c, spend, revenue: rev, romi, profit, delta: Number(c.delta) || 0 };
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
  return {
    ...cur,
    prev,
    netDeltaPct,
    revDeltaPct,
    mktDeltaPct,
    cogsDeltaPct,
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
