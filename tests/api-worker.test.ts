import { afterEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn(), execute: vi.fn() }));
vi.mock('wxt/browser', () => ({
  browser: {
    tabs: { create: fake.create, remove: fake.remove },
    scripting: { executeScript: fake.execute },
  },
}));
import { apiWorker } from '../lib/api-worker';
afterEach(() => {
  delete window.__tuicleanWebApi;
  vi.resetAllMocks();
});
describe('dedicated X API worker', () => {
  it('marks only the explicitly opened task page for request capture', async () => {
    fake.create.mockResolvedValue({ id: 71 });
    await apiWorker.open('https://x.com/sample_worker/status/2701');
    const created = new URL(fake.create.mock.calls[0]![0].url);
    expect(created.origin + created.pathname).toBe('https://x.com/sample_worker/status/2701');
    expect(created.hash).toMatch(/^#tuiclean-api-[0-9a-f-]{36}$/);
  });
  it('executes a closed command in MAIN and returns only the bridge reply', async () => {
    const block = vi.fn().mockResolvedValue({ ok: true, result: { status: 'confirmed' } });
    window.__tuicleanWebApi = {
      protocol: 1,
      status: () => ({ ready: true }),
      block,
      cancel: vi.fn(),
    };
    fake.execute.mockImplementation(async (options) => [
      { frameId: 0, result: await options.func(...options.args) },
    ]);
    const request = { id: '2701', author: 'sample_worker', requestId: 'synthetic-invoke' };
    expect(await apiWorker.invoke(71, 'block', request)).toMatchObject({
      ok: true,
      result: { status: 'confirmed' },
    });
    expect(fake.execute.mock.calls[0]![0]).toMatchObject({
      target: { tabId: 71, frameIds: [0] },
      world: 'MAIN',
      args: ['block', request],
    });
    expect(block).toHaveBeenCalledWith(request);
  });
});
