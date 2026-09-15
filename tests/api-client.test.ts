import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestApiBatch } from '../lib/api-client';
import type { ApiPort } from '../lib/api-server';
function setup() {
  const listeners = new Set<(value: unknown) => void>(),
    disconnected = new Set<() => void>();
  const port: ApiPort = {
    name: 'tuiclean:api',
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: (f) => listeners.add(f), removeListener: (f) => listeners.delete(f) },
    onDisconnect: {
      addListener: (f) => disconnected.add(f),
      removeListener: (f) => disconnected.delete(f),
    },
  };
  return {
    port,
    receive: (value: unknown) => listeners.forEach((f) => f(value)),
    drop: () => disconnected.forEach((f) => f()),
  };
}
const targets = [{ id: '2201', author: 'sample_client' }];
afterEach(() => vi.useRealTimers());
describe('API task client', () => {
  it('streams metadata, resolves completion and releases its port', async () => {
    const { port, receive } = setup();
    const progress = vi.fn();
    const job = requestApiBatch(() => port, targets, new AbortController().signal, progress);
    expect(port.postMessage).not.toHaveBeenCalled();
    receive({ kind: 'ready', protocol: 1 });
    receive({ kind: 'ready', protocol: 1 });
    expect(port.postMessage).toHaveBeenCalledWith({ kind: 'start', targets });
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const result = {
      state: 'completed',
      total: 1,
      results: [{ ...targets[0], status: 'confirmed' }],
      remaining: [],
    };
    receive({ kind: 'progress', value: result });
    receive({ kind: 'done', value: result });
    expect(await job).toEqual(result);
    expect(progress).toHaveBeenCalledWith(result);
    expect(port.disconnect).toHaveBeenCalled();
  });
  it('sends cancel and disconnects when its page action is aborted', async () => {
    const { port } = setup();
    const abort = new AbortController();
    const job = requestApiBatch(() => port, targets, abort.signal, vi.fn());
    const rejected = expect(job).rejects.toThrow(/停止/);
    abort.abort();
    await rejected;
    expect(port.postMessage).toHaveBeenCalledWith({ kind: 'cancel' });
    expect(port.disconnect).toHaveBeenCalled();
  });
  it('reports a lost background connection instead of marking success', async () => {
    const { port, drop } = setup();
    const job = requestApiBatch(() => port, targets, new AbortController().signal, vi.fn());
    const rejected = expect(job).rejects.toThrow(/连接/);
    drop();
    await rejected;
  });
  it('cleans up if posting the initial request fails', async () => {
    const { port, receive } = setup();
    vi.mocked(port.postMessage).mockImplementation(() => {
      throw new Error('synthetic lost port');
    });
    const job = requestApiBatch(() => port, targets, new AbortController().signal, vi.fn());
    const rejected = expect(job).rejects.toThrow();
    receive({ kind: 'ready', protocol: 1 });
    await rejected;
    expect(port.disconnect).toHaveBeenCalled();
  });
  it('reads lastError inside disconnect and explains a missing receiver without submitting', async () => {
    const { port, drop } = setup();
    let callbackActive = false;
    const lastError = vi.fn(() => {
      expect(callbackActive).toBe(true);
      return 'Could not establish connection. Receiving end does not exist.';
    });
    const job = requestApiBatch(
      () => port,
      targets,
      new AbortController().signal,
      vi.fn(),
      lastError,
    );
    const rejected = expect(job).rejects.toThrow(/后台接收器.*完整.*重新加载/);
    callbackActive = true;
    drop();
    callbackActive = false;
    await rejected;
    expect(lastError).toHaveBeenCalledOnce();
    expect(port.postMessage).not.toHaveBeenCalled();
  });
  it('times out an unresponsive or old backend before dispatching a task', async () => {
    vi.useFakeTimers();
    const { port, receive } = setup();
    const job = requestApiBatch(() => port, targets, new AbortController().signal, vi.fn());
    const rejected = expect(job).rejects.toThrow(/后台.*握手/);
    await vi.advanceTimersByTimeAsync(5000);
    receive({ kind: 'ping' });
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    receive({ kind: 'ready', protocol: 1 });
    expect(port.postMessage).not.toHaveBeenCalled();
  });
  it('rejects an incompatible backend and never submits the targets', async () => {
    const { port, receive } = setup();
    const job = requestApiBatch(() => port, targets, new AbortController().signal, vi.fn());
    const rejected = expect(job).rejects.toThrow(/前后台.*不一致/);
    receive({ kind: 'ready', protocol: 99 });
    await rejected;
    expect(port.postMessage).not.toHaveBeenCalled();
  });
  it('never reconnects or replays a task after losing an established connection', async () => {
    const { port, receive, drop } = setup();
    const connect = vi.fn(() => port);
    const job = requestApiBatch(connect, targets, new AbortController().signal, vi.fn());
    const rejected = expect(job).rejects.toThrow(/结果.*未确认/);
    receive({ kind: 'ready', protocol: 1 });
    drop();
    await rejected;
    expect(connect).toHaveBeenCalledOnce();
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });
});
