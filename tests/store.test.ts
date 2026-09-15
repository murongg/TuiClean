import { describe, expect, it } from 'vitest';
import { createStore } from '../lib/store';

describe('local settings storage', () => {
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
