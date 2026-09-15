import type { Decision, Post } from './detector';
import { normalizeUsername } from './accounts';

export const HISTORY_KEY = 'tuiclean:history';
export const HISTORY_LIMIT = 1000;
export const HISTORY_BYTE_LIMIT = 4 * 1024 * 1024;
export const HISTORY_TEXT_LIMIT = 5000;
export interface HistoryMatch {
  id: string;
  author: string;
  category: 'adult' | 'spam' | 'custom';
  rules: string[];
  reasons: string[];
  action: 'folded' | 'marked';
  text?: string;
  textTruncated?: boolean;
}
export interface HistoryEntry extends HistoryMatch {
  recordedAt: number;
}
export interface HistorySource {
  list: () => Promise<HistoryEntry[]>;
  clear: () => Promise<void>;
  merge?: (entries: readonly HistoryEntry[]) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
}

function parseMatch(value: unknown): HistoryMatch {
  if (!value || typeof value !== 'object') throw new Error('拦截记录格式不正确。');
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    !/^\d{1,30}$/.test(row.id) ||
    typeof row.author !== 'string' ||
    row.author.length > 16 ||
    typeof row.category !== 'string' ||
    !['adult', 'spam', 'custom'].includes(row.category) ||
    typeof row.action !== 'string' ||
    !['folded', 'marked'].includes(row.action)
  )
    throw new Error('拦截记录中的账号或类型不正确。');
  const strings = (input: unknown, count: number, length: number): string[] => {
    if (
      !Array.isArray(input) ||
      !input.length ||
      input.length > count ||
      input.some((item) => typeof item !== 'string' || item.length > length)
    )
      throw new Error('拦截记录的规则或原因过长。');
    return [...new Set(input)] as string[];
  };
  if (
    (row.text !== undefined &&
      (typeof row.text !== 'string' || row.text.length > HISTORY_TEXT_LIMIT)) ||
    (row.textTruncated !== undefined && typeof row.textTruncated !== 'boolean')
  )
    throw new Error('拦截原文格式不正确或过长。');
  // Only the captured plain text is added to metadata. Never persist page HTML,
  // unrelated DOM fields or a spread of the incoming message.
  return {
    id: row.id,
    author: normalizeUsername(row.author),
    category: row.category as HistoryMatch['category'],
    action: row.action as HistoryMatch['action'],
    rules: strings(row.rules, 8, 80),
    reasons: strings(row.reasons, 3, 240),
    ...(typeof row.text === 'string'
      ? { text: row.text, ...(row.textTruncated ? { textTruncated: true } : {}) }
      : {}),
  };
}

export function historyMatch(post: Post, decision: Decision, folded: boolean): HistoryMatch | null {
  if (decision.level === 'allow' || !decision.category) return null;
  const text = post.text.slice(0, HISTORY_TEXT_LIMIT).replace(/[\uD800-\uDBFF]$/u, '');
  return parseMatch({
    id: post.id,
    author: post.author,
    category: decision.category,
    rules: decision.rules,
    reasons: decision.reasons.map((reason) => reason.slice(0, 240)),
    action: folded ? 'folded' : 'marked',
    text,
    textTruncated: text.length < post.text.length,
  });
}

export function historyUrl(entry: Pick<HistoryMatch, 'id' | 'author'>): string {
  if (!/^\d{1,30}$/.test(entry.id)) throw new Error('无效的帖文编号。');
  return `https://x.com/${normalizeUsername(entry.author)}/status/${entry.id}`;
}

export function readHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, HistoryEntry>();
  for (const raw of value) {
    try {
      const row = parseEntry(raw);
      if (!unique.has(row.id)) unique.set(row.id, row);
    } catch {
      /* A malformed row must not make the remaining history unreadable. */
    }
  }
  const sorted = [...unique.values()]
    .sort((a, b) => b.recordedAt - a.recordedAt || b.id.localeCompare(a.id))
    .slice(0, HISTORY_LIMIT);
  // Text varies greatly in size. Retain the newest records within a byte budget
  // as well as the count cap, leaving storage space for preferences and accounts.
  let bytes = 2;
  const rows: HistoryEntry[] = [];
  const encoder = new TextEncoder();
  for (const row of sorted) {
    const size = encoder.encode(JSON.stringify(row)).byteLength + (rows.length ? 1 : 0);
    if (bytes + size > HISTORY_BYTE_LIMIT) break;
    bytes += size;
    rows.push(row);
  }
  return rows;
}

function parseEntry(value: unknown): HistoryEntry {
  const row = parseMatch(value);
  const recordedAt = (value as Record<string, unknown>).recordedAt;
  if (
    typeof recordedAt !== 'number' ||
    !Number.isSafeInteger(recordedAt) ||
    recordedAt <= 0 ||
    !Number.isFinite(new Date(recordedAt).getTime())
  )
    throw new Error('拦截记录时间不正确。');
  return { ...row, recordedAt };
}

export function validateHistoryEntries(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value) || value.length > HISTORY_LIMIT)
    throw new Error(`备份最多包含 ${HISTORY_LIMIT} 条拦截记录。`);
  return value.map(parseEntry);
}

export function createHistoryStore(
  port: {
    read: () => Promise<unknown>;
    write: (rows: HistoryEntry[]) => Promise<void>;
    shouldRecord?: () => Promise<boolean>;
  },
  now = Date.now,
) {
  let queue = Promise.resolve();
  const listeners = new Set<() => void>();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const task = queue.then(operation);
    queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    list: () => serial(async () => readHistory(await port.read())),
    record: (values: readonly HistoryMatch[]) =>
      serial(async () => {
        // Preference reads belong to the write queue so clear cannot overtake them.
        if (port.shouldRecord && !(await port.shouldRecord())) return;
        if (!Array.isArray(values) || values.length > HISTORY_LIMIT)
          throw new Error('单次拦截记录数量过多。');
        const incoming = values.map(parseMatch);
        const rows = readHistory(await port.read());
        const known = new Set(rows.map((row) => row.id));
        const fresh = incoming.filter((row) => {
          if (known.has(row.id)) return false;
          known.add(row.id);
          return true;
        });
        if (!fresh.length) return;
        const recordedAt = now();
        await port.write(readHistory([...fresh.map((row) => ({ ...row, recordedAt })), ...rows]));
        emit();
      }),
    clear: () =>
      serial(async () => {
        await port.write([]);
        emit();
      }),
    merge: (entries: readonly HistoryEntry[]) =>
      serial(async () => {
        const incoming = validateHistoryEntries(entries);
        const current = readHistory(await port.read());
        await port.write(readHistory([...current, ...incoming]));
        emit();
      }),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
