import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUNDLED_RULE_PACK } from '../lib/rule-pack';
import { RULES_KEY } from '../lib/rule-updates';

const fake = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  historyRequests: [] as unknown[],
  storageListeners: new Set<(changes: unknown, area: string) => void>(),
  messages: new Set<
    (message: unknown, sender: unknown, respond: (value: unknown) => void) => void
  >(),
}));
vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: async () => ({ ...fake.data }),
        set: async (patch: Record<string, unknown>) => {
          Object.assign(fake.data, patch);
          fake.storageListeners.forEach((listener) => listener(patch, 'local'));
        },
      },
      onChanged: {
        addListener: (fn: never) => fake.storageListeners.add(fn),
        removeListener: (fn: never) => fake.storageListeners.delete(fn),
      },
    },
    runtime: {
      id: 'sample_extension',
      getURL: (path: string) => 'chrome-extension://sample_extension' + path,
      sendMessage: async (message: unknown) => {
        fake.historyRequests.push(message);
        return { ok: true };
      },
      onMessage: {
        addListener: (fn: never) => fake.messages.add(fn),
        removeListener: (fn: never) => fake.messages.delete(fn),
      },
    },
  },
}));

let invalidate: (() => void) | undefined;
afterEach(() => {
  invalidate?.();
  invalidate = undefined;
  fake.data = {};
  fake.historyRequests = [];
  fake.storageListeners.clear();
  fake.messages.clear();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('extension entrypoint wiring', () => {
  it('loads a cached rule pack and reacts to a rule-only storage update', async () => {
    const pack = structuredClone(BUNDLED_RULE_PACK);
    pack.version++;
    pack.terms.adultOffers.push('合成缓存词');
    fake.data[RULES_KEY] = { pack, checkedAt: 1000, updatedAt: 1000 };
    vi.stubGlobal('defineContentScript', (definition: unknown) => definition);
    vi.stubGlobal('location', { href: 'https://x.com/sample_user/status/100' });
    document.body.innerHTML =
      '<article data-testid="tweet"><div><a href="https://x.com/sample_cached/status/5301"><time>示例时间</time></a><div data-testid="tweetText">合成缓存词，私信获取</div></div></article>';
    const entry = await import('../entrypoints/filter.content');
    await entry.default.main({
      isInvalid: false,
      isValid: true,
      onInvalidated: (fn: () => void) => {
        invalidate = fn;
      },
    } as never);
    expect(document.querySelector('[data-tuiclean-folded]')).not.toBeNull();
    delete fake.data[RULES_KEY];
    fake.storageListeners.forEach((fn) => fn({ [RULES_KEY]: {} }, 'local'));
    await vi.waitFor(() => expect(document.querySelector('[data-tuiclean-folded]')).toBeNull());
    invalidate?.();
    expect(fake.storageListeners.size).toBe(0);
  });
  it('ignores history writes when subscribing to settings changes', async () => {
    const { watchSettings } = await import('../lib/extension');
    const changed = vi.fn();
    const stop = watchSettings(changed);
    fake.storageListeners.forEach((listener) =>
      listener({ 'tuiclean:history': { newValue: [] } }, 'local'),
    );
    expect(changed).not.toHaveBeenCalled();
    fake.storageListeners.forEach((listener) =>
      listener({ 'tuiclean:historyEnabled': { newValue: false } }, 'local'),
    );
    expect(changed).toHaveBeenCalledOnce();
    stop();
  });
  it('loads local preferences, answers popup messages, reacts to changes and cleans up', async () => {
    vi.stubGlobal('defineContentScript', (definition: unknown) => definition);
    vi.stubGlobal('location', { href: 'https://x.com/sample_user/status/100' });
    document.body.innerHTML =
      '<article data-testid="tweet"><div><a href="https://x.com/sample_ad/status/101"><time>示例时间</time></a><div data-testid="tweetText">刷单返佣，私信领取任务。</div></div></article>';
    const entry = await import('../entrypoints/filter.content');
    await entry.default.main({
      isInvalid: false,
      isValid: true,
      onInvalidated: (fn: () => void) => {
        invalidate = fn;
      },
    } as never);
    expect(document.querySelector('[data-tuiclean-folded]')).not.toBeNull();
    await vi.waitFor(() =>
      expect(fake.historyRequests).toContainEqual(
        expect.objectContaining({
          type: 'tuiclean:history',
          action: 'record',
          entries: [expect.objectContaining({ id: '101', author: 'sample_ad', action: 'folded' })],
        }),
      ),
    );
    expect(fake.historyRequests).toMatchObject([
      { entries: [{ text: '刷单返佣，私信领取任务。' }] },
    ]);
    const reply = vi.fn();
    fake.messages.forEach((listener) => listener({ type: 'tuiclean:stats' }, {}, reply));
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ folded: 1, scanned: 1 }));
    document
      .querySelector('[data-tuiclean-host]')!
      .shadowRoot!.querySelector<HTMLButtonElement>('[data-action="block"]')!
      .click();
    await vi.waitFor(() => expect(fake.data['tuiclean:blocked:sample_ad']).toBe(true));
    await vi.waitFor(() =>
      expect(
        document
          .querySelector('[data-tuiclean-host]')!
          .shadowRoot!.querySelector('[data-action="unblock"]'),
      ).not.toBeNull(),
    );
    const { settingsStore } = await import('../lib/extension');
    await settingsStore.patch({ enabled: false });
    await vi.waitFor(() => expect(document.querySelector('[data-tuiclean-folded]')).toBeNull());
    invalidate?.();
    expect(fake.messages.size).toBe(0);
    expect(fake.storageListeners.size).toBe(0);
  });
});
