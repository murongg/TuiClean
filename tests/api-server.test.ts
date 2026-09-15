import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiServer, type ApiPort } from '../lib/api-server';
import { defaultSettings } from '../lib/settings';
import { requestApiBatch } from '../lib/api-client';

function port(url = 'chrome-extension://sample/options.html') {
  const messages = new Set<(value: unknown) => void>(),
    disconnects = new Set<() => void>();
  const value: ApiPort = {
    name: 'tuiclean:api',
    sender: { id: 'sample', url, frameId: 0 },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: (f) => messages.add(f), removeListener: (f) => messages.delete(f) },
    onDisconnect: {
      addListener: (f) => disconnects.add(f),
      removeListener: (f) => disconnects.delete(f),
    },
  };
  return {
    value,
    send: (message: unknown) => messages.forEach((f) => f(message)),
    drop: () => disconnects.forEach((f) => f()),
  };
}
function setup() {
  const worker = {
    open: vi.fn().mockResolvedValue(71),
    invoke: vi
      .fn()
      .mockImplementation(async (_id, method) =>
        method === 'status'
          ? { ok: true, ready: true }
          : { ok: true, result: { status: 'confirmed' } },
      ),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const settings = { ...defaultSettings };
  const server = createApiServer({
    extensionId: 'sample',
    extensionUrl: 'chrome-extension://sample/',
    worker,
    getSettings: async () => settings,
  });
  return { worker, settings, server };
}
const targets = [
  { id: '2101', author: 'sample_one' },
  { id: '2102', author: 'sample_two' },
];
afterEach(() => vi.useRealTimers());
describe('background API task owner', () => {
  it('completes a client/server conversation over asynchronously delivered port messages', async () => {
    const { server, worker } = setup();
    const client = port(),
      owner = port();
    let closed = false;
    vi.mocked(client.value.postMessage).mockImplementation((message) => {
      queueMicrotask(() => {
        if (!closed) owner.send(structuredClone(message));
      });
    });
    vi.mocked(owner.value.postMessage).mockImplementation((message) => {
      queueMicrotask(() => {
        if (!closed) client.send(structuredClone(message));
      });
    });
    vi.mocked(client.value.disconnect).mockImplementation(() => {
      if (closed) return;
      closed = true;
      owner.drop();
    });
    vi.mocked(owner.value.disconnect).mockImplementation(() => {
      if (closed) return;
      closed = true;
      client.drop();
    });
    const job = requestApiBatch(
      () => {
        queueMicrotask(() => server.connect(owner.value));
        return client.value;
      },
      targets.slice(0, 1),
      new AbortController().signal,
      vi.fn(),
    );
    expect(await job).toMatchObject({
      state: 'completed',
      remaining: [],
      results: [{ ...targets[0], status: 'confirmed' }],
    });
    expect(client.value.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.open).toHaveBeenCalledOnce();
    expect(worker.close).toHaveBeenCalledWith(71);
  });
  it('acknowledges an extension page connection before accepting an explicit task', () => {
    const { server, worker } = setup();
    const channel = port();
    delete channel.value.sender!.frameId;
    server.connect(channel.value);
    expect(channel.value.postMessage).toHaveBeenCalledWith({ kind: 'ready', protocol: 1 });
    expect(worker.open).not.toHaveBeenCalled();
    channel.drop();
  });
  it('preserves initialization errors rather than misreporting them as missing login context', async () => {
    vi.useFakeTimers();
    const { server, worker } = setup();
    worker.invoke.mockResolvedValue({ ok: false, error: '合成采集器未加载' });
    const channel = port();
    server.connect(channel.value);
    channel.send({ kind: 'start', targets });
    await vi.advanceTimersByTimeAsync(30000);
    expect(channel.value.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'done',
        value: expect.objectContaining({
          results: [expect.objectContaining({ message: '合成采集器未加载' })],
        }),
      }),
    );
  });
  it('cancels before a slow worker opens and closes the worker when it eventually arrives', async () => {
    const { server, worker } = setup();
    let resolve!: (value: number) => void;
    worker.open.mockImplementation(
      () =>
        new Promise<number>((done) => {
          resolve = done;
        }),
    );
    const channel = port();
    server.connect(channel.value);
    channel.send({ kind: 'start', targets });
    channel.drop();
    const other = port();
    await vi.waitFor(() => expect(channel.value.disconnect).toHaveBeenCalled());
    resolve(71);
    await vi.waitFor(() => expect(worker.close).toHaveBeenCalledWith(71));
    server.connect(other.value);
    other.send({ kind: 'start', targets: [] });
    expect(worker.invoke.mock.calls.some((c) => c[1] === 'block')).toBe(false);
  });
  it('uses one worker, spaces target requests and closes it after completion', async () => {
    vi.useFakeTimers();
    const { server, worker } = setup();
    const channel = port();
    server.connect(channel.value);
    channel.send({ kind: 'start', targets });
    await vi.advanceTimersByTimeAsync(1000);
    expect(worker.invoke.mock.calls.filter((c) => c[1] === 'block')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(worker.open).toHaveBeenCalledOnce();
    expect(worker.invoke.mock.calls.filter((c) => c[1] === 'block')).toHaveLength(2);
    expect(channel.value.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'done',
        value: expect.objectContaining({ state: 'completed' }),
      }),
    );
    expect(worker.close).toHaveBeenCalledWith(71);
  });
  it('rejects foreign or iframe ports without opening an API worker', () => {
    const { server, worker } = setup();
    const channel = port('https://example.test');
    server.connect(channel.value);
    channel.send({ kind: 'start', targets });
    expect(channel.value.disconnect).toHaveBeenCalled();
    expect(worker.open).not.toHaveBeenCalled();
  });
  it('limits an X content page to a single explicit target', () => {
    const { server, worker } = setup();
    const channel = port('https://x.com/home');
    channel.value.sender!.tab = { id: 2 };
    server.connect(channel.value);
    channel.send({ kind: 'start', targets });
    expect(worker.open).not.toHaveBeenCalled();
    expect(channel.value.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'error' }),
    );
  });
  it('prevents overlapping tasks and stops when the caller disconnects', async () => {
    const { server, worker } = setup();
    worker.invoke.mockImplementation(async (_id, method) =>
      method === 'status' ? { ok: true, ready: true } : new Promise(() => {}),
    );
    const first = port(),
      second = port();
    server.connect(first.value);
    first.send({ kind: 'start', targets });
    await vi.waitFor(() =>
      expect(worker.invoke).toHaveBeenCalledWith(71, 'block', expect.anything()),
    );
    server.connect(second.value);
    second.send({ kind: 'start', targets });
    expect(second.value.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'error' }),
    );
    first.drop();
    await vi.waitFor(() => expect(worker.close).toHaveBeenCalledWith(71));
    expect(worker.invoke.mock.calls.filter((c) => c[1] === 'block')).toHaveLength(1);
  });
  it('rechecks the whitelist and pauses on an unconfirmed response without replaying it', async () => {
    vi.useFakeTimers();
    const { server, worker, settings } = setup();
    settings.whitelist = ['sample_one'];
    worker.invoke.mockImplementation(async (_id, method) =>
      method === 'status'
        ? { ok: true, ready: true }
        : { ok: true, result: { status: 'unconfirmed' } },
    );
    const channel = port();
    server.connect(channel.value);
    channel.send({ kind: 'start', targets });
    await vi.advanceTimersByTimeAsync(5000);
    expect(worker.invoke.mock.calls.filter((c) => c[1] === 'block')).toHaveLength(1);
    expect(channel.value.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'done',
        value: expect.objectContaining({ state: 'paused' }),
      }),
    );
  });
});
