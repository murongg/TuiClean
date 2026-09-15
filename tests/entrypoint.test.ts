import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
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
  fake.storageListeners.clear();
  fake.messages.clear();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('extension entrypoint wiring', () => {
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
