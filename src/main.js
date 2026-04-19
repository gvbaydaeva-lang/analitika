import Chart from 'chart.js/auto';
import { getState, patchState, subscribe, loadFromStorage, resetToDemo, persist, STORAGE_KEY } from './state.js';
import {
  computeWithPrev,
  computeMonth,
  profitSeries,
  MONTH_NAMES,
  EXPENSE_CATEGORIES,
  periodKey,
} from './aggregates.js';

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
  const y = +document.getElementById('selectYear').value;
  const m = +document.getElementById('selectMonth').value;
  return { y, m };
}

function ensureMonth(state, key) {
  if (!state.months[key]) {
    state.months[key] = { orders: 0, channels: [], sales: [] };
  }
  return state.months[key];
}

/** Список продаж по справочнику (без побочных эффектов) */
function getMergedSales(state, key) {
  const month = state.months[key] || { sales: [] };
  const lines = [...(month.sales || [])];
  const ids = new Set(lines.map((l) => l.catalogId));
  for (const p of state.catalog) {
    if (!ids.has(p.id)) lines.push({ catalogId: p.id, qty: 0 });
  }
  return lines;
}

function writeMergedSales(draft, key) {
  ensureMonth(draft, key);
  draft.months[key].sales = getMergedSales(draft, key);
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
    'Данные учёта за выбранный месяц. Изменения сохраняются в браузере автоматически.';
}

function renderOverview(data) {
  const blocks = [
    {
      title: 'Выручка и валовая маржа',
      summary: `${money(data.revenue)} · валовая ${money(data.grossProfit)}`,
      body: `COGS ${money(data.cogs)} (${pct(data.purchaseShare * 100)} от выручки). Динамика выручки: ${deltaBadge(data.revDeltaPct)}`,
    },
    {
      title: 'Маркетинг',
      summary: `${money(data.marketingTotal)} · каналы ${money(data.marketingChannels)}`,
      body: `Доп. маркетинг из журнала: ${money(data.marketingExtra)}. Динамика: ${deltaBadge(data.mktDeltaPct)}`,
    },
    {
      title: 'ФОТ и аренда',
      summary: `${money(data.payrollTotal)} ФОТ · ${money(data.rentTotal)} аренда`,
      body: 'Суммы из вкладки «Расходы и команда» — учитываются каждый месяц.',
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
  renderOverview(data);
  renderKpis(data);
  updateCharts(state);
}

function renderSales(state) {
  const { y, m } = getYM();
  const key = periodKey(y, m);
  const data = computeWithPrev(state, y, m);
  renderPeriodHeader();

  const merged = getMergedSales(state, key);

  const tbody = document.getElementById('salesQtyBody');
  if (tbody) {
    tbody.innerHTML = merged
      .map((line) => {
        const p = state.catalog.find((c) => c.id === line.catalogId);
        if (!p) return '';
        const qty = Number(line.qty) || 0;
        return `<tr class="border-t border-slate-100">
        <td class="p-3 font-medium">${escapeHtml(p.name)}</td>
        <td class="p-3"><input type="number" min="0" step="1" data-sale-qty data-catalog-id="${p.id}" value="${qty}" class="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm" /></td>
        <td class="p-3">${money(p.retail)}</td>
        <td class="p-3">${money(p.purchase)}</td>
        <td class="p-3">${money(qty * p.retail)}</td>
        <td class="p-3">${money(qty * p.purchase)}</td>
      </tr>`;
      })
      .join('');
  }

  const ordersInput = document.getElementById('inputOrders');
  if (ordersInput) {
    const month = ensureMonth(state, key);
    ordersInput.value = month.orders ?? data.orders;
  }

  const chBody = document.getElementById('channelsEditBody');
  if (chBody) {
    chBody.innerHTML = (data.channels || [])
      .map(
        (c, idx) => `
      <tr class="border-t border-slate-100" data-ch-idx="${idx}">
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

  const unitBody = document.getElementById('unitBody');
  if (unitBody) {
    unitBody.innerHTML = data.products
      .map(
        (p) => `<tr class="border-t border-slate-100">
      <td class="p-3">${escapeHtml(p.sku)} <span class="text-muted text-xs">(${escapeHtml(p.cat)})</span></td>
      <td class="p-3 font-medium">${p.marginPct.toFixed(0)}%</td>
      <td class="p-3">${money(p.mktPerUnit)}</td>
      <td class="p-3 font-semibold ${p.contribPerUnit >= 0 ? 'text-up' : 'text-down'}">${money(p.contribPerUnit)}</td>
      <td class="p-3 font-semibold ${p.contribTotal >= 0 ? 'text-up' : 'text-down'}">${money(p.contribTotal)}</td>
    </tr>`
      )
      .join('');
  }

  renderBusinessUnit(data);
}

function renderExpenses(state) {
  const { y, m } = getYM();
  const key = periodKey(y, m);
  renderPeriodHeader();

  const pay = document.getElementById('payrollBody');
  if (pay) {
    pay.innerHTML = (state.payroll || [])
      .map(
        (r) => `<tr class="border-t border-slate-100">
      <td class="p-2">${escapeHtml(r.fullName)}</td>
      <td class="p-2 text-muted">${escapeHtml(r.position || '—')}</td>
      <td class="p-2 font-medium">${money(r.amount)}</td>
      <td class="p-2"><button type="button" data-del-payroll="${r.id}" class="text-xs text-red-600 hover:underline">Удалить</button></td>
    </tr>`
      )
      .join('');
  }

  const rent = document.getElementById('rentBody');
  if (rent) {
    rent.innerHTML = (state.rent || [])
      .map(
        (r) => `<tr class="border-t border-slate-100">
      <td class="p-2">${escapeHtml(r.title)}</td>
      <td class="p-2 font-medium">${money(r.amount)}</td>
      <td class="p-2"><button type="button" data-del-rent="${r.id}" class="text-xs text-red-600 hover:underline">Удалить</button></td>
    </tr>`
      )
      .join('');
  }

  const lines = (state.expenseLines || []).filter((e) => e.periodKey === key);
  const list = document.getElementById('expenseLinesList');
  if (list) {
    list.innerHTML = lines.length
      ? lines
          .map((e) => {
            const cat = EXPENSE_CATEGORIES.find((c) => c.id === e.category);
            return `<li class="flex flex-wrap justify-between gap-2 px-4 py-3 bg-white">
            <span><span class="font-medium">${escapeHtml(cat?.label || e.category)}</span> — ${escapeHtml(e.note || '—')}</span>
            <span class="font-semibold">${money(e.amount)}</span>
            <button type="button" data-del-expense="${e.id}" class="text-xs text-red-600 hover:underline w-full text-left sm:w-auto">Удалить</button>
          </li>`;
          })
          .join('')
      : `<li class="px-4 py-6 text-center text-muted text-sm">Нет строк за этот месяц.</li>`;
  }

  const sel = document.getElementById('expenseCategory');
  if (sel && !sel.dataset.ready) {
    sel.innerHTML = EXPENSE_CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join('');
    sel.dataset.ready = '1';
  }
}

function renderCatalog(state) {
  renderPeriodHeader();
  const body = document.getElementById('catalogBody');
  if (!body) return;
  body.innerHTML = state.catalog
    .map(
      (p) => `<tr class="border-t border-slate-100">
    <td class="p-2"><input data-cat-name="${p.id}" class="w-full max-w-[220px] rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${escAttr(p.name)}" /></td>
    <td class="p-2"><input data-cat-sku="${p.id}" class="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${escAttr(p.sku)}" /></td>
    <td class="p-2"><input type="number" data-cat-retail="${p.id}" class="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${p.retail}" /></td>
    <td class="p-2"><input type="number" data-cat-purchase="${p.id}" class="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${p.purchase}" /></td>
    <td class="p-2"><input data-cat-cat="${p.id}" class="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm" value="${escAttr(p.category || '')}" /></td>
    <td class="p-2"><button type="button" data-del-catalog="${p.id}" class="text-xs text-red-600 hover:underline">Удалить</button></td>
  </tr>`
    )
    .join('');
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
  refresh();
}

function refresh() {
  const state = getState();
  renderPeriodHeader();
  if (activeTab === 'dashboard') renderDashboard(state);
  else if (activeTab === 'sales') renderSales(state);
  else if (activeTab === 'expenses') renderExpenses(state);
  else if (activeTab === 'catalog') renderCatalog(state);
}

function wireTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.getAttribute('data-tab')));
  });
}

function wirePeriod() {
  document.getElementById('selectMonth').addEventListener('change', refresh);
  document.getElementById('selectYear').addEventListener('change', refresh);
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
  monthSel.value = '4';
  yearSel.value = '2026';
}

function wireSales() {
  const panel = document.getElementById('panel-sales');
  if (!panel) return;

  panel.addEventListener('change', (e) => {
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
      return;
    }

    if (t.matches('#inputOrders')) {
      const v = Math.max(0, Math.floor(Number(t.value) || 0));
      patchState((s) => {
        ensureMonth(s, key).orders = v;
      });
    }
  });

  panel.addEventListener('change', (e) => {
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
  });
}

function wireExpenses() {
  document.getElementById('formPayroll')?.addEventListener('submit', (e) => {
    e.preventDefault();
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
    e.target.reset();
  });
  document.getElementById('formRent')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    patchState((s) => {
      s.rent = s.rent || [];
      s.rent.push({
        id: uid('rent'),
        title: String(fd.get('title') || '').trim(),
        amount: Math.max(0, Number(fd.get('amount')) || 0),
      });
    });
    e.target.reset();
  });
  document.getElementById('formExpense')?.addEventListener('submit', (e) => {
    e.preventDefault();
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
    e.target.reset();
  });

  document.getElementById('panel-expenses')?.addEventListener('click', (e) => {
    const t = e.target;
    if (t.matches('[data-del-payroll]')) {
      const id = t.getAttribute('data-del-payroll');
      patchState((s) => {
        s.payroll = (s.payroll || []).filter((r) => r.id !== id);
      });
    }
    if (t.matches('[data-del-rent]')) {
      const id = t.getAttribute('data-del-rent');
      patchState((s) => {
        s.rent = (s.rent || []).filter((r) => r.id !== id);
      });
    }
    if (t.matches('[data-del-expense]')) {
      const id = t.getAttribute('data-del-expense');
      patchState((s) => {
        s.expenseLines = (s.expenseLines || []).filter((r) => r.id !== id);
      });
    }
  });
}

function wireCatalog() {
  document.getElementById('formCatalog')?.addEventListener('submit', (e) => {
    e.preventDefault();
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
      });
      for (const k of Object.keys(s.months)) {
        writeMergedSales(s, k);
      }
    });
    e.target.reset();
  });

  document.getElementById('panel-catalog')?.addEventListener('change', (e) => {
    const t = e.target;
    const id =
      t.getAttribute('data-cat-name') ||
      t.getAttribute('data-cat-sku') ||
      t.getAttribute('data-cat-retail') ||
      t.getAttribute('data-cat-purchase') ||
      t.getAttribute('data-cat-cat');
    if (!id) return;
    patchState((s) => {
      const p = s.catalog.find((c) => c.id === id);
      if (!p) return;
      if (t.matches('[data-cat-name]')) p.name = t.value;
      if (t.matches('[data-cat-sku]')) p.sku = t.value;
      if (t.matches('[data-cat-retail]')) p.retail = Math.max(0, Number(t.value) || 0);
      if (t.matches('[data-cat-purchase]')) p.purchase = Math.max(0, Number(t.value) || 0);
      if (t.matches('[data-cat-cat]')) p.category = t.value;
    });
  });

  document.getElementById('panel-catalog')?.addEventListener('click', (e) => {
    if (e.target.matches('[data-del-catalog]')) {
      const id = e.target.getAttribute('data-del-catalog');
      patchState((s) => {
        s.catalog = s.catalog.filter((c) => c.id !== id);
        for (const k of Object.keys(s.months)) {
          const mo = s.months[k];
          mo.sales = (mo.sales || []).filter((l) => l.catalogId !== id);
        }
      });
    }
  });
}

function wireReset() {
  document.getElementById('btnResetDemo')?.addEventListener('click', () => {
    if (confirm('Сбросить все сохранённые данные и вернуть демо?')) {
      localStorage.removeItem(STORAGE_KEY);
      resetToDemo();
      setTab('dashboard');
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
wireReset();

loadFromStorage();
if (!localStorage.getItem(STORAGE_KEY)) persist();

setTab(activeTab);
