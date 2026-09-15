import { historyTargets, type BatchTarget, type BatchProgress } from './batch';
import type { ApiPort } from './api-server';

export function requestApiBatch(
  connect: () => ApiPort,
  targets: readonly BatchTarget[],
  signal: AbortSignal,
  progress: (value: BatchProgress) => void,
  readLastError: () => string | undefined = () => undefined,
): Promise<BatchProgress> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('X 接口任务已停止。'));
      return;
    }
    const snapshot = historyTargets(targets, []);
    const port = connect();
    let finished = false;
    let started = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: Error, value?: BatchProgress) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      port.onMessage.removeListener(receive);
      port.onDisconnect.removeListener(disconnected);
      try {
        port.disconnect();
      } catch {
        /* The port may already be gone. */
      }
      if (error) reject(error);
      else resolve(value!);
    };
    const alive = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          finish(
            new Error(
              started
                ? 'X 接口任务连接超时，结果未确认；请检查 X 后再决定是否重试。'
                : '后台未完成连接握手，任务尚未提交。请完整更新扩展文件、重新加载，并关闭旧记录页后重新打开。',
            ),
          ),
        started ? 45000 : 10000,
      );
    };
    const cancel = () => {
      try {
        port.postMessage({ kind: 'cancel' });
      } catch {
        /* Disconnect also tells the owner to cancel. */
      }
      finish(new Error('X 接口任务已停止。'));
    };
    const disconnected = () => {
      // Chrome exposes lastError only during this callback; reading it here also
      // prevents an unchecked-runtime-error entry. Never replay an uncertain task.
      const reason = readLastError() ?? port.error?.message;
      finish(
        new Error(
          started
            ? '与后台任务的连接已断开，结果未确认；请检查 X 后再决定是否重试。'
            : reason?.includes('Receiving end does not exist')
              ? '未找到后台接收器，任务尚未提交。请将完整扩展文件覆盖到实际加载目录，重新加载扩展；若仍失败，请查看 Service worker 的启动错误。'
              : '后台连接在任务提交前已断开。请重新加载扩展，并关闭旧记录页后重新打开。',
        ),
      );
    };
    const receive = (input: unknown) => {
      if (finished) return;
      if (!input || typeof input !== 'object') return;
      const message = input as {
        kind?: unknown;
        protocol?: unknown;
        value?: BatchProgress;
        message?: unknown;
      };
      if (message.kind === 'error') {
        finish(
          new Error(typeof message.message === 'string' ? message.message : 'X 接口任务失败。'),
        );
        return;
      }
      if (message.kind === 'ready' && !started) {
        if (message.protocol !== 1) {
          finish(
            new Error(
              '扩展前后台文件不一致，任务尚未提交。请完整更新扩展、重新加载，并重新打开记录页。',
            ),
          );
          return;
        }
        // Only a compatible background may receive start. Duplicate greetings
        // and later disconnects must never trigger a second submission.
        started = true;
        alive();
        try {
          port.postMessage({ kind: 'start', targets: snapshot });
        } catch {
          finish(new Error('提交任务时后台连接已断开，请检查 X 结果后重试。'));
        }
        return;
      }
      if (!started) return;
      alive();
      if (message.kind === 'progress' || message.kind === 'done') {
        const value = message.value;
        if (
          !value ||
          !['running', 'paused', 'stopped', 'completed'].includes(value.state) ||
          !Array.isArray(value.results) ||
          !Array.isArray(value.remaining)
        ) {
          finish(new Error('X 接口任务返回的数据格式不正确。'));
          return;
        }
        if (message.kind === 'done') finish(undefined, value);
        else progress(value);
      }
    };
    port.onMessage.addListener(receive);
    port.onDisconnect.addListener(disconnected);
    signal.addEventListener('abort', cancel, { once: true });
    alive();
  });
}
