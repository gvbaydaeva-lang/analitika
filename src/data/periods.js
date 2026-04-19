/**
 * Демо-данные по периодам. Ключ: `${year}-${monthPadded}`.
 * В продакшене замените загрузкой с API или из файла.
 */
export const PERIODS = {
  '2026-03': {
    revenue: 108000,
    marketing: 28000,
    fixed: 19500,
    cogs: 32000,
    orders: 540,
    units: 1200,
    channels: [
      { name: 'Google Ads', revenue: 45000, spend: 14000, romi: 2.1, profit: 16000, delta: -4 },
      { name: 'Instagram', revenue: 28000, spend: 9500, romi: 1.85, profit: 9800, delta: 2 },
      { name: 'Директ', revenue: 20000, spend: 4500, romi: 2.4, profit: 6200, delta: 0 },
    ],
    products: [
      { sku: 'Товар A', qty: 220, retail: 2200, purchase: 880, mktPerUnit: 180, cat: 'A' },
      { sku: 'Товар B', qty: 95, retail: 890, purchase: 620, mktPerUnit: 260, cat: 'C' },
      { sku: 'Услуга «Старт»', qty: 40, retail: 4500, purchase: 900, mktPerUnit: 400, cat: 'B' },
    ],
    fixedLines: [
      { label: 'Аренда', amount: 7500 },
      { label: 'Зарплаты', amount: 9500 },
      { label: 'Коммунальные', amount: 2500 },
    ],
    ai: [
      'Март: база для сравнения — ROMI Google Ads чуть просел к февралю.',
      'Товар B тянет маржу вниз из-за высокой закупки относительно розницы.',
    ],
  },
  '2026-04': {
    revenue: 120000,
    marketing: 30000,
    fixed: 20000,
    cogs: 35000,
    orders: 600,
    units: 1350,
    channels: [
      { name: 'Google Ads', revenue: 50000, spend: 15000, romi: 2.3, profit: 20000, delta: 5 },
      { name: 'Instagram', revenue: 30000, spend: 10000, romi: 2.0, profit: 12000, delta: 8 },
      { name: 'Директ', revenue: 22000, spend: 5000, romi: 2.35, profit: 7000, delta: -2 },
    ],
    products: [
      { sku: 'Товар A', qty: 240, retail: 2200, purchase: 880, mktPerUnit: 200, cat: 'A' },
      { sku: 'Товар B', qty: 100, retail: 900, purchase: 650, mktPerUnit: 280, cat: 'C' },
      { sku: 'Услуга «Старт»', qty: 45, retail: 4500, purchase: 900, mktPerUnit: 420, cat: 'B' },
    ],
    fixedLines: [
      { label: 'Аренда', amount: 8000 },
      { label: 'Зарплаты', amount: 10000 },
      { label: 'Коммунальные', amount: 2000 },
    ],
    ai: [
      'Товар A даёт ~40% вклада по портфелю — имеет смысл масштабировать рекламу при стабильной закупке.',
      'Instagram: ROMI вырос к марту — зафиксируйте креативы и аудитории, которые сработали.',
      'Товар B: низкая маржа; проверьте розничную цену или переговоры по закупке.',
    ],
  },
  '2026-05': {
    revenue: 132500,
    marketing: 33500,
    fixed: 20500,
    cogs: 38000,
    orders: 655,
    units: 1420,
    channels: [
      { name: 'Google Ads', revenue: 55000, spend: 16500, romi: 2.33, profit: 22800, delta: 3 },
      { name: 'Instagram', revenue: 35000, spend: 11500, romi: 2.04, profit: 14200, delta: 4 },
      { name: 'Директ', revenue: 25000, spend: 5500, romi: 2.45, profit: 8200, delta: 6 },
    ],
    products: [
      { sku: 'Товар A', qty: 255, retail: 2250, purchase: 900, mktPerUnit: 210, cat: 'A' },
      { sku: 'Товар B', qty: 105, retail: 920, purchase: 640, mktPerUnit: 270, cat: 'C' },
      { sku: 'Услуга «Старт»', qty: 52, retail: 4600, purchase: 920, mktPerUnit: 430, cat: 'B' },
    ],
    fixedLines: [
      { label: 'Аренда', amount: 8000 },
      { label: 'Зарплаты', amount: 10500 },
      { label: 'Коммунальные', amount: 2000 },
    ],
    ai: [
      'Май: выручка растёт быстрее маркетинга — положительный рычаг.',
      'Директ обогнал прошлый месяц по ROMI; переложите часть бюджета с худших сегментов.',
    ],
  },
};
