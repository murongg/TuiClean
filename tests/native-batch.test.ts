import { expect, it, vi } from 'vitest';
import { blockHistoryOnX } from '../lib/native-batch';

const fake = vi.hoisted(() => {
  const messages = new Set<(input: unknown) => void>();
  const drops = new Set<() => void>();
  let disconnecting = false;
  const lastError = vi.fn(() => {
    if (!disconnecting) throw new Error('lastError read outside callback');
    return { message: 'Could not establish connection. Receiving end does not exist.' };
  });
  return {
    lastError,
    drop: () => {
      disconnecting = true;
      drops.forEach((fn) => fn());
      disconnecting = false;
    },
    port: {
      name: 'tuiclean:api',
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: {
        addListener: (fn: (input: unknown) => void) => messages.add(fn),
        removeListener: (fn: (input: unknown) => void) => messages.delete(fn),
      },
      onDisconnect: {
        addListener: (fn: () => void) => drops.add(fn),
        removeListener: (fn: () => void) => drops.delete(fn),
      },
    },
  };
});
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      connect: () => fake.port,
      get lastError() {
        return fake.lastError();
      },
    },
  },
}));

it('consumes Chrome lastError in the native adapter and preserves unsubmitted targets', async () => {
  const targets = [{ id: '2801', author: 'sample_bridge' }];
  const job = blockHistoryOnX(targets, new AbortController().signal, vi.fn());
  const rejected = expect(job).rejects.toThrow(/未找到后台接收器.*尚未提交/);
  expect(fake.lastError).not.toHaveBeenCalled();
  fake.drop();
  await rejected;
  expect(fake.lastError).toHaveBeenCalledOnce();
  expect(fake.port.postMessage).not.toHaveBeenCalled();
  expect(targets).toEqual([{ id: '2801', author: 'sample_bridge' }]);
});
