import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../lib/store';

describe('local settings storage', () => {
  it('restores saved preferences and account rules in a fresh store instance', async () => {
    const data: Record<string, unknown> = {};
    const set = vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(data, structuredClone(values));
    });
    const port = { get: async () => structuredClone(data), set };
    const original = createStore(port);
    await original.patch({
      enabled: false,
      adult: false,
      historyEnabled: false,
      mode: 'mark',
      scope: 'replies',
      keywords: ['合成关键词'],
      domains: ['ads.example.test'],
      whitelist: ['sample_trusted'],
      usernameRules: ['sample_*'],
      disabledRules: ['spam-template'],
    });
    await original.setBlocked('sample_blocked', true);
    const expected = await original.get();
    set.mockClear();
    expect(await createStore(port).get()).toEqual(expected);
    expect(set).not.toHaveBeenCalled();
  });
  it('adds a deduplicated batch while skipping trusted and already blocked authors', async () => {
    const data: Record<string, unknown> = {
      'tuiclean:whitelist': ['sample_trust'],
      'tuiclean:blocked:sample_old': true,
    };
    const set = vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(data, values);
    });
    const store = createStore({ get: async () => ({ ...data }), set });
    const result = await store.blockAuthors([
      '@Sample_New',
      'sample_new',
      'sample_trust',
      'sample_old',
    ]);
    expect(result).toEqual({ added: ['sample_new'], skipped: ['sample_trust', 'sample_old'] });
    expect(set).toHaveBeenCalledWith({ 'tuiclean:blocked:sample_new': true });
    expect((await store.get()).blockedUsers.sort()).toEqual(['sample_new', 'sample_old']);
  });
  it('does not overwrite another tab’s blocks when adding a batch', async () => {
    const data: Record<string, unknown> = {};
    const port = {
      get: async () => ({ ...data }),
      set: async (values: Record<string, unknown>) => {
        Object.assign(data, values);
      },
    };
    const first = createStore(port);
    const second = createStore(port);
    await Promise.all([
      first.blockAuthors(['sample_one', 'sample_two']),
      second.setBlocked('sample_other', true),
    ]);
    expect((await first.get()).blockedUsers.sort()).toEqual([
      'sample_one',
      'sample_other',
      'sample_two',
    ]);
  });
  it('validates the whole batch before writing and reports a storage failure', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const store = createStore({ get: async () => ({}), set });
    await expect(store.blockAuthors(['sample_ok', 'invalid/name'])).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
    set.mockRejectedValueOnce(new Error('合成存储失败'));
    await expect(store.blockAuthors(['sample_ok'])).rejects.toThrow('合成存储失败');
  });
  it('keeps concurrent blocks readable and removable around list-size boundaries', async () => {
    const data: Record<string, unknown> = Object.fromEntries(
      Array.from({ length: 499 }, (_, i) => [`tuiclean:blocked:sample_${i}`, true]),
    );
    const port = {
      get: async () => ({ ...data }),
      set: async (patch: Record<string, unknown>) => {
        Object.assign(data, patch);
      },
    };
    const first = createStore(port);
    const second = createStore(port);
    await Promise.all([
      first.setBlocked('sample_one', true),
      second.setBlocked('sample_two', true),
    ]);
    expect((await first.get()).blockedUsers).toHaveLength(501);
    await first.setBlocked('sample_one', false);
    expect((await second.get()).blockedUsers).toHaveLength(500);
    await second.patch({ enabled: false });
    expect((await first.get()).enabled).toBe(false);
  });
  it('persists simultaneous account blocks from separate tabs and supports removing one', async () => {
    const data: Record<string, unknown> = {};
    const port = {
      get: async () => ({ ...data }),
      set: async (patch: Record<string, unknown>) => {
        Object.assign(data, patch);
      },
    };
    const first = createStore(port);
    const second = createStore(port);
    await Promise.all([
      first.setBlocked('sample_one', true),
      second.setBlocked('@Sample_Two', true),
    ]);
    expect((await first.get()).blockedUsers.sort()).toEqual(['sample_one', 'sample_two']);
    await second.setBlocked('sample_one', false);
    expect((await first.get()).blockedUsers).toEqual(['sample_two']);
    await first.patch({ blockedUsers: ['sample_three'], usernameRules: ['demo_*'] });
    expect(await second.get()).toMatchObject({
      blockedUsers: ['sample_three'],
      usernameRules: ['demo_*'],
    });
  });
  it('writes only changed fields and preserves unrelated preferences', async () => {
    const data: Record<string, unknown> = {};
    const port = {
      get: async () => ({ ...data }),
      set: async (patch: Record<string, unknown>) => {
        Object.assign(data, patch);
      },
    };
    const store = createStore(port);
    await store.patch({ whitelist: ['sample_user'] });
    await store.patch({ enabled: false });
    expect(await store.get()).toMatchObject({
      whitelist: ['sample_user'],
      enabled: false,
      adult: true,
    });
    expect(Object.keys(data)).toHaveLength(2);
  });
  it('rejects invalid writes before modifying storage', async () => {
    let writes = 0;
    const store = createStore({
      get: async () => ({}),
      set: async () => {
        writes++;
      },
    });
    await expect(store.patch({ domains: ['https://example.test/path'] })).rejects.toThrow();
    expect(writes).toBe(0);
  });
});
