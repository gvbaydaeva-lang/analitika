/** Google OAuth 2.0 (PKCE) + чтение Google Sheets API v4. */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const PKCE_VERIFIER_KEY = 'gs_pkce_verifier';
const OAUTH_STATE_KEY = 'gs_oauth_state';

function randomVerifier() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let s = '';
  const a = new Uint8Array(64);
  crypto.getRandomValues(a);
  for (let i = 0; i < 64; i += 1) s += chars[a[i] % chars.length];
  return s.slice(0, 128);
}

async function sha256Base64Url(verifier) {
  const enc = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(hash);
  let b64 = btoa(String.fromCharCode(...bytes));
  b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64;
}

/** Буква колонки Excel → 0-based индекс (A=0, Z=25, AA=26). */
export function columnLetterToIndex(letter) {
  const L = String(letter || 'A')
    .trim()
    .toUpperCase();
  let n = 0;
  for (let i = 0; i < L.length; i += 1) {
    const c = L.charCodeAt(i);
    if (c < 65 || c > 90) return 0;
    n = n * 26 + (c - 64);
  }
  return Math.max(0, n - 1);
}

/**
 * Редирект на страницу авторизации Google (PKCE).
 * @param {{ clientId: string; redirectUri: string }} opts
 */
export async function startGoogleOAuthPkce(opts) {
  const { clientId, redirectUri } = opts;
  if (!clientId || !redirectUri) throw new Error('Укажите Client ID и Redirect URI');
  const verifier = randomVerifier();
  const challenge = await sha256Base64Url(verifier);
  const state = `gs_${Math.random().toString(36).slice(2, 12)}`;
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SHEETS_READONLY_SCOPE,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    access_type: 'offline',
    prompt: 'consent',
  });
  window.location.href = `${AUTH_URL}?${p.toString()}`;
}

/**
 * Обмен code на токены (после редиректа).
 * @param {{ code: string; clientId: string; redirectUri: string }} opts
 */
export async function exchangeCodeForTokens(opts) {
  const { code, clientId, redirectUri } = opts;
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!verifier) throw new Error('Сессия PKCE утеряна. Запустите вход снова.');
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error_description || json.error || `OAuth ${res.status}`);
  }
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  const expiresAt = json.expires_in
    ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString()
    : null;
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || '',
    tokenExpiresAt: expiresAt,
  };
}

export function readOAuthReturnParams() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = sessionStorage.getItem(OAUTH_STATE_KEY);
  if (!code || !state || !expected || state !== expected) return null;
  return { code, state };
}

export function clearOAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('code')) return;
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('scope');
  url.searchParams.delete('authuser');
  url.searchParams.delete('prompt');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

/** Значения листа: массив строк. */
export async function fetchSpreadsheetValues(accessToken, spreadsheetId, rangeA1) {
  if (!spreadsheetId || !rangeA1) throw new Error('Укажите ID таблицы и диапазон');
  const enc = encodeURIComponent(rangeA1);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${enc}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message || json.error || `Sheets API ${res.status}`);
  }
  return json.values || [];
}

/** Сопоставление текстовой категории из таблицы с id расхода. */
export function mapCategoryTextToId(text) {
  const t = String(text || '')
    .toLowerCase()
    .trim();
  if (/коммун|utilities|коммунал/.test(t)) return 'utilities';
  if (/маркет|marketing|реклам/.test(t)) return 'marketing';
  return 'other';
}

/**
 * Преобразование строк таблицы в черновики expenseLines (periodKey задаётся снаружи).
 * @param {string[][]} rows
 * @param {{ colDate: string; colAmount: string; colCategory: string }} cols буквы колонок
 */
export function rowsToExpenseDrafts(rows, cols) {
  const iD = columnLetterToIndex(cols.colDate);
  const iA = columnLetterToIndex(cols.colAmount);
  const iC = columnLetterToIndex(cols.colCategory);
  const out = [];
  for (const row of rows) {
    if (!row || !row.length) continue;
    const dateRaw = row[iD];
    const amtRaw = row[iA];
    const catRaw = row[iC];
    if (dateRaw == null || amtRaw == null) continue;
    const amount = Math.max(0, Number(String(amtRaw).replace(/\s/g, '').replace(',', '.')) || 0);
    if (!amount) continue;
    let opDate = String(dateRaw).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opDate)) {
      const d = new Date(dateRaw);
      if (Number.isNaN(d.getTime())) continue;
      opDate = d.toISOString().slice(0, 10);
    }
    const periodKey = opDate.slice(0, 7);
    out.push({
      periodKey,
      category: mapCategoryTextToId(catRaw),
      amount,
      note: String(catRaw || 'Импорт Sheets').slice(0, 200),
      status: 'fact',
      opDate,
    });
  }
  return out;
}
