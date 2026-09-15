import type { Post } from './detector';
import { readPost } from './page';
import { blockHistoryOnX } from './native-batch';

/** Only an explicit X-block button invokes this; detector matches never do. */
export async function blockOnX(article: Element, post: Post, signal: AbortSignal): Promise<void> {
  const current = readPost(article);
  if (
    signal.aborted ||
    !article.isConnected ||
    current?.id !== post.id ||
    current.author.toLowerCase() !== post.author.toLowerCase()
  )
    throw new Error('页面或目标账号已变化，请重新操作。');
  const report = await blockHistoryOnX([{ id: post.id, author: post.author }], signal, () => {});
  const result = report.results[0];
  if (result?.status === 'confirmed' || result?.status === 'already-blocked') return;
  throw new Error(
    result?.message ||
      report.message ||
      (report.state === 'stopped' ? 'X 接口任务已停止。' : 'X 尚未确认拉黑结果，请检查后重试。'),
  );
}
