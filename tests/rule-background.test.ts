import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BUNDLED_RULE_PACK } from '../lib/rule-pack';
import { RULES_KEY } from '../lib/rule-updates';
type Sender = { id?: string; url?: string; frameId?: number };
const fake = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  listener: null as
    null | ((message: unknown, sender: Sender, reply: (value: unknown) => void) => boolean),
  fetch: vi.fn<typeof fetch>(),
}));
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      id: 'sample_extension',
      getURL: (path: string) => `chrome-extension://sample_extension${path}`,
      onConnect: { addListener: vi.fn() },
      onMessage: {
        addListener: (listener: typeof fake.listener) => {
          fake.listener = listener;
        },
      },
    },
    storage: {
      local: {
        get: async () => ({ ...fake.data }),
        set: async (values: Record<string, unknown>) => {
          Object.assign(fake.data, values);
        },
        remove: async (key: string) => {
          delete fake.data[key];
        },
      },
    },
  },
}));
const options = { id: 'sample_extension', url: 'chrome-extension://sample_extension/options.html' };
const send = (action: string, sender: Sender = options) =>
  new Promise<unknown>((resolve) => {
    const accepted = fake.listener!({ type: 'tuiclean:rules', action }, sender, resolve);
    if (!accepted) resolve({ unhandled: true });
  });
beforeEach(async () => {
  fake.data = { 'tuiclean:keywords': ['合成自定义词'] };
  const pack = structuredClone(BUNDLED_RULE_PACK);
  pack.version++;
  pack.terms.adultOffers.push('合成网络词');
  fake.fetch.mockReset().mockImplementation(async () => Response.json(pack));
  vi.stubGlobal('fetch', fake.fetch);
  vi.stubGlobal('defineBackground', (main: unknown) => main);
  const entry = await import('../entrypoints/background');
  (entry.default as unknown as () => void)();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it('updates only the rule cache and can reset it without touching preferences', async () => {
  expect(fake.fetch).not.toHaveBeenCalled();
  expect(await send('update')).toMatchObject({
    ok: true,
    state: { pack: { version: BUNDLED_RULE_PACK.version + 1 } },
  });
  expect(fake.data[RULES_KEY]).toBeTruthy();
  expect(await send('restore')).toMatchObject({ ok: true, state: { source: 'bundled' } });
  expect(fake.data[RULES_KEY]).toBeUndefined();
  expect(fake.data['tuiclean:keywords']).toEqual(['合成自定义词']);
});
it('rejects content-page, foreign-extension and child-frame requests before network access', async () => {
  for (const sender of [
    { ...options, url: 'https://x.com/home' },
    { ...options, id: 'synthetic_other' },
    { ...options, frameId: 2 },
  ])
    expect(await send('update', sender)).toMatchObject({ ok: false });
  expect(await send('unknown')).toMatchObject({ ok: false });
  expect(fake.fetch).not.toHaveBeenCalled();
});
