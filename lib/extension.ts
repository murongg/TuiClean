import { browser } from 'wxt/browser';
import { createStore } from './store';
import { defaultSettings } from './settings';

const settingsKeys = new Set(Object.keys(defaultSettings).map((key) => `tuiclean:${key}`));

export const settingsStore = createStore({
  get: () => browser.storage.local.get(null),
  set: (values) => browser.storage.local.set(values),
});

export function watchSettings(callback: () => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    // History writes must not rescan every X tab and generate another write.
    if (
      area === 'local' &&
      Object.keys(changes).some(
        (key) => settingsKeys.has(key) || key.startsWith('tuiclean:blocked:'),
      )
    )
      callback();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
