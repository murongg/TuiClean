// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { BUNDLED_RULE_PACK, RULE_PACK_LIMIT } from '../lib/rule-pack';
import { createRuleUpdater, RULES_URL, readRuleState } from '../lib/rule-updates';

function nextPack(version = BUNDLED_RULE_PACK.version + 1) {
  const pack = structuredClone(BUNDLED_RULE_PACK);
  pack.version = version;
  pack.terms.adultOffers.push('合成更新词');
  return pack;
}
function setup() {
  let saved: unknown;
  const write = vi.fn(async (value: unknown) => {
    saved = value;
  });
  const request = vi.fn<typeof fetch>(async () => Response.json(nextPack()));
  const updater = createRuleUpdater(
    { read: async () => saved, write },
    { request, now: () => 12345 },
  );
  return {
    updater,
    write,
    request,
    saved: () => saved,
    set: (value: unknown) => {
      saved = value;
    },
  };
}
describe('manual rule updates', () => {
  it('starts offline, stores a valid newer package, and restores it after restart', async () => {
    const { updater, request, write, saved } = setup();
    expect((await updater.get()).pack.version).toBe(BUNDLED_RULE_PACK.version);
    expect(request).not.toHaveBeenCalled();
    const result = await updater.update();
    expect(result).toMatchObject({
      source: 'downloaded',
      checkedAt: 12345,
      updatedAt: 12345,
      pack: { version: BUNDLED_RULE_PACK.version + 1 },
    });
    expect(write).toHaveBeenCalledOnce();
    expect(readRuleState(saved())).toEqual(result);
    expect(request).toHaveBeenCalledWith(
      RULES_URL,
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      }),
    );
    expect(request.mock.calls[0]![1]!.body).toBeUndefined();
  });
  it('does not replace a working cache on HTTP, malformed JSON or incompatible schema errors', async () => {
    const { updater, request, write, saved } = setup();
    await updater.update();
    const previous = structuredClone(saved());
    for (const response of [
      new Response('synthetic failure', { status: 503 }),
      new Response('{invalid'),
      Response.json({ ...nextPack(BUNDLED_RULE_PACK.version + 2), schema: 99 }),
    ]) {
      request.mockResolvedValueOnce(response);
      await expect(updater.update()).rejects.toThrow();
      expect(saved()).toEqual(previous);
    }
    expect(write).toHaveBeenCalledOnce();
  });
  it('checks identical versions without replacing the current rules, and refuses changed content without a new version', async () => {
    const { updater, request, saved } = setup();
    request.mockResolvedValueOnce(Response.json(BUNDLED_RULE_PACK));
    expect(await updater.update()).toMatchObject({
      source: 'bundled',
      checkedAt: 12345,
      updatedAt: 0,
    });
    request.mockResolvedValueOnce(Response.json(nextPack(BUNDLED_RULE_PACK.version)));
    await expect(updater.update()).rejects.toThrow(/版本/);
    expect(readRuleState(saved()).pack).toEqual(BUNDLED_RULE_PACK);
  });
  it('refuses older remote data and restores bundled rules only on an explicit reset', async () => {
    const { updater, request } = setup();
    await updater.update();
    request.mockResolvedValueOnce(Response.json(BUNDLED_RULE_PACK));
    await expect(updater.update()).rejects.toThrow(/旧/);
    expect((await updater.get()).pack.version).toBe(BUNDLED_RULE_PACK.version + 1);
    expect(await updater.restore()).toMatchObject({
      source: 'bundled',
      pack: { version: BUNDLED_RULE_PACK.version },
    });
  });
  it('deduplicates concurrent updates and orders restore after an in-flight download', async () => {
    const { updater, request } = setup();
    let resolve!: (value: Response) => void;
    request.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const first = updater.update();
    const second = updater.update();
    expect(first).toBe(second);
    const reset = updater.restore();
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    resolve(Response.json(nextPack()));
    await first;
    await reset;
    expect((await updater.get()).source).toBe('bundled');
  });
  it('rejects oversized responses even when the server omits or understates their size', async () => {
    const { updater, request, write } = setup();
    request.mockResolvedValue(
      new Response('x'.repeat(RULE_PACK_LIMIT + 1), { headers: { 'Content-Length': '5' } }),
    );
    await expect(updater.update()).rejects.toThrow(/过大/);
    expect(write).not.toHaveBeenCalled();
  });
  it('aborts the response connection when a declared size is rejected before reading it', async () => {
    const { updater, request, write } = setup();
    request.mockResolvedValue(
      new Response('unused', { headers: { 'Content-Length': String(RULE_PACK_LIMIT + 1) } }),
    );
    await expect(updater.update()).rejects.toThrow(/过大/);
    expect(request.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });
  it('times out a stalled request without writing a partial update', async () => {
    const write = vi.fn();
    const request = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_done, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('synthetic abort')));
        }),
    );
    const updater = createRuleUpdater({ read: async () => null, write }, { request, timeoutMs: 5 });
    await expect(updater.update()).rejects.toThrow(/超时/);
    expect(write).not.toHaveBeenCalled();
  });
  it('uses bundled rules for corrupt or older persisted data and propagates storage failures', async () => {
    expect(readRuleState({ pack: { schema: 99 } }).source).toBe('bundled');
    const { updater, write } = setup();
    write.mockRejectedValueOnce(new Error('合成存储失败'));
    await expect(updater.update()).rejects.toThrow('合成存储失败');
    expect((await updater.get()).pack.version).toBe(BUNDLED_RULE_PACK.version);
  });
});
