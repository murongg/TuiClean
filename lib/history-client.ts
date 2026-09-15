import { browser } from 'wxt/browser';
import {
  HISTORY_KEY,
  HISTORY_LIMIT,
  readHistory,
  type HistoryMatch,
  type HistorySource,
  type HistoryEntry,
} from './history';

async function request(
  action: 'list' | 'record' | 'clear' | 'merge',
  entries?: readonly HistoryMatch[],
) {
  const response = await browser.runtime.sendMessage({ type: 'tuiclean:history', action, entries });
  if (!response?.ok) throw new Error(response?.error || '无法读取或保存拦截记录，请重新加载扩展。');
  return response;
}

export const historyClient: HistorySource & {
  record: (entries: readonly HistoryMatch[]) => Promise<void>;
} = {
  async list() {
    return readHistory((await request('list')).entries);
  },
  async record(entries) {
    await request('record', entries.slice(0, HISTORY_LIMIT));
  },
  async clear() {
    await request('clear');
  },
  async merge(entries: readonly HistoryEntry[]) {
    await request('merge', entries);
  },
  subscribe(listener) {
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && Object.hasOwn(changes, HISTORY_KEY)) listener();
    };
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  },
};
