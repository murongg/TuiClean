import { afterEach, expect, it, vi } from 'vitest';
import { BUNDLED_RULE_PACK } from '../lib/rule-pack';
import { RULES_KEY } from '../lib/rule-updates';
import { ruleClient } from '../lib/rule-client';
const fake = vi.hoisted(() => ({
  send: vi.fn(),
  get: vi.fn(),
  listeners: new Set<(changes: Record<string, unknown>, area: string) => void>(),
}));
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { sendMessage: fake.send },
    storage: {
      local: { get: fake.get },
      onChanged: {
        addListener: (fn: (changes: Record<string, unknown>, area: string) => void) =>
          fake.listeners.add(fn),
        removeListener: (fn: (changes: Record<string, unknown>, area: string) => void) =>
          fake.listeners.delete(fn),
      },
    },
  },
}));
afterEach(() => {
  fake.send.mockReset();
  fake.get.mockReset();
  fake.listeners.clear();
});
it('explains a missing background service instead of exposing a raw runtime error', async () => {
  fake.send.mockRejectedValue(new Error('synthetic receiver unavailable'));
  await expect(ruleClient.update()).rejects.toThrow(/后台.*重新加载/);
  fake.send.mockImplementationOnce(() => {
    throw new Error('synthetic invalidated context');
  });
  await expect(ruleClient.restore()).rejects.toThrow(/后台.*重新加载/);
});
it('accepts a validated success reply from the background', async () => {
  const pack = structuredClone(BUNDLED_RULE_PACK);
  pack.version++;
  fake.send.mockResolvedValueOnce({ ok: true, state: { pack, checkedAt: 1000, updatedAt: 1000 } });
  expect(await ruleClient.update()).toMatchObject({
    source: 'downloaded',
    pack: { version: pack.version },
  });
});
it('sends only a rule action, preserves a server error and rejects incomplete successful replies', async () => {
  fake.send.mockResolvedValueOnce({ ok: false, error: '合成下载失败' });
  await expect(ruleClient.update()).rejects.toThrow('合成下载失败');
  expect(fake.send).toHaveBeenCalledWith({ type: 'tuiclean:rules', action: 'update' });
  fake.send.mockResolvedValueOnce({ ok: true });
  await expect(ruleClient.restore()).rejects.toThrow(/不完整/);
});
it('loads cached data and listens only to the dedicated local rule key', async () => {
  const pack = structuredClone(BUNDLED_RULE_PACK);
  pack.version++;
  fake.get.mockResolvedValue({ [RULES_KEY]: { pack, checkedAt: 1000, updatedAt: 1000 } });
  expect((await ruleClient.get()).pack.version).toBe(BUNDLED_RULE_PACK.version + 1);
  const changed = vi.fn();
  const stop = ruleClient.subscribe(changed);
  fake.listeners.forEach((fn) => fn({ 'tuiclean:history': {} }, 'local'));
  fake.listeners.forEach((fn) => fn({ [RULES_KEY]: {} }, 'sync'));
  expect(changed).not.toHaveBeenCalled();
  fake.listeners.forEach((fn) => fn({ [RULES_KEY]: {} }, 'local'));
  expect(changed).toHaveBeenCalledOnce();
  stop();
  expect(fake.listeners.size).toBe(0);
});
