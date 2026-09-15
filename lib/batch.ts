import { normalizeUsername } from './accounts';
import { historyUrl } from './history';

export interface BatchTarget {
  id: string;
  author: string;
}
export interface NativeOutcome {
  status: 'confirmed' | 'already-blocked' | 'skipped' | 'unconfirmed';
  message?: string;
}
export interface BatchResult extends BatchTarget {
  status: NativeOutcome['status'] | 'failed';
  message?: string;
}
export interface BatchProgress {
  state: 'running' | 'completed' | 'paused' | 'stopped';
  total: number;
  current?: string;
  results: BatchResult[];
  remaining: BatchTarget[];
  message?: string;
}
export interface BatchPort {
  open: () => Promise<number>;
  execute: (tabId: number, target: BatchTarget, signal: AbortSignal) => Promise<NativeOutcome>;
  close: (tabId: number, state?: BatchProgress['state']) => Promise<void>;
}
export type NativeBatch = (
  targets: readonly BatchTarget[],
  signal: AbortSignal,
  progress: (value: BatchProgress) => void,
) => Promise<BatchProgress>;

export function historyTargets(
  rows: readonly BatchTarget[],
  whitelist: readonly string[],
): BatchTarget[] {
  if (rows.length > 1000) throw new Error('单次最多处理 1000 条记录。');
  const trusted = new Set(whitelist.map((name) => name.toLowerCase()));
  const unique = new Map<string, BatchTarget>();
  for (const row of rows) {
    const author = normalizeUsername(row.author);
    const target = { id: row.id, author };
    historyUrl(target);
    if (!trusted.has(author) && !unique.has(author)) unique.set(author, target);
  }
  return [...unique.values()];
}

export async function runNativeBatch(
  targets: readonly BatchTarget[],
  port: BatchPort,
  signal: AbortSignal,
  progress: (value: BatchProgress) => void,
): Promise<BatchProgress> {
  const snapshot = historyTargets(targets, []);
  let state: BatchProgress['state'] = 'running';
  const results: BatchResult[] = [];
  let remaining = snapshot;
  let message: string | undefined;
  let tabId: number | undefined;
  const report = (current?: string): BatchProgress => ({
    state,
    total: snapshot.length,
    results: [...results],
    remaining: [...remaining],
    current,
    message,
  });
  try {
    if (!snapshot.length) state = 'completed';
    else if (signal.aborted) state = 'stopped';
    else {
      tabId = await port.open();
      for (let index = 0; index < snapshot.length; index++) {
        if (signal.aborted) {
          state = 'stopped';
          break;
        }
        const target = snapshot[index]!;
        progress(report(target.author));
        let outcome: NativeOutcome | { status: 'failed'; message: string };
        try {
          outcome = await port.execute(tabId, target, signal);
        } catch (error) {
          outcome = signal.aborted
            ? { status: 'unconfirmed', message: '已停止，此账号的结果未确认。' }
            : {
                status: 'failed',
                message: error instanceof Error ? error.message : 'X 操作失败。',
              };
        }
        results.push({ ...target, ...outcome });
        remaining = snapshot.slice(index + 1);
        // A sent request is not server confirmation. Pause instead of
        // navigating away and issuing more mutations after an unknown result.
        if (signal.aborted) state = 'stopped';
        else if (outcome.status === 'unconfirmed' || outcome.status === 'failed') state = 'paused';
        else if (!remaining.length) state = 'completed';
        progress(report());
        if (state !== 'running') break;
      }
    }
  } catch (error) {
    state = signal.aborted ? 'stopped' : 'paused';
    message = error instanceof Error ? error.message : '无法启动 X 操作页。';
  } finally {
    if (tabId !== undefined) await port.close(tabId, state).catch(() => {});
    if (signal.aborted && state !== 'completed') state = 'stopped';
  }
  const result = report();
  progress(result);
  return result;
}
