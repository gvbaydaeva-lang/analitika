import Chart from 'chart.js/auto';
import {
  getState,
  patchState,
  subscribe,
  loadFromStorage,
  resetToDemo,
  persist,
  STORAGE_KEY,
  reloadStateFromDisk,
  pushPreImportBackup,
  restorePreImportBackup,
  setDataSourceMeta,
} from './state.js';
import {
  computeWithPrev,
  computeMonth,
  profitSeries,
  MONTH_NAMES,
  EXPENSE_CATEGORIES,
  periodKey,
} from './aggregates.js';
import { ensureMonth, getMergedSales, writeMergedSales } from './domain/monthModel.js';
import { parseImportFile } from './data/importParse.js';
import { dataRepository } from './data/repository.js';

let chartProfit = null;
let chartPie = null;
let activeTab = sessionStorage.getItem('profitTab') || 'dashboard';

function money(n) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

function pct(n) {
  return new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 }).format(
    Number(n) / 100
  );
}

function deltaBadge(pctChange) {
  const v = Number(pctChange) || 0;
  if (v > 0) {
    return `<span class="inline-flex items-center gap-0.5 text-up text-xs font-semibold bg-upbg px-2 py-0.5 rounded-full">▲ ${v.toFixed(1)}%</span>`;
  }
  if (v < 0) {
    return `<span class="inline-flex items-center gap-0.5 text-down text-xs font-semibold bg-downbg px-2 py-0.5 rounded-full">▼ ${Math.abs(v).toFixed(1)}%</span>`;
  }
  return `<span class="text-muted text-xs font-medium">0%</span>`;
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getYM() {
  const yRaw = Number(document.getElementById('selectYear')?.value);
  const mRaw = Number(document.getElementById('selectMonth')?.value);
  let y = Number.isFinite(yRaw) ? yRaw : 2026;
  let m = Number.isFinite(mRaw) ? mRaw : 4;
  y = Math.min(2100, Math.max(2000, y));
  m = Math.min(12, Math.max(1, Math.floor(m)));
  return { y, m };
}

const PERIOD_M_KEY = 'profitPeriodM';
const PERIOD_Y_KEY = 'profitPeriodY';

function savePeriodSelection() {
  const { y, m } = getYM();
  sessionStorage.setItem(PERIOD_M_KEY, String(m));
  sessionStorage.setItem(PERIOD_Y_KEY, String(y));
}

let toastTimer = null;
function showToast(message, variant = 'ok') {
  const el = document.getElementById('toastHost');
  if (!el) return;
  el.textContent = message;
  el.className =
    variant === 'error'
      ? 'fixed top-4 left-1/2 z-[100] -translate-x-1/2 max-w-md w-[calc(100%-2rem)] rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 shadow-lg toast-show'
      : 'fixed top-4 left-1/2 z-[100] -translate-x-1/2 max-w-md w-[calc(100%-2rem)] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg toast-show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('toast-show');
    el.classList.add('toast-hide');
  }, 3200);
}

function destroyCharts() {
  if (chartProfit) {
    chartProfit.destroy();
    chartProfit = null;
  }
  if (chartPie) {
    chartPie.destroy();
    chartPie = null;
  }
}

function updateCharts(state) {
  const { y, m } = getYM();
  const elP = document.getElementById('chartProfit');
  const elD = document.getElementById('chartExpenses');
  if (!elP || !elD) return;

  destroyCharts();

  const series = profitSeries(state, 14);
  chartProfit = new Chart(elP, {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [
        {
          label: 'Выручка',
          data: series.revenues,
          borderColor: 'rgb(45, 157, 140)',
          backgroundColor: 'rgba(45, 157, 140, 0.12)',
          tension: 0.25,
          fill: true,
        },
        {
          label: 'Чистая прибыль',
          data: series.profits,
          borderColor: 'rgb(79, 70, 229)',
          backgroundColor: 'rgba(79, 70, 229, 0.08)',
          tension: 0.25,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { ticks: { callback: (v) => `${Math.round(v / 1000)}k` } },
      },
    },
  });

  const cur = computeMonth(state, y, m);
  const pie = cur.pie;
  const labels = ['Закуп (COGS)', 'Маркетинг', 'Зарплаты', 'Аренда', 'Коммуналка', 'Прочее'];
  const data = [
    pie.cogs,
    pie.marketing,
    pie.payroll,
    pie.rent,
    pie.utilities,
    pie.other,
  ];
  const colors = ['#94a3b8', '#2d9d8c', '#6366f1', '#f59e0b', '#38bdf8', '#cbd5e1'];
  const sum = data.reduce((a, b) => a + b, 0);
  chartPie = new Chart(elD, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: sum > 0 ? data : [1],
          backgroundColor: sum > 0 ? colors : ['#e2e8f0'],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.raw || 0;
              const t = sum > 0 ? ((v / sum) * 100).toFixed(1) : '0';
              return `${ctx.label}: ${money(v)} (${t}%)`;
            },
          },
        },
      },
    },
  });
}

function renderPeriodHeader() {
  const { y, m } = getYM();
  document.getElementById('periodTitle').textContent = `${MONTH_NAMES[m - 1]} ${y}`;
  document.getElementById('periodSubtitle').textContent =
    `Период: ${MONTH_NAMES[m - 1]} ${y}. Показатели считаются из единого источника (данные в этом браузере). Редактирование — только в «Интеграции и загрузка».`;
}

const HUB_UNLOCK_KEY = 'profitDataHubUnlock';

function isHubUnlocked() {
  return sessionStorage.getItem(HUB_UNLOCK_KEY) === '1';
}

function updateHubLockUi() {
  const on = isHubUnlocked();
  document.querySelectorAll('.hub-guard').forEach((el) => {
    el.classList.toggle('hidden', !on);
  });
  const badge = document.getElementById('hubLockBadge');
  if (badge) badge.textContent = on ? 'Режим редактирования' : 'Заблокировано';
}

function formatSourceDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

function sourceIconSvg(kind, format) {
  const k = `${kind || ''}:${format || ''}`.toLowerCase();
  if (k.includes('1c') || kind === '1c')
    return '<span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-800 text-xs font-bold" title="1С">1С</span>';
  if (k.includes('moisklad') || kind === 'moisklad')
    return '<span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-800 text-xs font-bold" title="МойСклад">МС</span>';
  if (k.includes('csv') || format === 'csv')
    return '<span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200 text-slate-800 text-xs font-bold" title="CSV">CSV</span>';
  if (k.includes('excel') || kind === 'file' || kind === 'excel')
    return '<span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold" title="Таблица">XLS</span>';
  if (kind === 'demo')
    return '<span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-900 text-xs font-bold" title="Демо">★</span>';
  return '<span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 text-xs font-bold" title="Локально">●</span>';
}

function renderDataSourceStrip(state) {
  const el = document.getElementById('dashboardSourceStrip');
  if (!el) return;
  const ds = state.dataSource || {};
  const label = escapeHtml(ds.label || 'Локальные данные');
  const when = formatSourceDate(ds.updatedAt);
  const icon = sourceIconSvg(ds.kind, ds.format);
  el.innerHTML = `
    <div class="flex items-center gap-3 min-w-0">${icon}
      <div class="min-w-0">
        <p class="font-semibold text-ink">Источник данных</p>
        <p class="text-xs text-muted truncate">${label}</p>
      </div>
    </div>
    <div class="text-sm text-muted sm:ml-auto">
      Данные актуальны на <span class="font-medium text-ink">${when}</span>
    </div>`;
}

function renderInventoryKpis(data) {
  const inv = data.inventory || {};
  const items = [
    { label: 'Продано, шт', value: String(inv.soldPieces ?? 0), sub: 'за месяц' },
    { label: 'Выручка', value: money(inv.soldRevenueRub ?? 0), sub: 'розница × шт' },
    { label: 'Остаток, шт', value: String(inv.stockPieces ?? 0), sub: 'по справочнику' },
    { label: 'Остаток ₽ закуп', value: money(inv.stockRubPurchase ?? 0), sub: 'по себестоимости' },
    { label: 'Остаток ₽ розница', value: money(inv.stockRubRetail ?? 0), sub: 'потенциальная выручка' },
  ];
  const grid = document.getElementById('inventoryKpiGrid');
  if (!grid) return;
  grid.innerHTML = items
    .map(
      (k) => `
    <div class="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p class="text-[11px] font-semibold text-muted uppercase tracking-wide">${k.label}</p>
      <p class="text-lg font-bold text-ink mt-1">${k.value}</p>
      <p class="text-[11px] text-muted mt-0.5">${k.sub}</p>
    </div>`
    )
    .join('');
}

function renderOverview(data) {
  const inv = data.inventory || {};
  const blocks = [
    {
      title: 'Выручка и валовая маржа',
      summary: `${money(data.revenue)} · валовая ${money(data.grossProfit)}`,
      body: `COGS ${money(data.cogs)} (${pct(data.purchaseShare * 100)} от выручки). Динамика выручки: ${deltaBadge(data.revDeltaPct)}`,
    },
    {
      title: 'Продажи и остатки (за выбранный месяц)',
      summary: `${inv.soldPieces ?? 0} шт продано · остаток ${inv.stockPieces ?? 0} шт`,
      body: `Выручка от продаж: ${money(inv.soldRevenueRub ?? 0)}. Остатки по закупу: ${money(inv.stockRubPurchase ?? 0)}; по рознице (потенциал): ${money(inv.stockRubRetail ?? 0)}.`,
    },
    {
      title: 'Маркетинг',
      summary: `${money(data.marketingTotal)} · каналы ${money(data.marketingChannels)}`,
      body: `Доп. маркетинг из журнала: ${money(data.marketingExtra)}. Динамика: ${deltaBadge(data.mktDeltaPct)}`,
    },
    {
      title: 'ФОТ и аренда',
      summary: `${money(data.payrollTotal)} ФОТ · ${money(data.rentTotal)} аренда`,
      body: 'Суммы из раздела расходов (единый источник) — учитываются каждый месяц.',
    },
    {
      title: 'Чистая прибыль',
      summary: `${money(data.net)}`,
      body: `Изменение к прошлому месяцу: ${deltaBadge(data.netDeltaPct)}`,
    },
  ];
  const el = document.getElementById('overviewBlocks');
  if (!el) return;
  el.innerHTML = blocks
    .map(
      (b, i) => `
    <details class="rounded-2xl border border-slate-200/80 bg-card shadow-sm overflow-hidden">
      <summary class="cursor-pointer p-4 flex gap-3 items-start list-none hover:bg-slate-50/80">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 text-sm font-bold">${i + 1}</span>
        <div class="min-w-0 flex-1">
          <p class="font-bold text-sm">${b.title}</p>
          <p class="text-xs text-muted mt-1">${b.summary}</p>
        </div>
        <svg class="chev w-4 h-4 text-muted shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </summary>
      <div class="px-4 pb-4 text-xs text-muted border-t border-slate-100 leading-relaxed"><p class="pt-3">${b.body}</p></div>
    </details>`
    )
    .join('');
}

function renderKpis(data) {
  const items = [
    { label: 'Выручка', value: money(data.revenue), delta: data.revDeltaPct },
    { label: 'Маркетинг', value: money(data.marketingTotal), delta: data.mktDeltaPct },
    { label: 'Закуп (COGS)', value: money(data.cogs), delta: data.cogsDeltaPct },
    { label: 'Чистая прибыль', value: money(data.net), delta: data.netDeltaPct },
  ];
  const grid = document.getElementById('kpiGrid');
  if (!grid) return;
  grid.innerHTML = items
    .map((k) => {
      const isUp = k.delta > 0;
      const colorClass = k.delta === 0 ? 'text-muted' : isUp ? 'text-up' : 'text-down';
      const bgClass = k.delta === 0 ? 'bg-slate-100' : isUp ? 'bg-upbg' : 'bg-downbg';
      const arrow = k.delta > 0 ? '▲' : k.delta < 0 ? '▼' : '—';
      return `
      <div class="rounded-2xl border border-slate-200/80 bg-card p-4 shadow-sm relative overflow-hidden">
        <p class="text-xs text-muted font-medium">${k.label}</p>
        <p class="text-lg font-bold mt-1">${k.value}</p>
        <p class="text-xs mt-2 inline-flex font-semibold ${colorClass} ${bgClass} px-2 py-1 rounded-lg">${arrow} ${k.delta === 0 ? 'к пр. мес.' : `${Math.abs(k.delta).toFixed(1)}%`}</p>
      </div>`;
    })
    .join('');
}

function renderBusinessUnit(data) {
  const rows = [
    { k: 'Заказов', v: String(data.orders) },
    { k: 'Средний чек', v: money(data.avgOrder) },
    { k: 'COGS на заказ', v: money(data.orders ? data.cogs / data.orders : 0) },
    { k: 'Маркетинг на заказ', v: money(data.mktPerOrder) },
    { k: 'Вклад на заказ', v: money(data.contribPerOrder), h: data.contribPerOrder >= 0 },
    { k: 'Чистая на заказ', v: money(data.netPerOrder), h: data.netPerOrder >= 0 },
  ];
  const el = document.getElementById('businessUnitGrid');
  if (!el) return;
  el.innerHTML = rows
    .map(
      (r) => `
    <div class="flex justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs">
      <span class="text-muted">${r.k}</span>
      <span class="font-semibold ${r.h === false ? 'text-down' : r.h ? 'text-up' : 'text-ink'}">${r.v}</span>
    </div>`
    )
    .join('');
}

function renderDashboard(state) {
  const { y, m } = getYM();
  const data = computeWithPrev(state, y, m);
  renderPeriodHeader();
  renderDataSourceStrip(state);
  renderOverview(data);
  renderKpis(data);
  renderInventoryKpis(data);
  updateCharts(state);
}

function renderSalesTableRows(state, key, readOnly) {
  const merged = getMergedSales(state, key);
  return merged
    .map((line) => {
      const p = state.catalog.find((c) => c.id === line.catalogId);
      if (!p) return '';
      const qty = Number(line.qty) || 0;
      const stock = Math.max(0, Math.floor(Number(p.stockQty) || 0));
      const stCost = stock * (Number(p.purchase) || 0);
      const stRet = stock * (Number(p.retail) || 0);
      const qtyCell = readOnly
        ? `<td class="p-3 font-medium">${qty}</td>`
        : `<td class="p-3"><input type="number" min="0" step="1" data-sale-qty data-catalog-id="${p.id}" value="${qty}" class="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm" /></td>`;
      return `<tr class="border-t border-slate-100">
        <td class="p-3 font-medium">${escapeHtml(p.name)}</td>
        ${qtyCell}
        <td class="p-3 font-medium">${money(qty * p.retail)}</td>
        <td class="p-3">${money(p.retail)}</td>
        <td class="p-3">${money(p.purchase)}</td>
        <td class="p-3">${money(qty * p.purchase)}</td>
        <td class="p-3">${stock}</td>
        <td class="p-3">${money(stCost)}</td>
        <td class="p-3">${money(stRet)}</td>
      </tr>`;
    })
    .join('');
}

function renderChannelsRows(data, readOnly) {
  return (data.channels || [])
    .map(
      (c, idx) =>
        readOnly
          ? `<tr class="border-t border-slate-100">
        <td class="p-2 font-medium">${escapeHtml(c.name)}</td>
        <td class="p-2">${money(c.revenue)}</td>
        <td class="p-2">${money(c.spend)}</td>
        <td class="p-2">${c.romi.toFixed(2)}</td>
        <td class="p-2">${deltaBadge(c.delta)}</td>
        <td class="p-2 font-medium ${c.profit >= 0 ? 'text-up' : 'text-down'}">${money(c.profit)}</td>
      </tr>`
          : `<tr class="border-t border-slate-100" data-ch-idx="${idx}">
        <td class="p-2"><input type="text" class="ch-name w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${escAttr(c.name)}" /></td>
        <td class="p-2"><input type="number" class="ch-rev w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${c.revenue}" /></td>
        <td class="p-2"><input type="number" class="ch-spend w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${c.spend}" /></td>
        <td class="p-2">${c.romi.toFixed(2)}</td>
        <td class="p-2">${deltaBadge(c.delta)}</td>
        <td class="p-2 font-medium ${c.profit >= 0 ? 'text-up' : 'text-down'}">${money(c.profit)}</td>
      </tr>`
    )
    .join('');
}

/** @param {boolean} readOnly — просмотр на вкладке «Продажи»; false — редактирование в Data Hub */
function renderSales(state, readOnly = true) {
  const { y, m } = getYM();
  const key = periodKey(y, m);
  const data = computeWithPrev(state, y, m);
  renderPeriodHeader();

  const qtyBodyId = readOnly ? 'salesQtyBody' : 'hubSalesQtyBody';
  const chBodyId = readOnly ? 'channelsEditBody' : 'hubChannelsEditBody';

  const tbody = document.getElementById(qtyBodyId);
  if (tbody) tbody.innerHTML = renderSalesTableRows(state, key, readOnly);

  const month = ensureMonth(state, key);
  const ordVal = month.orders ?? data.orders;
  if (readOnly) {
    const disp = document.getElementById('displayOrders');
    if (disp) disp.textContent = String(ordVal ?? 0);
  } else {
    const hubOrd = document.getElementById('hubInputOrders');
    if (hubOrd) hubOrd.value = ordVal;
  }

  const chBody = document.getElementById(chBodyId);
  if (chBody) chBody.innerHTML = renderChannelsRows(data, readOnly);

  const unitBody = document.getElementById('unitBody');
  if (unitBody && readOnly) {
    unitBody.innerHTML = data.products
      .map(
        (p) => `<tr class="border-t border-slate-100">
      <td class="p-3">${escapeHtml(p.sku)} <span class="text-muted text-xs">(${escapeHtml(p.cat)})</span></td>
      <td class="p-3">${p.soldQty}</td>
      <td class="p-3 font-medium">${money(p.soldRevenue)}</td>
      <td class="p-3">${p.stockQty}</td>
      <td class="p-3">${money(p.stockValueCost)}</td>
      <td class="p-3">${money(p.stockValueRetail)}</td>
      <td class="p-3 font-medium">${p.marginPct.toFixed(0)}%</td>
      <td class="p-3">${money(p.mktPerUnit)}</td>
      <td class="p-3 font-semibold ${p.contribPerUnit >= 0 ? 'text-up' : 'text-down'}">${money(p.contribPerUnit)}</td>
      <td class="p-3 font-semibold ${p.contribTotal >= 0 ? 'text-up' : 'text-down'}">${money(p.contribTotal)}</td>
    </tr>`
      )
      .join('');
  }

  if (readOnly) renderBusinessUnit(data);
}

function renderPayrollRows(rows, readOnly) {
  return (rows || [])
    .map((r) =>
      readOnly
        ? `<tr class="border-t border-slate-100">
      <td class="p-2">${escapeHtml(r.fullName)}</td>
      <td class="p-2 text-muted">${escapeHtml(r.position || '—')}</td>
      <td class="p-2 font-medium">${money(r.amount)}</td>
    </tr>`
        : `<tr class="border-t border-slate-100">
      <td class="p-2">${escapeHtml(r.fullName)}</td>
      <td class="p-2 text-muted">${escapeHtml(r.position || '—')}</td>
      <td class="p-2 font-medium">${money(r.amount)}</td>
      <td class="p-2"><button type="button" data-del-payroll="${r.id}" class="text-xs text-red-600 hover:underline">Удалить</button></td>
    </tr>`
    )
    .join('');
}

function renderRentRows(rows, readOnly) {
  return (rows || [])
    .map((r) =>
      readOnly
        ? `<tr class="border-t border-slate-100">
      <td class="p-2">${escapeHtml(r.title)}</td>
      <td class="p-2 font-medium">${money(r.amount)}</td>
    </tr>`
        : `<tr class="border-t border-slate-100">
      <td class="p-2">${escapeHtml(r.title)}</td>
      <td class="p-2 font-medium">${money(r.amount)}</td>
      <td class="p-2"><button type="button" data-del-rent="${r.id}" class="text-xs text-red-600 hover:underline">Удалить</button></td>
    </tr>`
    )
    .join('');
}

function renderExpenseLinesHtml(lines, readOnly) {
  if (!lines.length)
    return `<li class="px-4 py-6 text-center text-muted text-sm">Нет строк за этот месяц.</li>`;
  return lines
    .map((e) => {
      const cat = EXPENSE_CATEGORIES.find((c) => c.id === e.category);
      const del = readOnly
        ? ''
        : `<button type="button" data-del-expense="${e.id}" class="text-xs text-red-600 hover:underline w-full text-left sm:w-auto">Удалить</button>`;
      return `<li class="flex flex-wrap justify-between gap-2 px-4 py-3 bg-white">
            <span><span class="font-medium">${escapeHtml(cat?.label || e.category)}</span> — ${escapeHtml(e.note || '—')}</span>
            <span class="font-semibold">${money(e.amount)}</span>
            ${del}
          </li>`;
    })
    .join('');
}

/** @param {boolean} readOnly */
function renderExpenses(state, readOnly = true) {
  const { y, m } = getYM();
  const key = periodKey(y, m);
  renderPeriodHeader();

  const payId = readOnly ? 'payrollBody' : 'hubPayrollBody';
  const rentId = readOnly ? 'rentBody' : 'hubRentBody';
  const listId = readOnly ? 'expenseLinesList' : 'hubExpenseLinesList';

  const pay = document.getElementById(payId);
  if (pay) pay.innerHTML = renderPayrollRows(state.payroll, readOnly);

  const rent = document.getElementById(rentId);
  if (rent) rent.innerHTML = renderRentRows(state.rent, readOnly);

  const lines = (state.expenseLines || []).filter((e) => e.periodKey === key);
  const list = document.getElementById(listId);
  if (list) list.innerHTML = renderExpenseLinesHtml(lines, readOnly);

  const sel = document.getElementById('expenseCategory');
  if (sel && !readOnly && !sel.dataset.ready) {
    sel.innerHTML = EXPENSE_CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join('');
    sel.dataset.ready = '1';
  }
}

function renderCatalogRows(state, key, readOnly) {
  const merged = getMergedSales(state, key);
  return state.catalog
    .map((p) => {
      const line = merged.find((l) => l.catalogId === p.id);
      const sold = Number(line?.qty) || 0;
      const stock = Math.max(0, Math.floor(Number(p.stockQty) || 0));
      const revM = sold * (Number(p.retail) || 0);
      const stCost = stock * (Number(p.purchase) || 0);
      const stRet = stock * (Number(p.retail) || 0);
      if (readOnly) {
        return `<tr class="border-t border-slate-100">
    <td class="p-2 font-medium">${escapeHtml(p.name)}</td>
    <td class="p-2">${escapeHtml(p.sku)}</td>
    <td class="p-2">${money(p.retail)}</td>
    <td class="p-2">${money(p.purchase)}</td>
    <td class="p-2">${stock}</td>
    <td class="p-2 text-sm font-medium">${sold}</td>
    <td class="p-2 text-sm font-medium">${money(revM)}</td>
    <td class="p-2 text-sm">${money(stCost)}</td>
    <td class="p-2 text-sm">${money(stRet)}</td>
    <td class="p-2 text-sm">${escapeHtml(p.category || '')}</td>
  </tr>`;
      }
      return `<tr class="border-t border-slate-100">
    <td class="p-2"><input data-cat-name="${p.id}" class="w-full max-w-[200px] rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${escAttr(p.name)}" /></td>
    <td class="p-2"><input data-cat-sku="${p.id}" class="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${escAttr(p.sku)}" /></td>
    <td class="p-2"><input type="number" data-cat-retail="${p.id}" class="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${p.retail}" /></td>
    <td class="p-2"><input type="number" data-cat-purchase="${p.id}" class="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${p.purchase}" /></td>
    <td class="p-2"><input type="number" min="0" step="1" data-cat-stock="${p.id}" class="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${stock}" /></td>
    <td class="p-2 text-sm font-medium">${sold}</td>
    <td class="p-2 text-sm font-medium">${money(revM)}</td>
    <td class="p-2 text-sm">${money(stCost)}</td>
    <td class="p-2 text-sm">${money(stRet)}</td>
    <td class="p-2"><input data-cat-cat="${p.id}" class="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${escAttr(p.category || '')}" /></td>
    <td class="p-2"><button type="button" data-del-catalog="${p.id}" class="text-xs text-red-600 hover:underline">Удалить</button></td>
  </tr>`;
    })
    .join('');
}

/** @param {boolean} readOnly */
function renderCatalog(state, readOnly = true) {
  const { y, m } = getYM();
  const key = periodKey(y, m);
  renderPeriodHeader();
  const bodyId = readOnly ? 'catalogBody' : 'hubCatalogBody';
  const body = document.getElementById(bodyId);
  if (!body) return;
  body.innerHTML = renderCatalogRows(state, key, readOnly);
}

function renderBackupList(state) {
  const ul = document.getElementById('backupList');
  if (!ul) return;
  const list = state.preImportBackups || [];
  if (!list.length) {
    ul.innerHTML = '<li class="py-2 text-muted">Пока нет автоматических копий (появятся после первого импорта).</li>';
    return;
  }
  ul.innerHTML = list
    .map(
      (b) => `
    <li class="flex flex-wrap items-center justify-between gap-2 py-2">
      <span class="text-xs text-muted">${formatSourceDate(b.createdAt)} — ${escapeHtml(b.note || '')}</span>
      <button type="button" class="text-xs font-semibold text-accent hover:underline" data-restore-backup="${escAttr(b.id)}">Откатить</button>
    </li>`
    )
    .join('');
}

function renderDataHub(state) {
  renderPeriodHeader();
  renderBackupList(state);
  const int = state.integrations || {};
  const g = document.getElementById('intGoogleKey');
  const m = document.getElementById('intMoiskladKey');
  const c = document.getElementById('intCrmKey');
  const n = document.getElementById('intOneCNotes');
  if (g) g.value = int.googleSheetsApiKey || '';
  if (m) m.value = int.moiskladApiKey || '';
  if (c) c.value = int.crmApiKey || '';
  if (n) n.value = int.oneCNotes || '';
  updateHubLockUi();
}

function setTab(tab) {
  activeTab = tab;
  sessionStorage.setItem('profitTab', tab);
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const t = btn.getAttribute('data-tab');
    const on = t === tab;
    btn.classList.toggle('tab-active', on);
    btn.classList.toggle('tab-inactive', !on);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('hidden', p.id !== `panel-${tab}`);
  });
  updateHubLockUi();
  refresh();
}

function refresh() {
  try {
    const state = getState();
    renderPeriodHeader();
    if (activeTab === 'dashboard') renderDashboard(state);
    else if (activeTab === 'sales') renderSales(state, true);
    else if (activeTab === 'expenses') renderExpenses(state, true);
    else if (activeTab === 'catalog') renderCatalog(state, true);
    else if (activeTab === 'datahub') {
      renderDataHub(state);
      renderSales(state, false);
      renderExpenses(state, false);
      renderCatalog(state, false);
    }
  } catch (e) {
    console.error(e);
    showToast(String(e?.message || e), 'error');
  }
}

function wireTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.getAttribute('data-tab')));
  });
}

function wirePeriod() {
  const onChange = () => {
    savePeriodSelection();
    refresh();
  };
  document.getElementById('selectMonth').addEventListener('change', onChange);
  document.getElementById('selectYear').addEventListener('change', onChange);
}

function initSelects() {
  const monthSel = document.getElementById('selectMonth');
  const yearSel = document.getElementById('selectYear');
  monthSel.innerHTML = '';
  yearSel.innerHTML = '';
  MONTH_NAMES.forEach((name, idx) => {
    const o = document.createElement('option');
    o.value = idx + 1;
    o.textContent = name;
    monthSel.appendChild(o);
  });
  [2025, 2026, 2027, 2028].forEach((year) => {
    const o = document.createElement('option');
    o.value = year;
    o.textContent = String(year);
    yearSel.appendChild(o);
  });
  const sm = sessionStorage.getItem(PERIOD_M_KEY);
  const sy = sessionStorage.getItem(PERIOD_Y_KEY);
  monthSel.value = sm && [...monthSel.options].some((o) => o.value === sm) ? sm : '4';
  yearSel.value = sy && [...yearSel.options].some((o) => o.value === sy) ? sy : '2026';
}

function wireSales() {
  const panel = document.getElementById('panel-datahub');
  if (!panel) return;

  panel.addEventListener('change', (e) => {
    if (!isHubUnlocked()) return;
    const t = e.target;
    const { y, m } = getYM();
    const key = periodKey(y, m);

    if (t.matches('[data-sale-qty]')) {
      const id = t.getAttribute('data-catalog-id');
      const qty = Math.max(0, Math.floor(Number(t.value) || 0));
      patchState((s) => {
        writeMergedSales(s, key);
        s.months[key].sales = s.months[key].sales.map((l) =>
          l.catalogId === id ? { catalogId: id, qty } : l
        );
      });
      setDataSourceMeta({ kind: 'manual', format: null, label: 'Ручное изменение продаж' });
      return;
    }

    if (t.matches('#hubInputOrders')) {
      const v = Math.max(0, Math.floor(Number(t.value) || 0));
      patchState((s) => {
        ensureMonth(s, key).orders = v;
      });
      setDataSourceMeta({ kind: 'manual', format: null, label: 'Ручное изменение заказов' });
    }
  });

  panel.addEventListener('change', (e) => {
    if (!isHubUnlocked()) return;
    const tr = e.target.closest('tr[data-ch-idx]');
    if (!tr) return;
    const idx = +tr.getAttribute('data-ch-idx');
    if (Number.isNaN(idx)) return;
    const { y, m } = getYM();
    const key = periodKey(y, m);
    const name = tr.querySelector('.ch-name')?.value ?? '';
    const revenue = Math.max(0, Number(tr.querySelector('.ch-rev')?.value) || 0);
    const spend = Math.max(0, Number(tr.querySelector('.ch-spend')?.value) || 0);
    patchState((s) => {
      const mo = ensureMonth(s, key);
      const ch = [...(mo.channels || [])];
      if (!ch[idx]) return;
      ch[idx] = { ...ch[idx], name, revenue, spend };
      mo.channels = ch;
    });
    setDataSourceMeta({ kind: 'manual', format: null, label: 'Ручное изменение каналов' });
  });
}

function wireExpenses() {
  document.getElementById('formPayroll')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isHubUnlocked()) return;
    const fd = new FormData(e.target);
    patchState((s) => {
      s.payroll = s.payroll || [];
      s.payroll.push({
        id: uid('pay'),
        fullName: String(fd.get('fullName') || '').trim(),
        position: String(fd.get('position') || '').trim(),
        amount: Math.max(0, Number(fd.get('amount')) || 0),
      });
    });
    setDataSourceMeta({ kind: 'manual', format: null, label: 'Ручной ввод ФОТ' });
    e.target.reset();
  });
  document.getElementById('formRent')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isHubUnlocked()) return;
    const fd = new FormData(e.target);
    patchState((s) => {
      s.rent = s.rent || [];
      s.rent.push({
        id: uid('rent'),
        title: String(fd.get('title') || '').trim(),
        amount: Math.max(0, Number(fd.get('amount')) || 0),
      });
    });
    setDataSourceMeta({ kind: 'manual', format: null, label: 'Ручной ввод аренды' });
    e.target.reset();
  });
  document.getElementById('formExpense')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isHubUnlocked()) return;
    const { y, m } = getYM();
    const key = periodKey(y, m);
    const fd = new FormData(e.target);
    patchState((s) => {
      s.expenseLines = s.expenseLines || [];
      s.expenseLines.push({
        id: uid('exp'),
        periodKey: key,
        category: String(fd.get('category') || 'other'),
        amount: Math.max(0, Number(fd.get('amount')) || 0),
        note: String(fd.get('note') || '').trim(),
      });
    });
    setDataSourceMeta({ kind: 'manual', format: null, label: 'Ручной ввод расхода' });
    e.target.reset();
  });

  document.getElementById('panel-datahub')?.addEventListener('click', (e) => {
    if (!isHubUnlocked()) return;
    const t = e.target;
    if (t.matches('[data-del-payroll]')) {
      const id = t.getAttribute('data-del-payroll');
      patchState((s) => {
        s.payroll = (s.payroll || []).filter((r) => r.id !== id);
      });
      setDataSourceMeta({ kind: 'manual', format: null, label: 'Удаление строки ФОТ' });
    }
    if (t.matches('[data-del-rent]')) {
      const id = t.getAttribute('data-del-rent');
      patchState((s) => {
        s.rent = (s.rent || []).filter((r) => r.id !== id);
      });
      setDataSourceMeta({ kind: 'manual', format: null, label: 'Удаление аренды' });
    }
    if (t.matches('[data-del-expense]')) {
      const id = t.getAttribute('data-del-expense');
      patchState((s) => {
        s.expenseLines = (s.expenseLines || []).filter((r) => r.id !== id);
      });
      setDataSourceMeta({ kind: 'manual', format: null, label: 'Удаление расхода' });
    }
    if (t.matches('[data-restore-backup]')) {
      const id = t.getAttribute('data-restore-backup');
      if (id && confirm('Восстановить данные из этой резервной копии? Текущее состояние будет заменено.')) {
        if (restorePreImportBackup(id)) {
          showToast('Данные восстановлены из копии.');
        } else {
          showToast('Не удалось восстановить копию.', 'error');
        }
      }
    }
  });
}

function wireCatalog() {
  document.getElementById('formCatalog')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isHubUnlocked()) return;
    const fd = new FormData(e.target);
    const newId = uid('cat');
    patchState((s) => {
      s.catalog.push({
        id: newId,
        name: String(fd.get('name') || '').trim(),
        sku: String(fd.get('sku') || '').trim(),
        retail: Math.max(0, Number(fd.get('retail')) || 0),
        purchase: Math.max(0, Number(fd.get('purchase')) || 0),
        category: String(fd.get('category') || '').trim() || '—',
        stockQty: Math.max(0, Math.floor(Number(fd.get('stockQty')) || 0)),
      });
      for (const k of Object.keys(s.months)) {
        writeMergedSales(s, k);
      }
    });
    setDataSourceMeta({ kind: 'manual', format: null, label: 'Добавление позиции в справочник' });
    e.target.reset();
  });

  document.getElementById('panel-datahub')?.addEventListener('change', (e) => {
    if (!isHubUnlocked()) return;
    const t = e.target;
    const id =
      t.getAttribute('data-cat-name') ||
      t.getAttribute('data-cat-sku') ||
      t.getAttribute('data-cat-retail') ||
      t.getAttribute('data-cat-purchase') ||
      t.getAttribute('data-cat-stock') ||
      t.getAttribute('data-cat-cat');
    if (!id) return;
    patchState((s) => {
      const p = s.catalog.find((c) => c.id === id);
      if (!p) return;
      if (t.matches('[data-cat-name]')) p.name = t.value;
      if (t.matches('[data-cat-sku]')) p.sku = t.value;
      if (t.matches('[data-cat-retail]')) p.retail = Math.max(0, Number(t.value) || 0);
      if (t.matches('[data-cat-purchase]')) p.purchase = Math.max(0, Number(t.value) || 0);
      if (t.matches('[data-cat-stock]')) p.stockQty = Math.max(0, Math.floor(Number(t.value) || 0));
      if (t.matches('[data-cat-cat]')) p.category = t.value;
    });
    setDataSourceMeta({ kind: 'manual', format: null, label: 'Правка справочника' });
  });

  document.getElementById('panel-datahub')?.addEventListener('click', (e) => {
    if (!isHubUnlocked()) return;
    if (e.target.matches('[data-del-catalog]')) {
      const id = e.target.getAttribute('data-del-catalog');
      patchState((s) => {
        s.catalog = s.catalog.filter((c) => c.id !== id);
        for (const k of Object.keys(s.months)) {
          const mo = s.months[k];
          mo.sales = (mo.sales || []).filter((l) => l.catalogId !== id);
        }
      });
      setDataSourceMeta({ kind: 'manual', format: null, label: 'Удаление из справочника' });
    }
  });
}

function wireDataHub() {
  document.getElementById('btnHubUnlock')?.addEventListener('click', () => {
    const code = window.prompt('Код доступа к разделу редактирования (по умолчанию: 0000):', '');
    if (code === null) return;
    if (code === '0000' || code === '') {
      sessionStorage.setItem(HUB_UNLOCK_KEY, '1');
      updateHubLockUi();
      refresh();
      showToast('Режим редактирования включён на эту сессию браузера.');
    } else {
      showToast('Неверный код.', 'error');
    }
  });

  document.getElementById('btnReloadSource')?.addEventListener('click', () => {
    if (!confirm('Подтянуть данные заново из localStorage этого браузера? Несохранённые на другой вкладке изменения не подхватятся.')) return;
    if (reloadStateFromDisk()) {
      showToast('Данные перечитаны из источника (localStorage).');
    } else {
      showToast('В хранилище нет сохранённого состояния.', 'error');
    }
  });

  document.getElementById('btnSaveIntegrations')?.addEventListener('click', () => {
    if (!isHubUnlocked()) {
      showToast('Сначала войдите в режим редактирования.', 'error');
      return;
    }
    if (!confirm('Сохранить ключи и заметки интеграций в этом браузере?')) return;
    const g = document.getElementById('intGoogleKey')?.value ?? '';
    const m = document.getElementById('intMoiskladKey')?.value ?? '';
    const c = document.getElementById('intCrmKey')?.value ?? '';
    const n = document.getElementById('intOneCNotes')?.value ?? '';
    patchState((s) => {
      s.integrations = {
        googleSheetsApiKey: String(g),
        moiskladApiKey: String(m),
        crmApiKey: String(c),
        oneCNotes: String(n),
      };
    });
    setDataSourceMeta({ kind: 'settings', format: null, label: 'Настройки интеграций' });
    showToast('Настройки интеграций сохранены.');
  });
}

function wireReset() {
  document.getElementById('btnResetDemo')?.addEventListener('click', () => {
    if (!isHubUnlocked()) {
      showToast('Сначала откройте «Интеграции» и войдите в режим редактирования.', 'error');
      return;
    }
    if (confirm('Сбросить все сохранённые данные и вернуть демо?')) {
      localStorage.removeItem(STORAGE_KEY);
      resetToDemo();
      setTab('dashboard');
    }
  });
}

function wirePersist() {
  document.getElementById('btnPersist')?.addEventListener('click', async () => {
    if (!isHubUnlocked()) {
      showToast('Сначала войдите в режим редактирования.', 'error');
      return;
    }
    if (!confirm('Сохранить текущее состояние в localStorage этого браузера?')) return;
    await dataRepository.flush();
    showToast('Данные сохранены в этом браузере (localStorage).');
  });
}

const IMPORT_KIND_LABELS = {
  excel: 'Excel / таблица',
  '1c': '1С (выгрузка)',
  moisklad: 'МойСклад',
  csv: 'CSV',
};

function wireImportCatalog() {
  const btn = document.getElementById('btnImportCatalog');
  const input = document.getElementById('importCatalogFile');
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    if (!isHubUnlocked()) {
      showToast('Сначала войдите в режим редактирования.', 'error');
      return;
    }
    input.click();
  });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !isHubUnlocked()) return;
    try {
      const rows = await parseImportFile(file);
      if (!rows.length) {
        showToast('В файле не найдено строк для импорта.', 'error');
        return;
      }
      const { y, m } = getYM();
      const key = periodKey(y, m);
      const kindSel = document.getElementById('importSourceKind')?.value || 'excel';
      const kindLabel = IMPORT_KIND_LABELS[kindSel] || kindSel;
      pushPreImportBackup(`Перед импортом: ${file.name}`);
      await dataRepository.importCatalogRows(rows, key);
      setDataSourceMeta({
        kind: 'file',
        format: kindSel,
        label: `${kindLabel}: ${file.name}`,
        fileName: file.name,
      });
      showToast(`Импорт выполнен: ${rows.length} строк. Период: ${MONTH_NAMES[m - 1]} ${y}. Создана резервная копия.`);
      setTab('catalog');
    } catch (err) {
      showToast(err?.message || 'Ошибка импорта файла', 'error');
    }
  });
}

subscribe(() => refresh());

initSelects();
wireTabs();
wirePeriod();
wireSales();
wireExpenses();
wireCatalog();
wireDataHub();
wireReset();
wirePersist();
wireImportCatalog();

const loaded = loadFromStorage();
if (!loaded && !localStorage.getItem(STORAGE_KEY)) persist();
else if (loaded) persist();

updateHubLockUi();
setTab(activeTab);

window.__profitAppReady = true;
