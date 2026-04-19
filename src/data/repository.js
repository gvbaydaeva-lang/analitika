/**
 * Слой данных (Data Layer): сейчас — localStorage.
 * В будущем можно заменить реализацию на Google Sheets API, 1С OData и т.д.,
 * сохранив контракт методов для UI.
 */
import { getState, patchState, persist, loadFromStorage } from '../state.js';
import { applyImportRows } from './importApply.js';

export const dataRepository = {
  backend: 'localStorage',

  getSnapshot() {
    return structuredClone(getState());
  },

  /** Явное сохранение (дублирует автосохранение после patch) */
  async flush() {
    persist();
    return true;
  },

  async reloadFromDisk() {
    return loadFromStorage();
  },

  /**
   * Импорт номенклатуры в справочник + продажи за указанный месяц.
   * @param {Array<{name:string,sku:string,purchase:number,retail:number,soldQty:number,stockQty:number}>} rows
   * @param {string} periodKey
   */
  async importCatalogRows(rows, periodKey) {
    patchState((draft) => {
      applyImportRows(draft, rows, periodKey);
    });
  },
};
