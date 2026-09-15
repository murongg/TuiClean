import { browser } from 'wxt/browser';
import type { ApiWorker } from './api-server';
import type { ApiRequest } from './api';
import type {} from './api-page';

export const apiWorker: ApiWorker = {
  async open(url) {
    const workerUrl = new URL(url);
    workerUrl.hash = 'tuiclean-api-' + crypto.randomUUID();
    const tab = await browser.tabs.create({ url: workerUrl.href, active: true });
    if (tab.id === undefined) throw new Error('无法打开 X 接口工作页。');
    return tab.id;
  },
  async invoke(tabId, method, target) {
    const results = await browser.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: 'MAIN',
      func: async (action: 'status' | 'block' | 'cancel', request: ApiRequest | null) => {
        const bridge = window.__tuicleanWebApi;
        if (bridge?.protocol !== 1)
          return { ok: false, error: 'X 请求采集器尚未加载，请刷新 X 页面。' };
        if (action === 'status') return { ok: true, ready: bridge.status().ready };
        if (!request) return { ok: false, error: '缺少 X 操作目标。' };
        if (action === 'cancel') {
          bridge.cancel(request.requestId);
          return { ok: true };
        }
        return bridge.block(request);
      },
      args: [method, target ?? null],
    });
    const value = results.find((result) => result.frameId === 0)?.result;
    if (!value || typeof value !== 'object')
      return { ok: false, error: 'X 接口执行器未返回结果。' };
    return value;
  },
  close: async (tabId) => {
    await browser.tabs.remove(tabId);
  },
};
