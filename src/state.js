import { createSeedState } from './data/seedState.js';

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

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.catalog)) return false;
    state = parsed;
    return true;
  } catch {
    return false;
  }
}

export function resetToDemo() {
  state = createSeedState();
  persist();
  emit();
}
