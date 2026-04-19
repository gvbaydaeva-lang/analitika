import Papa from 'papaparse';

function parseNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).replace(/\s/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Нормализация заголовка колонки */
function normalizeHeaderKey(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, ' ');
}

/** Сопоставление русских/английских заголовков с полями */
function mapHeaderToField(h) {
  const n = normalizeHeaderKey(h);
  if (/наименование|^название|товар|name|номенклатур/i.test(n)) return 'name';
  if (/артикул|sku|код/i.test(n)) return 'sku';
  if (/закуп|себестоимость|purchase|cost/i.test(n)) return 'purchase';
  if (/розниц|retail|цена\s*продаж/i.test(n)) return 'retail';
  if (/продано/i.test(n)) return 'soldQty';
  if (/остаток/i.test(n)) return 'stockQty';
  return null;
}

/** Из строки-объекта (ключи как в файле) строим каноническую запись */
function rowFromRecord(rec, headerToField) {
  const out = {
    name: '',
    sku: '',
    purchase: 0,
    retail: 0,
    soldQty: 0,
    stockQty: 0,
  };
  for (const [rawKey, val] of Object.entries(rec)) {
    const field = headerToField.get(normalizeHeaderKey(rawKey));
    if (!field) continue;
    if (field === 'name') out.name = String(val ?? '').trim();
    else if (field === 'sku') out.sku = String(val ?? '').trim();
    else if (field === 'purchase') out.purchase = parseNumber(val);
    else if (field === 'retail') out.retail = parseNumber(val);
    else if (field === 'soldQty') out.soldQty = Math.max(0, Math.floor(parseNumber(val)));
    else if (field === 'stockQty') out.stockQty = Math.max(0, Math.floor(parseNumber(val)));
  }
  return out;
}

function buildHeaderMap(headers) {
  const map = new Map();
  for (const h of headers) {
    const f = mapHeaderToField(h);
    if (f) map.set(normalizeHeaderKey(h), f);
  }
  return map;
}

function parseCsvText(text) {
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const delim = t.includes(';') && !t.includes(',') ? ';' : undefined;
  const res = Papa.parse(t, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter: delim,
    transformHeader: (h) => String(h).trim(),
  });
  if (res.errors?.length) {
    const fatal = res.errors.find((e) => e.fatal);
    if (fatal) throw new Error(fatal.message || 'Ошибка CSV');
  }
  const rows = res.data || [];
  if (!rows.length) throw new Error('Файл пустой или нет строк данных');
  const headers = res.meta.fields || Object.keys(rows[0] || {});
  const headerToField = buildHeaderMap(headers);
  return rows.map((r) => rowFromRecord(r, headerToField)).filter((r) => r.name || r.sku);
}

async function parseWorkbook(buf) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('В книге нет листов');
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (!json.length) throw new Error('На первом листе нет данных');
  const headers = Object.keys(json[0]);
  const headerToField = buildHeaderMap(headers);
  return json.map((r) => rowFromRecord(r, headerToField)).filter((row) => row.name || row.sku);
}

/**
 * Парсинг CSV или Excel (.xlsx/.xls) в массив строк импорта.
 * @param {File} file
 * @returns {Promise<Array<{name:string,sku:string,purchase:number,retail:number,soldQty:number,stockQty:number}>>}
 */
export async function parseImportFile(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = await file.text();
    return parseCsvText(text);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    return parseWorkbook(buf);
  }
  throw new Error('Поддерживаются файлы .csv, .txt и Excel (.xlsx, .xls)');
}
