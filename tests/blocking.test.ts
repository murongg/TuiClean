import { afterEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ batch: vi.fn() }));
vi.mock('../lib/native-batch', () => ({ blockHistoryOnX: fake.batch }));
import { blockOnX } from '../lib/blocking';
import { readPost } from '../lib/page';
function fixture() {
  document.body.innerHTML =
    '<article data-testid="tweet"><a href="/sample_api/status/2301"><time>合成时间</time></a><div data-testid="tweetText">合成正文</div></article>';
  const article = document.querySelector('article')!;
  return { article, post: readPost(article)! };
}
afterEach(() => {
  document.body.innerHTML = '';
  vi.resetAllMocks();
  vi.useRealTimers();
});
describe('single X action via the shared API task', () => {
  it('dispatches the verified post to the API queue without a DOM menu', async () => {
    vi.useFakeTimers();
    const { article, post } = fixture();
    const abort = new AbortController();
    fake.batch.mockResolvedValue({
      state: 'completed',
      results: [{ id: post.id, author: post.author, status: 'confirmed' }],
      remaining: [],
      total: 1,
    });
    const pending = blockOnX(article, post, abort.signal);
    await Promise.all([
      expect(pending).resolves.toBeUndefined(),
      vi.advanceTimersByTimeAsync(6000),
    ]);
    expect(fake.batch).toHaveBeenCalledWith(
      [{ id: post.id, author: post.author }],
      abort.signal,
      expect.any(Function),
    );
  });
  it('reports an unconfirmed API outcome instead of displaying success', async () => {
    vi.useFakeTimers();
    const { article, post } = fixture();
    fake.batch.mockResolvedValue({
      state: 'paused',
      results: [{ status: 'unconfirmed', message: '合成结果未确认' }],
      remaining: [],
      total: 1,
    });
    const pending = blockOnX(article, post, new AbortController().signal);
    await Promise.all([
      expect(pending).rejects.toThrow('合成结果未确认'),
      vi.advanceTimersByTimeAsync(6000),
    ]);
  });
  it('rejects a recycled or detached post before starting a task', async () => {
    const { article, post } = fixture();
    article.querySelector('a')!.setAttribute('href', '/sample_other/status/2302');
    await expect(blockOnX(article, post, new AbortController().signal)).rejects.toThrow();
    article.remove();
    await expect(blockOnX(article, post, new AbortController().signal)).rejects.toThrow();
    expect(fake.batch).not.toHaveBeenCalled();
  });
});
