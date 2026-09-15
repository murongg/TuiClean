import { historyTargets, runNativeBatch, type BatchTarget, type NativeOutcome } from './batch';
import { historyUrl } from './history';
import { supportedPage } from './page';
import type { Settings } from './settings';
import type { ApiRequest } from './api';

export interface ApiPort {
  name: string;
  error?: { message: string };
  sender?: { id?: string; url?: string; frameId?: number; tab?: { id?: number } };
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: {
    addListener: (listener: (message: unknown) => void) => void;
    removeListener: (listener: (message: unknown) => void) => void;
  };
  onDisconnect: {
    addListener: (listener: () => void) => void;
    removeListener: (listener: () => void) => void;
  };
}
export interface ApiWorker {
  open: (url: string) => Promise<number>;
  invoke: (
    tabId: number,
    method: 'status' | 'block' | 'cancel',
    target?: ApiRequest,
  ) => Promise<{
    ok: boolean;
    ready?: boolean;
    result?: NativeOutcome;
    error?: string;
    retryAfterMs?: number;
  }>;
  close: (tabId: number) => Promise<void>;
}

function bounded<T>(operation: () => Promise<T>, signal: AbortSignal, ms = 35000): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error?: Error, value?: T) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve(value!);
    };
    const cancel = () => finish(new Error('X 接口任务已停止。'));
    const timer = setTimeout(
      () => finish(new Error('X 接口任务超时，结果未确认；请检查后重试。')),
      ms,
    );
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    try {
      operation().then(
        (value) => finish(undefined, value),
        () => finish(new Error('无法连接 X 网页接口执行器，请更新扩展并刷新 X。')),
      );
    } catch {
      finish(new Error('无法启动 X 网页接口请求。'));
    }
  });
}
const wait = (ms: number, signal: AbortSignal) =>
  bounded(() => new Promise<void>((resolve) => setTimeout(resolve, ms)), signal, ms + 1000);

export function createApiServer(options: {
  extensionId: string;
  extensionUrl: string;
  worker: ApiWorker;
  getSettings: () => Promise<Settings>;
}) {
  let active: AbortController | undefined;
  let nextAllowedAt = 0;
  return {
    connect(port: ApiPort) {
      if (port.name !== 'tuiclean:api') return;
      const sender = port.sender;
      const trustedPage = !!sender?.url?.startsWith(options.extensionUrl);
      const contentPage =
        !!sender?.tab && !!sender.url?.startsWith('https:') && supportedPage(sender.url, 'all');
      if (
        sender?.id !== options.extensionId ||
        (sender.frameId ?? 0) !== 0 ||
        (!trustedPage && !contentPage)
      ) {
        port.postMessage({ kind: 'error', message: '请从 TuiClean 的按钮或设置页发起操作。' });
        port.disconnect();
        return;
      }
      let controller: AbortController | undefined,
        started = false,
        disconnected = false;
      const send = (message: unknown) => {
        if (disconnected) return;
        try {
          port.postMessage(message);
        } catch {
          controller?.abort();
        }
      };
      const disconnect = () => {
        disconnected = true;
        controller?.abort();
      };
      const onMessage = (input: unknown) => {
        if (!input || typeof input !== 'object') return;
        const message = input as { kind?: unknown; targets?: unknown };
        if (message.kind === 'cancel') {
          controller?.abort();
          return;
        }
        if (message.kind !== 'start' || started) return;
        started = true;
        let targets: BatchTarget[];
        try {
          if (active) throw new Error('另一项 X 拉黑任务正在进行，请先结束该任务。');
          if (
            !Array.isArray(message.targets) ||
            (!trustedPage && message.targets.length !== 1) ||
            message.targets.some(
              (t) => !t || typeof t.id !== 'string' || typeof t.author !== 'string',
            )
          )
            throw new Error('X 拉黑目标格式不正确。');
          targets = historyTargets(message.targets, []);
          if (nextAllowedAt - Date.now() > 2000)
            throw new Error(
              `X 限流冷却中，请约 ${Math.ceil((nextAllowedAt - Date.now()) / 1000)} 秒后重试。`,
            );
        } catch (error) {
          send({
            kind: 'error',
            message: error instanceof Error ? error.message : '无法启动 X 接口任务。',
          });
          port.disconnect();
          return;
        }
        const abort = new AbortController();
        controller = abort;
        active = abort;
        let owned: number | undefined,
          closed = false,
          current: ApiRequest | undefined;
        const close = async () => {
          if (owned === undefined || closed) return;
          closed = true;
          await options.worker.close(owned).catch(() => {});
        };
        const cancel = () => {
          if (owned !== undefined && current)
            void options.worker.invoke(owned, 'cancel', current).catch(() => {});
          void close();
        };
        abort.signal.addEventListener('abort', cancel, { once: true });
        // Port messages keep the caller informed and the MV3 worker active while
        // an API response is pending. Disconnect always cancels future requests.
        const heartbeat = setInterval(() => send({ kind: 'ping' }), 10000);
        void runNativeBatch(
          targets,
          {
            async open() {
              let abandoned = false;
              const opening = options.worker.open(historyUrl(targets[0]!)).then((id) => {
                owned = id;
                if (abandoned || abort.signal.aborted) void close();
                return id;
              });
              try {
                return await bounded(() => opening, abort.signal, 15000);
              } catch (error) {
                abandoned = true;
                void close();
                throw error;
              }
            },
            async execute(tabId, target, signal) {
              const settings = await bounded(options.getSettings, signal);
              if (settings.whitelist.includes(target.author))
                return { status: 'skipped', message: '账号已在白名单中，跳过。' };
              const deadline = Date.now() + 25000;
              let ready = false;
              let initError = '';
              while (Date.now() < deadline && !ready) {
                try {
                  const status = await bounded(
                    () => options.worker.invoke(tabId, 'status'),
                    signal,
                    2000,
                  );
                  ready = status.ok === true && status.ready === true;
                  initError =
                    status.ok !== true && typeof status.error === 'string'
                      ? status.error.slice(0, 300)
                      : '';
                } catch (error) {
                  if (signal.aborted) throw new Error('X 接口任务已停止。');
                  initError = error instanceof Error ? error.message : '无法连接 X 接口采集器。';
                }
                if (!ready) await wait(500, signal);
              }
              if (!ready)
                throw new Error(
                  initError || '尚未捕获 X 网页的帖文请求，请确认已登录并刷新 X 后重试。',
                );
              if (nextAllowedAt > Date.now()) await wait(nextAllowedAt - Date.now(), signal);
              // Recheck trust after initialization/cooldown, immediately before dispatch.
              if ((await bounded(options.getSettings, signal)).whitelist.includes(target.author))
                return { status: 'skipped', message: '账号已在白名单中，跳过。' };
              current = { ...target, requestId: crypto.randomUUID() };
              const request = current;
              const reply = await bounded(
                () => options.worker.invoke(tabId, 'block', request),
                signal,
              );
              const retry =
                typeof reply.retryAfterMs === 'number' && Number.isFinite(reply.retryAfterMs)
                  ? Math.min(3600000, Math.max(0, reply.retryAfterMs))
                  : 0;
              nextAllowedAt = Date.now() + Math.max(2000, retry);
              if (reply.ok !== true)
                throw new Error(
                  typeof reply.error === 'string' ? reply.error.slice(0, 300) : 'X 接口操作失败。',
                );
              const result = reply.result;
              if (
                !result ||
                !['confirmed', 'already-blocked', 'skipped', 'unconfirmed'].includes(result.status)
              )
                return { status: 'unconfirmed', message: 'X 返回的结果格式无法确认，任务已暂停。' };
              return {
                status: result.status,
                ...(typeof result.message === 'string'
                  ? { message: result.message.slice(0, 300) }
                  : {}),
              };
            },
            close: async () => {
              await close();
            },
          },
          abort.signal,
          (value) => send({ kind: 'progress', value }),
        )
          .then((value) => send({ kind: 'done', value }))
          .catch(() => send({ kind: 'error', message: 'X 接口任务中断，请确认结果后重试。' }))
          .finally(() => {
            clearInterval(heartbeat);
            abort.signal.removeEventListener('abort', cancel);
            if (active === abort) active = undefined;
            port.onMessage.removeListener(onMessage);
            port.onDisconnect.removeListener(disconnect);
            port.disconnect();
          });
      };
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(disconnect);
      send({ kind: 'ready', protocol: 1 });
    },
  };
}
