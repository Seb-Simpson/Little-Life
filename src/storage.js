import { emptyState, validateState } from './model.js';
export const storageKey = mode => `little-life.${mode}.v1`;
export function repository(storage, mode) {
  const key = storageKey(mode);
  return {
    load() {
      const raw = storage.getItem(key);
      if (raw === null) return emptyState(mode);
      const data = validateState(JSON.parse(raw));
      if (data.mode !== mode) throw new Error('Saved workspace does not match this mode.');
      return data;
    },
    save(state) {
      state = validateState(state);
      if (state.mode !== mode) throw new Error('Cannot mix demonstration and personal data.');
      const existing = this.load();
      if (existing.revision !== state.revision) throw new Error('Another tab changed your data. Reload before saving.');
      const next = { ...state, revision: state.revision + 1 };
      storage.setItem(key, JSON.stringify(next));
      return next;
    },
    raw() { return storage.getItem(key); },
    reset() { storage.removeItem(key); }
  };
}
