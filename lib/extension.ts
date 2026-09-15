import { browser } from 'wxt/browser';
import { createStore } from './store';

export const settingsStore = createStore({
  get: () => browser.storage.local.get(null),
  set: (values) => browser.storage.local.set(values),
});

export function watchSettings(callback: () => void): () => void {
  const listener = (_changes: unknown, area: string) => {
    if (area === 'local') callback();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
