import { afterEach, describe, expect, it, vi } from 'vitest';
import { HISTORY_KEY } from '../lib/history';
type Listener = (
  message: unknown,
  sender: { id?: string; url?: string },
  respond: (value: unknown) => void,
) => boolean;
const fake = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  listener: null as Listener | null,
}));
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      id: 'sample_extension',
      getURL: (path: string) => 'chrome-extension://sample_extension' + path,
      onConnect: { addListener: vi.fn() },
      onMessage: {
        addListener: (fn: Listener) => {
          fake.listener = fn;
        },
      },
    },
    storage: {
      local: {
        get: async () => ({ ...fake.data }),
        set: async (values: Record<string, unknown>) => {
          Object.assign(fake.data, values);
        },
      },
    },
  },
}));
const match = {
  id: '905',
  author: 'sample_bg',
  category: 'spam',
  rules: ['spam-template'],
  reasons: ['虚构依据'],
  action: 'folded',
};
const source = { id: 'sample_extension', url: 'https://x.com/home' };
const options = { id: 'sample_extension', url: 'chrome-extension://sample_extension/options.html' };
const request = (action: string, sender = options, entries?: unknown) =>
  new Promise<unknown>((resolve) => {
    fake.listener!({ type: 'tuiclean:history', action, entries }, sender, resolve);
  });
async function start() {
  vi.stubGlobal('defineBackground', (fn: unknown) => fn);
  const entry = await import('../entrypoints/background');
  (entry.default as unknown as () => void)();
}
afterEach(() => {
  fake.data = {};
  fake.listener = null;
  vi.unstubAllGlobals();
});
describe('history background writer', () => {
  it('imports saved snapshots only from extension pages and keeps original timestamps', async () => {
    await start();
    const entry = { ...match, text: '合成备份原文', recordedAt: 800 };
    expect(await request('merge', source, [entry])).toMatchObject({ ok: false });
    expect(await request('merge', options, [entry])).toMatchObject({ ok: true });
    expect(await request('list')).toMatchObject({ entries: [entry] });
    expect(await request('merge', options, [{ ...entry, recordedAt: -1 }])).toMatchObject({
      ok: false,
    });
    expect(await request('list')).toMatchObject({ entries: [entry] });
  });
  it('restores recorded history after its background context restarts', async () => {
    await start();
    await request('record', source, [match]);
    const expected = await request('list');
    fake.listener = null;
    await start();
    expect(await request('list')).toEqual(expected);
    expect(fake.data[HISTORY_KEY]).toHaveLength(1);
  });
  it('clears records even if an earlier record request is still reading preferences', async () => {
    await start();
    await Promise.all([request('record', source, [match]), request('clear')]);
    expect(await request('list')).toMatchObject({ ok: true, entries: [] });
  });
  it('records metadata from X and lists or clears it for extension pages', async () => {
    await start();
    expect(await request('record', source, [match])).toMatchObject({ ok: true });
    expect(await request('list')).toMatchObject({
      ok: true,
      entries: [expect.objectContaining({ id: '905' })],
    });
    expect(await request('clear')).toMatchObject({ ok: true });
    expect(fake.data[HISTORY_KEY]).toEqual([]);
  });
  it('does not record when recording or filtering is disabled', async () => {
    await start();
    fake.data['tuiclean:historyEnabled'] = false;
    await request('record', source, [match]);
    expect(fake.data[HISTORY_KEY]).toBeUndefined();
    fake.data['tuiclean:historyEnabled'] = true;
    fake.data['tuiclean:enabled'] = false;
    await request('record', source, [match]);
    expect(fake.data[HISTORY_KEY]).toBeUndefined();
  });
  it('rejects foreign senders and prevents content pages reading or clearing history', async () => {
    await start();
    expect(
      await request('record', { id: 'another_extension', url: 'https://x.com/home' }, [match]),
    ).toMatchObject({ ok: false });
    expect(await request('list', source)).toMatchObject({ ok: false });
    expect(await request('clear', source)).toMatchObject({ ok: false });
    expect(await request('record', options, [match])).toMatchObject({ ok: false });
    expect(fake.listener!({ type: 'unrelated' }, source, vi.fn())).toBe(false);
  });
});
