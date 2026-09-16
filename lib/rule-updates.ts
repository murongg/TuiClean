import { BUNDLED_RULE_PACK, RULE_PACK_LIMIT, validateRulePack, type RulePack } from './rule-pack';

export const RULES_KEY = 'tuiclean:rules';
export const RULES_URL =
  'https://raw.githubusercontent.com/murongg/TuiClean/main/rules/builtin.json';
export interface RuleState {
  pack: RulePack;
  source: 'bundled' | 'downloaded';
  checkedAt: number;
  updatedAt: number;
}
export interface RuleSource {
  get: () => Promise<RuleState>;
  update: () => Promise<RuleState>;
  restore: () => Promise<RuleState>;
  subscribe: (listener: () => void) => () => void;
}
export const bundledRuleState = (): RuleState => ({
  pack: BUNDLED_RULE_PACK,
  source: 'bundled',
  checkedAt: 0,
  updatedAt: 0,
});
const samePack = (a: RulePack, b: RulePack) => JSON.stringify(a) === JSON.stringify(b);
export function readRuleState(value: unknown): RuleState {
  try {
    if (!value || typeof value !== 'object') return bundledRuleState();
    const raw = value as Record<string, unknown>;
    const pack = validateRulePack(raw.pack);
    if (
      pack.version < BUNDLED_RULE_PACK.version ||
      (pack.version === BUNDLED_RULE_PACK.version && !samePack(pack, BUNDLED_RULE_PACK))
    )
      return bundledRuleState();
    const timestamp = (input: unknown) =>
      typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 ? input : 0;
    return {
      pack,
      source: pack.version > BUNDLED_RULE_PACK.version ? 'downloaded' : 'bundled',
      checkedAt: timestamp(raw.checkedAt),
      updatedAt: timestamp(raw.updatedAt),
    };
  } catch {
    // An unreadable cache must not disable filtering or execute stale schemas.
    return bundledRuleState();
  }
}

async function readDownload(response: Response): Promise<RulePack> {
  if (!response.ok) throw new Error(`规则下载失败（HTTP ${response.status}），已保留当前规则。`);
  if (response.redirected || (response.url && response.url !== RULES_URL))
    throw new Error('规则来源不符合预期。');
  if (Number(response.headers.get('Content-Length')) > RULE_PACK_LIMIT)
    throw new Error('规则包过大，已保留当前规则。');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('规则包为空。');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RULE_PACK_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new Error('规则包过大，已保留当前规则。');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('规则包不是有效的 JSON 数据，已保留当前规则。');
  }
  return validateRulePack(value);
}

export function createRuleUpdater(
  port: { read: () => Promise<unknown>; write: (state: RuleState | null) => Promise<void> },
  options: { request?: typeof fetch; now?: () => number; timeoutMs?: number } = {},
) {
  const request = options.request ?? fetch;
  const now = options.now ?? Date.now;
  let queue = Promise.resolve();
  let pending: Promise<RuleState> | undefined;
  const get = async () => readRuleState(await port.read());
  const serial = <T>(action: () => Promise<T>) => {
    const task = queue.then(action);
    queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };
  return {
    get,
    update(): Promise<RuleState> {
      if (pending) return pending;
      pending = serial(async () => {
        const current = await get();
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? 10000);
        let pack: RulePack;
        try {
          const response = await request(RULES_URL, {
            method: 'GET',
            credentials: 'omit',
            redirect: 'error',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal: abort.signal,
          }).catch(() => {
            throw new Error('无法下载规则，请检查网络后重试。');
          });
          pack = await readDownload(response);
        } catch (error) {
          const timedOut = abort.signal.aborted;
          abort.abort();
          if (timedOut) throw new Error('规则更新超时，已保留当前规则。');
          throw error;
        } finally {
          clearTimeout(timer);
        }
        if (pack.version < current.pack.version)
          throw new Error('远端规则版本较旧，已保留当前规则。');
        const changed = pack.version > current.pack.version;
        if (!changed && !samePack(pack, current.pack))
          throw new Error('规则内容已变化但版本号未更新，已保留当前规则。');
        const state: RuleState = changed
          ? { pack, source: 'downloaded', checkedAt: now(), updatedAt: now() }
          : { ...current, checkedAt: now() };
        // One storage value is replaced only after the entire download validates.
        // Personal settings, disabled rules and account lists are separate keys.
        await port.write(state);
        return state;
      }).finally(() => {
        pending = undefined;
      });
      return pending;
    },
    restore: () =>
      serial(async () => {
        await port.write(null);
        return bundledRuleState();
      }),
  };
}
