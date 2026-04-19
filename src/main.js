import { PERIODS } from './data/periods.js';

const MONTH_NAMES = [
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

function money(n) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n) {
  return new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 }).format(n / 100);
}

function deltaBadge(pctChange) {
  if (pctChange > 0) {
    return `<span class="inline-flex items-center gap-0.5 text-up text-xs font-semibold bg-upbg px-2 py-0.5 rounded-full">▲ ${pctChange.toFixed(1)}%</span>`;
  }
  if (pctChange < 0) {
    return `<span class="inline-flex items-center gap-0.5 text-down text-xs font-semibold bg-downbg px-2 py-0.5 rounded-full">▼ ${Math.abs(pctChange).toFixed(1)}%</span>`;
  }
  return `<span class="text-muted text-xs font-medium">0%</span>`;
}

function enrichProduct(p) {
  const revenue = p.qty * p.retail;
  const cogsTotal = p.qty * p.purchase;
  const grossPerUnit = p.retail - p.purchase;
  const marginPct = p.retail ? (grossPerUnit / p.retail) * 100 : 0;
  const contribPerUnit = grossPerUnit - p.mktPerUnit;
  const contribTotal = contribPerUnit * p.qty;
  return { ...p, revenue, cogsTotal, grossPerUnit, marginPct, contribPerUnit, contribTotal };
}

function periodKey(y, m) {
  return `${y}-${String(m).padStart(2, '0')}`;
}

function getPeriodData(y, m) {
  const key = periodKey(y, m);
  let d = PERIODS[key];
  if (!d) {
    const base = PERIODS['2026-04'];
    const scale = 1 + (m % 3) * 0.02;
    d = JSON.parse(JSON.stringify(base));
    d.revenue = Math.round(base.revenue * scale);
    d.marketing = Math.round(base.marketing * scale);
    d.cogs = Math.round(base.cogs * scale);
  }
  const prevKey = m === 1 ? periodKey(y - 1, 12) : periodKey(y, m - 1);
  let prev = PERIODS[prevKey];
  if (!prev) prev = PERIODS['2026-03'];
  const products = d.products.map(enrichProduct);
  const net = d.revenue - d.marketing - d.fixed - d.cogs;
  const grossProfit = d.revenue - d.cogs;
  const avgOrder = d.orders ? d.revenue / d.orders : 0;
  const purchaseShare = d.revenue ? d.cogs / d.revenue : 0;
  const mktPerOrder = d.orders ? d.marketing / d.orders : 0;
  const contribPerOrder = d.orders ? (grossProfit - d.marketing) / d.orders : 0;
  const netPerOrder = d.orders ? net / d.orders : 0;
  const prevNet = prev.revenue - prev.marketing - prev.fixed - prev.cogs;
  const netDeltaPct = prevNet ? ((net - prevNet) / Math.abs(prevNet)) * 100 : 0;
  const revDeltaPct = prev.revenue ? ((d.revenue - prev.revenue) / prev.revenue) * 100 : 0;
  const mktDeltaPct = prev.marketing ? ((d.marketing - prev.marketing) / prev.marketing) * 100 : 0;
  return {
    ...d,
    products,
    net,
    grossProfit,
    avgOrder,
    purchaseShare,
    mktPerOrder,
    contribPerOrder,
    netPerOrder,
    prev,
    netDeltaPct,
    revDeltaPct,
    mktDeltaPct,
  };
}

function renderOverview(data) {
  const blocks = [
    {
      title: 'Выручка и валовая маржа',
      summary: `${money(data.revenue)} выручка · ${money(data.grossProfit)} валовая после закупа`,
      body: `Закуп (COGS) за период: ${money(data.cogs)} (${pct(data.purchaseShare * 100)} от выручки). Валовая маржа = выручка − COGS. Рост выручки к прошлому месяцу: ${deltaBadge(data.revDeltaPct)}`,
    },
    {
      title: 'Маркетинг',
      summary: `${money(data.marketing)} расходы · ${pct((data.marketing / data.revenue) * 100)} от выручки`,
      body: `Доля маркетинга в выручке показывает долю инвестиций в привлечение. Динамика расхода к прошлому месяцу: ${deltaBadge(data.mktDeltaPct)} (зелёный — рост бюджета, красный — снижение). Оценку эффективности смотрите по ROMI в блоке каналов.`,
    },
    {
      title: 'Фиксированные расходы',
      summary: `${money(data.fixed)} · ${data.fixedLines.length} статей`,
      body: 'Аренда, ФОТ, коммуналка и прочие постоянные затраты не зависят от объёма продаж в кратком периоде. Покрываются вкладом (contribution margin) после маркетинга.',
    },
    {
      title: 'Чистая прибыль',
      summary: `${money(data.net)} · ${money(data.netPerOrder)} на заказ`,
      body: `Чистая = выручка − COGS − маркетинг − фикс. Изменение к прошлому месяцу: ${deltaBadge(data.netDeltaPct)}`,
    },
    {
      title: 'Юнит-экономика бизнеса',
      summary: `Средний чек ${money(data.avgOrder)} · маркетинг/заказ ${money(data.mktPerOrder)}`,
      body: `На один заказ: валовая после закупа ${money((data.revenue - data.cogs) / data.orders)}, маркетинг ${money(data.mktPerOrder)}, вклад ${money(data.contribPerOrder)}, чистая ${money(data.netPerOrder)}. Закуп в среднем «съедает» ${pct(data.purchaseShare * 100)} выручки.`,
    },
    {
      title: 'Портфель SKU',
      summary: `${data.products.length} позиции · вклад по товарам в таблице ниже`,
      body: 'По каждому SKU: розница и закуп на единицу, маржа %, маркетинг на ед., вклад на ед. и суммарный вклад. Разверните строки таблицы для расшифровки.',
    },
  ];

  const el = document.getElementById('overviewBlocks');
  el.innerHTML = blocks
    .map(
      (b, i) => `
      <details class="rounded-2xl border border-slate-100 bg-card shadow-sm overflow-hidden group">
        <summary class="cursor-pointer p-4 hover:bg-slate-50/90 transition-colors flex gap-3 items-start list-none">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 text-sm font-bold">${i + 1}</span>
          <div class="min-w-0 flex-1">
            <p class="font-bold text-ink text-sm">${b.title}</p>
            <p class="text-xs text-muted mt-1 leading-snug">${b.summary}</p>
          </div>
          <svg class="chev w-4 h-4 text-muted shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </summary>
        <div class="px-4 pb-4 pt-0 text-sm text-muted leading-relaxed border-t border-slate-50">
          <p class="pt-3">${b.body}</p>
        </div>
      </details>
    `
    )
    .join('');
}

function renderKpis(data) {
  const prevCogs = data.prev.cogs ?? data.cogs;
  const cogsDeltaPct = prevCogs ? ((data.cogs - prevCogs) / prevCogs) * 100 : 0;
  const items = [
    { label: 'Выручка', value: money(data.revenue), delta: data.revDeltaPct },
    { label: 'Маркетинг', value: money(data.marketing), delta: data.mktDeltaPct },
    { label: 'Закуп (COGS)', value: money(data.cogs), delta: cogsDeltaPct },
    { label: 'Чистая прибыль', value: money(data.net), delta: data.netDeltaPct },
  ];
  const grid = document.getElementById('kpiGrid');
  grid.innerHTML = items
    .map((k) => {
      const isUp = k.delta > 0;
      const colorClass = k.delta === 0 ? 'text-muted' : isUp ? 'text-up' : 'text-down';
      const bgClass = k.delta === 0 ? 'bg-slate-100' : isUp ? 'bg-upbg' : 'bg-downbg';
      const arrow = k.delta > 0 ? '▲' : k.delta < 0 ? '▼' : '—';
      return `
        <div class="rounded-2xl border border-slate-100 bg-card p-4 shadow-sm relative overflow-hidden">
          <div class="absolute top-0 right-0 w-20 h-20 rounded-full -translate-y-8 translate-x-8 opacity-40 ${k.delta > 0 ? 'bg-upbg' : k.delta < 0 ? 'bg-downbg' : 'bg-slate-100'}"></div>
          <p class="text-xs text-muted font-medium relative">${k.label}</p>
          <p class="text-xl font-bold text-ink mt-1 relative">${k.value}</p>
          <p class="text-xs mt-2 relative inline-flex items-center gap-1 font-semibold ${colorClass} ${bgClass} px-2 py-1 rounded-lg">${arrow} ${k.delta === 0 ? 'к пр. мес.' : `${Math.abs(k.delta).toFixed(1)}% к пр. мес.`}</p>
        </div>
      `;
    })
    .join('');
}

function renderBusinessUnit(data) {
  const rows = [
    { k: 'Заказов (ед. объёма)', v: String(data.orders) },
    { k: 'Средний чек (розница)', v: money(data.avgOrder) },
    { k: 'COGS на заказ', v: money(data.cogs / data.orders) },
    { k: 'Валовая на заказ', v: money((data.revenue - data.cogs) / data.orders) },
    { k: 'Маркетинг на заказ', v: money(data.mktPerOrder) },
    { k: 'Вклад на заказ', v: money(data.contribPerOrder), highlight: data.contribPerOrder >= 0 },
    { k: 'Фикс на заказ (нагрузка)', v: money(data.fixed / data.orders) },
    { k: 'Чистая на заказ', v: money(data.netPerOrder), highlight: data.netPerOrder >= 0 },
    { k: 'Доля закупа в выручке', v: pct(data.purchaseShare * 100) },
  ];
  document.getElementById('businessUnitGrid').innerHTML = rows
    .map(
      (r) => `
      <div class="flex justify-between items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5">
        <span class="text-muted text-xs">${r.k}</span>
        <span class="font-semibold text-sm ${r.highlight === false ? 'text-down' : r.highlight === true ? 'text-up' : 'text-ink'}">${r.v}</span>
      </div>
    `
    )
    .join('');
}

function renderChannels(data) {
  document.getElementById('channelsBody').innerHTML = data.channels
    .map(
      (c) => `
      <tr class="border-t border-slate-100 hover:bg-slate-50/50">
        <td class="p-3 font-medium">${c.name}</td>
        <td class="p-3">${money(c.revenue)}</td>
        <td class="p-3">${money(c.spend)}</td>
        <td class="p-3">${c.romi.toFixed(2)}</td>
        <td class="p-3">${deltaBadge(c.delta)}</td>
        <td class="p-3 font-semibold ${c.profit >= 0 ? 'text-up' : 'text-down'}">${money(c.profit)}</td>
      </tr>
    `
    )
    .join('');

  document.getElementById('channelDetails').innerHTML = data.channels
    .map(
      (c) => `
      <details class="rounded-xl border border-slate-100 bg-slate-50/40 text-sm">
        <summary class="cursor-pointer px-4 py-3 font-medium text-ink flex justify-between items-center list-none">
          <span>Подробно: ${c.name}</span>
          <svg class="chev w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </summary>
        <div class="px-4 pb-3 text-muted leading-relaxed border-t border-slate-100 pt-3">
          ROMI ${c.romi.toFixed(2)} означает, что на каждый рубль прямых рекламных затрат приходится ${c.romi.toFixed(2)} ₽ валовой отдачи до распределения закупа (упрощённо).
          Выручка канала ${money(c.revenue)}, расход ${money(c.spend)}. Прибыль канала после модели распределения COGS: ${money(c.profit)}.
          Тренд ROMI к прошлому месяцу: ${deltaBadge(c.delta)}.
        </div>
      </details>
    `
    )
    .join('');
}

function renderProducts(data) {
  document.getElementById('productsBody').innerHTML = data.products
    .map(
      (p) => `
      <tr class="border-t border-slate-100 hover:bg-slate-50/50">
        <td class="p-3 font-medium">${p.sku} <span class="text-xs text-muted font-normal">(${p.cat})</span></td>
        <td class="p-3">${p.qty}</td>
        <td class="p-3">${money(p.retail)}</td>
        <td class="p-3">${money(p.purchase)}</td>
        <td class="p-3">${money(p.revenue)}</td>
        <td class="p-3">${money(p.cogsTotal)}</td>
        <td class="p-3 font-medium">${p.marginPct.toFixed(0)}%</td>
        <td class="p-3">${money(p.mktPerUnit)}</td>
        <td class="p-3 font-semibold ${p.contribPerUnit >= 0 ? 'text-up' : 'text-down'}">${money(p.contribPerUnit)}</td>
        <td class="p-3 font-semibold ${p.contribTotal >= 0 ? 'text-up' : 'text-down'}">${money(p.contribTotal)}</td>
      </tr>
    `
    )
    .join('');

  document.getElementById('productDetails').innerHTML = data.products
    .map(
      (p) => `
      <details class="rounded-xl border border-slate-100 bg-slate-50/40 text-sm">
        <summary class="cursor-pointer px-4 py-3 font-medium text-ink flex justify-between items-center list-none">
          <span>Юнит-карточка: ${p.sku}</span>
          <svg class="chev w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </summary>
        <div class="px-4 pb-3 text-muted leading-relaxed border-t border-slate-100 pt-3 space-y-2">
          <p><strong class="text-ink">Розничная цена</strong> ${money(p.retail)} за единицу продажи.</p>
          <p><strong class="text-ink">Закупочная</strong> ${money(p.purchase)} → валовая на ед. ${money(p.grossPerUnit)} (${p.marginPct.toFixed(0)}% маржи).</p>
          <p><strong class="text-ink">Маркетинг на ед.</strong> ${money(p.mktPerUnit)} (распределение от общего spend пропорционально выручке SKU).</p>
          <p><strong class="text-ink">Вклад на ед.</strong> ${money(p.contribPerUnit)}; <strong class="text-ink">суммарный вклад</strong> ${money(p.contribTotal)} при объёме ${p.qty} шт.</p>
          <p><strong class="text-ink">Выручка по строке</strong> ${money(p.revenue)}, <strong class="text-ink">COGS</strong> ${money(p.cogsTotal)}.</p>
        </div>
      </details>
    `
    )
    .join('');
}

function renderFixed(data) {
  document.getElementById('fixedList').innerHTML =
    data.fixedLines
      .map(
        (line) => `
      <li class="flex justify-between items-center px-4 py-3 bg-white text-sm">
        <span>${line.label}</span>
        <span class="font-semibold text-ink">${money(line.amount)}</span>
      </li>
    `
      )
      .join('') +
    `
      <li class="flex justify-between items-center px-4 py-3 bg-brand-50/60 text-sm font-bold text-ink">
        <span>Итого фикс</span>
        <span>${money(data.fixed)}</span>
      </li>
    `;
}

function renderAi(data) {
  document.getElementById('aiList').innerHTML = data.ai
    .map(
      (t) => `
      <li class="flex gap-2 items-start rounded-lg bg-white/80 border border-indigo-100/60 px-3 py-2">
        <span class="text-accent mt-0.5">◆</span>
        <span class="text-ink/90">${t}</span>
      </li>
    `
    )
    .join('');
}

function refresh() {
  const y = +document.getElementById('selectYear').value;
  const m = +document.getElementById('selectMonth').value;
  document.getElementById('periodTitle').textContent = `${MONTH_NAMES[m - 1]} ${y}`;
  document.getElementById('periodSubtitle').textContent = `Показатели за ${MONTH_NAMES[m - 1].toLowerCase()} ${y}: выручка, маркетинг, закуп (COGS), розничные цены по SKU и агрегированная юнит-экономика.`;

  const data = getPeriodData(y, m);
  renderOverview(data);
  renderKpis(data);
  renderBusinessUnit(data);
  renderChannels(data);
  renderProducts(data);
  renderFixed(data);
  renderAi(data);
}

function initSelects() {
  const monthSel = document.getElementById('selectMonth');
  const yearSel = document.getElementById('selectYear');
  MONTH_NAMES.forEach((name, idx) => {
    const o = document.createElement('option');
    o.value = idx + 1;
    o.textContent = name;
    monthSel.appendChild(o);
  });
  [2025, 2026, 2027].forEach((year) => {
    const o = document.createElement('option');
    o.value = year;
    o.textContent = String(year);
    yearSel.appendChild(o);
  });
  monthSel.value = '4';
  yearSel.value = '2026';
  monthSel.addEventListener('change', refresh);
  yearSel.addEventListener('change', refresh);
}

initSelects();
refresh();
