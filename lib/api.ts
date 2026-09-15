import { normalizeUsername } from './accounts';
import type { BatchTarget, NativeOutcome } from './batch';

export interface ApiRequest extends BatchTarget {
  requestId: string;
}
export type ApiReply =
  | { ok: true; result: NativeOutcome; retryAfterMs?: number }
  | { ok: false; error: string; retryAfterMs?: number };
const allowedHeaders = new Set([
  'authorization',
  'x-csrf-token',
  'x-twitter-auth-type',
  'x-twitter-active-user',
  'x-twitter-client-language',
  'x-client-uuid',
]);
const hosts = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const object = (value: unknown): Record<string, unknown> => (isObject(value) ? value : {});
const numericId = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{1,30}$/.test(value);

export function tweetRequestUrl(raw: string, origin: string): URL | null {
  try {
    const url = new URL(raw, origin);
    if (
      url.protocol !== 'https:' ||
      !hosts.has(url.hostname) ||
      url.origin !== origin ||
      !/^\/i\/api\/graphql\/[\w-]+\/TweetDetail$/.test(url.pathname)
    )
      return null;
    const variables = JSON.parse(url.searchParams.get('variables') ?? 'null');
    return isObject(variables) && numericId(variables.focalTweetId) ? url : null;
  } catch {
    return null;
  }
}

interface Account {
  id: string;
  author: string;
  blocked: boolean;
}
function account(value: unknown): Account | null {
  const user = object(value),
    legacy = object(user.legacy),
    core = object(user.core);
  const id = user.rest_id ?? user.id_str;
  const name = core.screen_name ?? legacy.screen_name ?? user.screen_name;
  if (!numericId(id) || typeof name !== 'string') return null;
  try {
    return {
      id,
      author: normalizeUsername(name),
      blocked:
        object(user.relationship_perspectives).blocking === true ||
        legacy.blocking === true ||
        user.blocking === true,
    };
  } catch {
    return null;
  }
}

function tweetAuthor(body: unknown, target: BatchTarget): Account {
  const pending: unknown[] = [body];
  const matches = new Map<string, Account>();
  let visited = 0;
  while (pending.length && visited++ < 50000) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    const row = value as Record<string, unknown>;
    if (row.rest_id === target.id && isObject(row.core)) {
      const user = account(object(object(row.core).user_results).result);
      if (user) matches.set(`${user.id}:${user.author}`, user);
    }
    pending.push(...Object.values(row));
  }
  if (pending.length || matches.size !== 1)
    throw new Error('X 接口未返回可验证的原帖作者，原帖可能已删除或不可访问。');
  const user = [...matches.values()][0]!;
  if (user.author !== target.author) throw new Error('原帖作者与记录中的账号不一致，已停止拉黑。');
  return user;
}

class RequestFailure extends Error {
  constructor(
    message: string,
    readonly rejected = false,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

/** This object stays in X's MAIN world. Its public methods never return headers. */
export function createWebApi(options: {
  origin: string;
  getUrl: () => string;
  fetch: typeof fetch;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let epoch = 0;
  let context:
    { url: string; headers: Record<string, string>; capturedAt: number; epoch: number } | undefined;
  let active:
    { id: string; key: string; abort: AbortController; promise: Promise<ApiReply> } | undefined;
  const completed = new Map<string, { key: string; epoch: number; reply: ApiReply }>();
  const validOrigin = (raw: string) => {
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' && hosts.has(url.hostname) && url.origin === options.origin;
    } catch {
      return false;
    }
  };
  const usable = () =>
    context && validOrigin(options.getUrl()) && now() - context.capturedAt < 15 * 60_000;

  async function json(url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) throw new RequestFailure('X 操作已取消。');
    const abort = new AbortController();
    const cancel = () => abort.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 10000);
    try {
      const response = await options.fetch(url, {
        ...init,
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        signal: abort.signal,
      });
      if (response.status === 429) {
        const seconds = Number(response.headers.get('retry-after'));
        const retry =
          Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 3600000) : 60000;
        throw new RequestFailure('X 请求过于频繁（429），已暂停，请稍后再试。', true, retry);
      }
      if (response.status === 401 || response.status === 403) {
        context = undefined;
        throw new RequestFailure(
          `X 拒绝了接口请求（${response.status}），请检查登录状态或接口访问限制。`,
          true,
        );
      }
      if (!response.ok)
        throw new RequestFailure(`X 接口返回 HTTP ${response.status}，已暂停。`, true);
      const text = await response.text();
      if (text.length > 4 * 1024 * 1024) throw new RequestFailure('X 接口响应过大，无法确认结果。');
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new RequestFailure('X 接口未返回可识别的 JSON 结果。');
      }
      if (isObject(body) && (body.error || (Array.isArray(body.errors) && body.errors.length))) {
        const codes = (Array.isArray(body.errors) ? body.errors : [])
          .map((item) => object(item).code)
          .filter(
            (code) =>
              typeof code === 'number' && Number.isSafeInteger(code) && code >= 0 && code <= 9999,
          )
          .slice(0, 3);
        throw new RequestFailure(
          `X 接口返回错误${codes.length ? `（代码 ${codes.join('、')}）` : ''}，已暂停操作。`,
          true,
        );
      }
      return body;
    } catch (error) {
      if (error instanceof RequestFailure) throw error;
      throw new RequestFailure(signal.aborted ? 'X 操作已取消。' : 'X 接口请求失败或超时。');
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    }
  }

  async function execute(target: ApiRequest, signal: AbortSignal): Promise<ApiReply> {
    let sent = false;
    let accepted = false;
    try {
      if (!usable() || !context)
        throw new Error('尚未捕获 X 的帖文请求，请登录 X 并刷新操作页后重试。');
      const captured = context;
      const check = () => {
        if (signal.aborted) throw new Error('X 操作已取消。');
        if (!usable() || context?.epoch !== captured.epoch)
          throw new Error('X 登录上下文已变化，请重新开始操作。');
      };
      check();
      const url = new URL(captured.url);
      const variables = JSON.parse(url.searchParams.get('variables')!);
      variables.focalTweetId = target.id;
      delete variables.cursor;
      url.searchParams.set('variables', JSON.stringify(variables));
      const read = async () =>
        tweetAuthor(
          await json(url.href, { method: 'GET', headers: captured.headers }, signal),
          target,
        );
      const user = await read();
      check();
      if (user.blocked) return { ok: true, result: { status: 'already-blocked' } };
      sent = true;
      const body = await json(
        options.origin + '/i/api/1.1/blocks/create.json',
        {
          method: 'POST',
          headers: { ...captured.headers, 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ user_id: user.id }).toString(),
        },
        signal,
      );
      check();
      accepted = true;
      const result = account(body);
      if (result && (result.id !== user.id || result.author !== user.author))
        return {
          ok: true,
          result: {
            status: 'unconfirmed',
            message: 'X 返回的账号与目标不一致，结果未确认，任务已暂停。',
          },
        };
      if (result?.blocked) return { ok: true, result: { status: 'confirmed' } };
      // An HTTP 200 alone is not proof. Read back once; never repeat the POST.
      const verified = await read();
      check();
      if (verified.id === user.id && verified.blocked)
        return { ok: true, result: { status: 'confirmed' } };
      return {
        ok: true,
        result: {
          status: 'unconfirmed',
          message: '请求已发送，但 X 未确认目标已拉黑，任务已暂停。',
        },
      };
    } catch (error) {
      if (sent && (accepted || !(error instanceof RequestFailure && error.rejected)))
        return {
          ok: true,
          result: {
            status: 'unconfirmed',
            message: '请求可能已发送，但结果未确认，任务已暂停；不会自动重复提交。',
          },
          ...(error instanceof RequestFailure && error.retryAfterMs
            ? { retryAfterMs: error.retryAfterMs }
            : {}),
        };
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'X 接口操作失败。',
        ...(error instanceof RequestFailure && error.retryAfterMs
          ? { retryAfterMs: error.retryAfterMs }
          : {}),
      };
    }
  }

  return {
    observe(rawUrl: string, rawHeaders: Record<string, string>) {
      try {
        const url = tweetRequestUrl(rawUrl, options.origin);
        if (!url) return;
        const headers: Record<string, string> = {};
        for (const [rawName, value] of Object.entries(rawHeaders)) {
          const name = rawName.toLowerCase();
          if (
            allowedHeaders.has(name) &&
            typeof value === 'string' &&
            value.length <= 8192 &&
            !/[\r\n]/.test(value)
          )
            headers[name] = value;
        }
        if (!headers.authorization?.startsWith('Bearer ') || !headers['x-csrf-token']) return;
        if (
          context?.headers.authorization !== headers.authorization ||
          context?.headers['x-csrf-token'] !== headers['x-csrf-token']
        )
          epoch++;
        context = { url: url.href, headers, capturedAt: now(), epoch };
      } catch {
        /* Unrelated or malformed page requests never affect the application. */
      }
    },
    status: () => ({ ready: !!usable() }),
    block(raw: ApiRequest): Promise<ApiReply> {
      let target: ApiRequest;
      try {
        if (
          !raw ||
          !numericId(raw.id) ||
          typeof raw.requestId !== 'string' ||
          !/^[\w-]{1,100}$/.test(raw.requestId)
        )
          throw new Error('X 拉黑目标或请求标识不正确。');
        target = { id: raw.id, author: normalizeUsername(raw.author), requestId: raw.requestId };
      } catch {
        return Promise.resolve({ ok: false, error: 'X 拉黑目标或请求标识不正确。' });
      }
      const key = target.id + ':' + target.author;
      const prior = completed.get(target.requestId);
      if (prior)
        return Promise.resolve(
          prior.key === key && prior.epoch === epoch
            ? prior.reply
            : { ok: false, error: '请求标识或登录上下文已变化，请重新开始。' },
        );
      if (active)
        return active.id === target.requestId && active.key === key
          ? active.promise
          : Promise.resolve({ ok: false, error: '另一项 X 接口操作正在进行。' });
      const abort = new AbortController();
      const currentEpoch = epoch;
      const promise = execute(target, abort.signal)
        .then((reply) => {
          completed.set(target.requestId, { key, epoch: currentEpoch, reply });
          if (completed.size > 100) completed.delete(completed.keys().next().value!);
          return reply;
        })
        .finally(() => {
          active = undefined;
        });
      active = { id: target.requestId, key, abort, promise };
      return promise;
    },
    cancel(requestId: string) {
      if (active?.id === requestId) active.abort.abort();
    },
    stop() {
      active?.abort.abort();
      context = undefined;
      completed.clear();
    },
  };
}
