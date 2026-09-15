import { describe, expect, it, vi } from 'vitest';
import {
  createHistoryStore,
  historyMatch,
  historyUrl,
  HISTORY_LIMIT,
  HISTORY_BYTE_LIMIT,
  HISTORY_TEXT_LIMIT,
} from '../lib/history';
import { defaultSettings, validateSettings, encodeBackup, decodeBackup } from '../lib/settings';

const match = (id = '801') => ({
  id,
  author: 'sample_author',
  category: 'spam' as const,
  rules: ['spam-template'],
  reasons: ['虚构的模板匹配原因'],
  action: 'folded' as const,
});
function setup(initial: unknown = [], now = () => 1000) {
  let saved = initial;
  const write = vi.fn(async (value: unknown) => {
    saved = value;
  });
  const store = createHistoryStore({ read: async () => saved, write }, now);
  return { store, write, read: () => saved };
}

describe('local interception history with synthetic data', () => {
  it('saves a plain-text snapshot and constructs a canonical original-post link', () => {
    const result = historyMatch(
      {
        id: '801',
        author: 'sample_author',
        name: '虚构显示名',
        text: '合成正文\n第二行 <img src=x onerror=example()>',
        links: ['https://example.test/private-query?sample=1'],
      },
      { level: 'suspect', category: 'spam', rules: ['spam-template'], reasons: ['虚构依据'] },
      true,
    );
    expect(result).toEqual({
      ...match(),
      reasons: ['虚构依据'],
      text: '合成正文\n第二行 <img src=x onerror=example()>',
    });
    expect(historyUrl(result!)).toBe('https://x.com/sample_author/status/801');
    expect(
      historyMatch(
        { id: '801', author: 'sample_author', name: '', text: '', links: [] },
        { level: 'allow', rules: [], reasons: [] },
        false,
      ),
    ).toBeNull();
  });
  it('deduplicates repeated sightings across store instances without changing first timestamp', async () => {
    const { store, write, read } = setup();
    await store.record([match(), match()]);
    await store.record([match()]);
    const reopened = createHistoryStore({ read: async () => read(), write }, () => 2000);
    await reopened.record([match()]);
    expect(await reopened.list()).toEqual([{ ...match(), recordedAt: 1000 }]);
    expect(write).toHaveBeenCalledOnce();
  });
  it('serializes simultaneous writes and retains the newest bounded set', async () => {
    let now = 0;
    const { store } = setup([], () => ++now);
    await Promise.all(
      Array.from({ length: 11 }, (_, page) =>
        store.record(Array.from({ length: 100 }, (_, n) => match(String(1000 + page * 100 + n)))),
      ),
    );
    const items = await store.list();
    expect(items).toHaveLength(HISTORY_LIMIT);
    expect(items[0]!.recordedAt).toBe(11);
    expect(items.some((item) => item.id === '1000')).toBe(false);
  });
  it('clears after pending writes and permits future records', async () => {
    const { store } = setup();
    const first = store.record([match()]);
    const clear = store.clear();
    await Promise.all([first, clear]);
    expect(await store.list()).toEqual([]);
    await store.record([match('802')]);
    expect((await store.list()).map((item) => item.id)).toEqual(['802']);
  });
  it('recovers its write queue after storage fails', async () => {
    const { store, write } = setup();
    write.mockRejectedValueOnce(new Error('合成存储错误'));
    await expect(store.record([match()])).rejects.toThrow('合成存储错误');
    await store.record([match('802')]);
    expect((await store.list()).map((item) => item.id)).toEqual(['802']);
  });
  it('ignores malformed saved rows and never persists supplied extra fields', async () => {
    const { store, read } = setup([
      { ...match(), author: '../../bad', recordedAt: 1 },
      { ...match(), recordedAt: 8_640_000_000_000_001 },
      null,
    ]);
    expect(await store.list()).toEqual([]);
    await store.record([
      {
        ...match(),
        text: '合成正文',
        name: '不保存的昵称',
        links: ['https://example.test'],
      } as never,
    ]);
    expect(JSON.stringify(read())).not.toContain('不保存的昵称');
    expect(JSON.stringify(read())).not.toContain('https://example.test');
    await expect(store.record([{ ...match(), id: 'javascript:example' }])).rejects.toThrow();
    await expect(store.record([{ ...match(), category: ['spam'] } as never])).rejects.toThrow();
  });
  it('notifies subscribers only on actual writes and unsubscribes cleanly', async () => {
    const { store } = setup();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    await store.record([match()]);
    await store.record([match()]);
    expect(listener).toHaveBeenCalledOnce();
    off();
    await store.clear();
    expect(listener).toHaveBeenCalledOnce();
  });
  it('migrates the recording preference without putting history into settings backups', () => {
    expect(validateSettings({})).toMatchObject({ historyEnabled: true });
    const restored = decodeBackup(encodeBackup({ ...defaultSettings, historyEnabled: false }));
    expect(restored.historyEnabled).toBe(false);
    expect(() => validateSettings({ historyEnabled: 'yes' })).toThrow();
  });
  it('keeps legacy records readable and restores new text after reopening', async () => {
    const { store, read, write } = setup([{ ...match(), recordedAt: 900 }]);
    await store.record([{ ...match('802'), text: '新的合成正文' }]);
    const reopened = createHistoryStore({ read: async () => read(), write });
    expect(await reopened.list()).toEqual([
      { ...match('802'), text: '新的合成正文', recordedAt: 1000 },
      { ...match(), recordedAt: 900 },
    ]);
  });
  it('bounds long snapshots without splitting an emoji and marks truncation', () => {
    const result = historyMatch(
      {
        id: '803',
        author: 'sample_author',
        name: '',
        links: [],
        text: 'a'.repeat(HISTORY_TEXT_LIMIT - 1) + '🧩尾部',
      },
      { level: 'block', category: 'spam', rules: ['spam-template'], reasons: ['合成依据'] },
      true,
    );
    expect(result?.text?.length).toBeLessThanOrEqual(HISTORY_TEXT_LIMIT);
    expect(result?.text).not.toMatch(/[\uD800-\uDBFF]$/u);
    expect(result?.textTruncated).toBe(true);
  });
  it('evicts oldest records when text reaches the storage budget', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      ...match(String(2000 + i)),
      text: '合'.repeat(5000),
      recordedAt: i + 1,
    }));
    const { store } = setup(rows);
    const saved = await store.list();
    expect(saved.length).toBeLessThan(1000);
    expect(saved[0]?.id).toBe('2999');
    expect(new TextEncoder().encode(JSON.stringify(saved)).byteLength).toBeLessThanOrEqual(
      HISTORY_BYTE_LIMIT,
    );
  });
  it('merges validated backups without deleting current records or resetting timestamps', async () => {
    const { store } = setup([{ ...match(), text: '已有正文', recordedAt: 900 }]);
    await store.merge([
      { ...match(), text: '备份正文', recordedAt: 800 },
      { ...match('802'), text: '恢复正文', recordedAt: 700 },
    ]);
    expect(await store.list()).toEqual([
      { ...match(), text: '已有正文', recordedAt: 900 },
      { ...match('802'), text: '恢复正文', recordedAt: 700 },
    ]);
    await expect(store.merge([{ ...match('803'), recordedAt: -1 }])).rejects.toThrow();
    expect(await store.list()).toHaveLength(2);
  });
});
