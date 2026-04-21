import {
  createSeedState,
  coreDataFromState,
  defaultDataSource,
  defaultIntegrations,
  defaultBusinessSettings,
  defaultGoogleSheets,
} from './data/seedState.js';
import { inferChannelSegment } from './domain/channelSegment.js';

export const STORAGE_KEY = 'profitPlatformAccount:v2';

/** @typedef {ReturnType<createSeedState>} AppState */

let state = createSeedState();
const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(structuredClone(state));
}

export function setState(partial) {
  state = { ...state, ...partial };
  persist();
  emit();
}

export function patchState(mutator) {
  const draft = structuredClone(state);
  mutator(draft);
  state = draft;
  persist();
  emit();
}

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

function migrateParsed(parsed) {
  if (!parsed || !Array.isArray(parsed.catalog)) return null;
  if (parsed.version === 2) {
    for (const c of parsed.catalog) {
      if (c.stockQty == null) c.stockQty = 0;
    }
    parsed.version = 3;
  }
  if (parsed.version === 3) {
    parsed.dataSource = parsed.dataSource || defaultDataSource();
    parsed.integrations = parsed.integrations || defaultIntegrations();
    parsed.preImportBackups = Array.isArray(parsed.preImportBackups) ? parsed.preImportBackups : [];
    parsed.version = 4;
  }
  if (parsed.version === 4) {
    parsed.settings = parsed.settings || defaultBusinessSettings();
    parsed.version = 5;
  }
  if (parsed.version === 5) {
    parsed.settings = parsed.settings || defaultBusinessSettings();
    parsed.settings.currency = parsed.settings.currency || 'RUB';
    if (parsed.settings.lastSheetsSyncAt === undefined) parsed.settings.lastSheetsSyncAt = null;
    parsed.settings.sessionPin = parsed.settings.sessionPin || '0000';
    parsed.version = 6;
  }
  if (parsed.version === 6) {
    parsed.integrations = parsed.integrations || defaultIntegrations();
    parsed.integrations.googleSheets = parsed.integrations.googleSheets || defaultGoogleSheets();
    if (parsed.integrations.googleOAuthClientId === undefined) parsed.integrations.googleOAuthClientId = '';
    if (parsed.integrations.googleRedirectUri === undefined) parsed.integrations.googleRedirectUri = '';
    for (const mo of Object.values(parsed.months || {})) {
      for (const ch of mo.channels || []) {
        if (!ch.segment) ch.segment = inferChannelSegment(ch.name);
      }
    }
    parsed.version = 7;
  }
  if (parsed.version !== 7) return null;
  if (!parsed.dataSource) parsed.dataSource = defaultDataSource();
  if (!parsed.integrations) parsed.integrations = defaultIntegrations();
  if (!parsed.integrations.googleSheets) parsed.integrations.googleSheets = defaultGoogleSheets();
  if (parsed.integrations.googleOAuthClientId === undefined) parsed.integrations.googleOAuthClientId = '';
  if (parsed.integrations.googleRedirectUri === undefined) parsed.integrations.googleRedirectUri = '';
  if (!parsed.settings) parsed.settings = defaultBusinessSettings();
  for (const e of parsed.expenseLines || []) {
    if (!e.status) e.status = 'fact';
    if (!e.opDate && e.periodKey) e.opDate = `${e.periodKey}-01`;
  }
  if (!Array.isArray(parsed.preImportBackups)) parsed.preImportBackups = [];
  return parsed;
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = migrateParsed(JSON.parse(raw));
    if (!parsed) return false;
    state = parsed;
    return true;
  } catch {
    return false;
  }
}

/** Перечитать localStorage и уведомить подписчиков (единый источник после импорта / смены вкладки). */
export function reloadStateFromDisk() {
  const ok = loadFromStorage();
  if (ok) emit();
  return ok;
}

const MAX_BACKUPS = 8;

/** Сохранить снимок данных перед импортом (для отката). */
export function pushPreImportBackup(note) {
  const payload = coreDataFromState(state);
  const entry = {
    id: `bk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    note: String(note || 'Перед импортом'),
    payload,
  };
  patchState((s) => {
    s.preImportBackups = [entry, ...(s.preImportBackups || [])].slice(0, MAX_BACKUPS);
  });
}

/** Восстановить снимок из бэкапа. */
export function restorePreImportBackup(backupId) {
  const b = (state.preImportBackups || []).find((x) => x.id === backupId);
  if (!b?.payload) return false;
  patchState((s) => {
    const p = b.payload;
    s.catalog = structuredClone(p.catalog);
    s.months = structuredClone(p.months);
    s.payroll = structuredClone(p.payroll || []);
    s.rent = structuredClone(p.rent || []);
    s.expenseLines = structuredClone(p.expenseLines || []);
    s.dataSource = structuredClone(p.dataSource || defaultDataSource());
    s.integrations = structuredClone(p.integrations || defaultIntegrations());
    s.settings = structuredClone(p.settings || defaultBusinessSettings());
  });
  return true;
}

export function setDataSourceMeta(partial) {
  patchState((s) => {
    s.dataSource = { ...(s.dataSource || defaultDataSource()), ...partial };
    s.dataSource.updatedAt = new Date().toISOString();
  });
}

export function resetToDemo() {
  state = createSeedState();
  persist();
  emit();
}
