import { describe, expect, it, vi } from 'vitest';
import { historyTargets, runNativeBatch, type BatchPort } from '../lib/batch';
const targets = [
  { id: '1101', author: 'sample_one' },
  { id: '1102', author: 'sample_two' },
];
const port = (): BatchPort => ({
  open: vi.fn().mockResolvedValue(7),
  execute: vi.fn().mockResolvedValue({ status: 'confirmed' }),
  close: vi.fn().mockResolvedValue(undefined),
});
describe('native batch queue using synthetic targets', () => {
  it('deduplicates authors and excludes trusted authors before targeting', () => {
    expect(
      historyTargets([...targets, { id: '1103', author: 'SAMPLE_ONE' }], ['sample_two']),
    ).toEqual([targets[0]]);
  });
  it('uses one owned tab sequentially, reports outcomes and closes it', async () => {
    const api = port();
    const progress = vi.fn();
    const result = await runNativeBatch(targets, api, new AbortController().signal, progress);
    expect(api.open).toHaveBeenCalledOnce();
    expect(api.execute).toHaveBeenNthCalledWith(1, 7, targets[0], expect.any(AbortSignal));
    expect(api.execute).toHaveBeenNthCalledWith(2, 7, targets[1], expect.any(AbortSignal));
    expect(result).toMatchObject({
      state: 'completed',
      remaining: [],
      results: [{ status: 'confirmed' }, { status: 'confirmed' }],
    });
    expect(api.close).toHaveBeenCalledWith(7, 'completed');
  });
  it('pauses on an unconfirmed submission and retains remaining targets', async () => {
    const api = port();
    vi.mocked(api.execute).mockResolvedValueOnce({
      status: 'unconfirmed',
      message: '合成未确认结果',
    });
    const result = await runNativeBatch(targets, api, new AbortController().signal, vi.fn());
    expect(api.execute).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ state: 'paused', remaining: [targets[1]] });
    expect(api.close).toHaveBeenCalledWith(7, 'paused');
  });
  it('pauses on failure and can continue the remaining snapshot', async () => {
    const api = port();
    vi.mocked(api.execute).mockRejectedValueOnce(new Error('合成原帖不可访问'));
    const first = await runNativeBatch(targets, api, new AbortController().signal, vi.fn());
    expect(first.results[0]).toMatchObject({ status: 'failed', message: '合成原帖不可访问' });
    const resumed = await runNativeBatch(
      first.remaining,
      api,
      new AbortController().signal,
      vi.fn(),
    );
    expect(resumed.state).toBe('completed');
  });
  it('does not start another author after cancellation', async () => {
    const api = port();
    const abort = new AbortController();
    vi.mocked(api.execute).mockImplementationOnce(async () => {
      abort.abort();
      return { status: 'confirmed' };
    });
    const result = await runNativeBatch(targets, api, abort.signal, vi.fn());
    expect(api.execute).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ state: 'stopped', remaining: [targets[1]] });
    expect(api.close).toHaveBeenCalledWith(7, 'stopped');
  });
  it('never opens a tab for invalid or empty targets', async () => {
    const api = port();
    await expect(
      runNativeBatch(
        [{ id: 'wrong', author: 'sample_one' }],
        api,
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow();
    await runNativeBatch([], api, new AbortController().signal, vi.fn());
    expect(api.open).not.toHaveBeenCalled();
  });
  it('reports stopped if cancellation arrives while a paused task is being finalized', async () => {
    const api = port();
    const abort = new AbortController();
    vi.mocked(api.execute).mockResolvedValue({ status: 'unconfirmed' });
    vi.mocked(api.close).mockImplementation(async () => {
      abort.abort();
    });
    const result = await runNativeBatch(targets, api, abort.signal, vi.fn());
    expect(result.state).toBe('stopped');
    expect(api.execute).toHaveBeenCalledOnce();
  });
});
