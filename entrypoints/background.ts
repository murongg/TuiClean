import { browser } from 'wxt/browser';
import {
  createHistoryStore,
  HISTORY_KEY,
  type HistoryMatch,
  type HistoryEntry,
} from '../lib/history';
import { settingsStore } from '../lib/extension';
import { supportedPage } from '../lib/page';
import { createApiServer } from '../lib/api-server';
import { apiWorker } from '../lib/api-worker';
import { createRuleUpdater, RULES_KEY } from '../lib/rule-updates';

export default defineBackground(() => {
  const api = createApiServer({
    extensionId: browser.runtime.id,
    extensionUrl: browser.runtime.getURL('/'),
    worker: apiWorker,
    getSettings: settingsStore.get,
  });
  browser.runtime.onConnect.addListener(api.connect);
  const rules = createRuleUpdater({
    read: async () => (await browser.storage.local.get(RULES_KEY))[RULES_KEY],
    write: (state) =>
      state
        ? browser.storage.local.set({ [RULES_KEY]: state })
        : browser.storage.local.remove(RULES_KEY),
  });
  // This background context is the single writer. Serializing here covers
  // separate tabs as well as clear-vs-record races; UI clients never write the array.
  const history = createHistoryStore({
    read: async () => (await browser.storage.local.get(HISTORY_KEY))[HISTORY_KEY],
    write: (rows) => browser.storage.local.set({ [HISTORY_KEY]: rows }),
    shouldRecord: async () => {
      const settings = await settingsStore.get();
      return settings.enabled && settings.historyEnabled;
    },
  });
  browser.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (
      message &&
      typeof message === 'object' &&
      (message as { type?: unknown }).type === 'tuiclean:rules'
    ) {
      const run = async () => {
        if (
          sender.id !== browser.runtime.id ||
          !sender.url?.startsWith(browser.runtime.getURL('/')) ||
          (sender.frameId ?? 0) !== 0
        )
          throw new Error('请在扩展设置页更新规则。');
        const action = (message as { action?: unknown }).action;
        if (action === 'update') return { ok: true, state: await rules.update() };
        if (action === 'restore') return { ok: true, state: await rules.restore() };
        throw new Error('无法识别的规则操作。');
      };
      void run()
        .then(respond)
        .catch((error) =>
          respond({ ok: false, error: error instanceof Error ? error.message : '规则更新失败。' }),
        );
      return true;
    }
    if (
      !message ||
      typeof message !== 'object' ||
      (message as { type?: unknown }).type !== 'tuiclean:history'
    )
      return false;
    const request = message as { action?: unknown; entries?: unknown };
    const run = async () => {
      if (sender.id !== browser.runtime.id) throw new Error('无法访问其他扩展的记录。');
      if (request.action === 'record') {
        if (!sender.url?.startsWith('https://') || !supportedPage(sender.url, 'all'))
          throw new Error('只记录 X 页面中实际识别的内容。');
        await history.record(request.entries as HistoryMatch[]);
        return { ok: true };
      }
      if (!sender.url?.startsWith(browser.runtime.getURL('/')))
        throw new Error('请在扩展设置中管理拦截记录。');
      if (request.action === 'list') return { ok: true, entries: await history.list() };
      if (request.action === 'merge') {
        await history.merge(request.entries as HistoryEntry[]);
        return { ok: true };
      }
      if (request.action === 'clear') {
        await history.clear();
        return { ok: true };
      }
      throw new Error('无法识别的历史记录操作。');
    };
    void run()
      .then(respond)
      .catch((error) =>
        respond({
          ok: false,
          error: error instanceof Error ? error.message : '历史记录操作失败。',
        }),
      );
    return true;
  });
});
