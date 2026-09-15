import type { Settings } from './settings';

export interface LocalBlockResult {
  added: string[];
  skipped: string[];
}

export function planLocalBlocks(authors: readonly string[], settings: Settings): LocalBlockResult {
  if (authors.length > 1000) throw new Error('单次最多处理 1000 个账号。');
  const unique = [...new Set(authors.map(normalizeUsername))];
  const excluded = new Set(
    [...settings.whitelist, ...settings.blockedUsers].map((name) => name.toLowerCase()),
  );
  return {
    added: unique.filter((name) => !excluded.has(name)),
    skipped: unique.filter((name) => excluded.has(name)),
  };
}

export function normalizeUsername(value: string): string {
  const name = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(name))
    throw new Error('请填写有效的 X 用户名，如 @sample_user，不要填写昵称或链接。');
  return name;
}

export function normalizeUsernameRule(value: string): string {
  const rule = value.trim().replace(/^@/, '').toLowerCase().replace(/\*+/g, '*');
  if (!/^[a-z0-9_*]+$/.test(rule) || !/[a-z0-9_]/.test(rule) || rule.replace(/\*/g, '').length > 15)
    throw new Error('用户名规则支持完整账号或 * 通配符，如 @sample_user、demo_*；不能只填写 *。');
  return rule;
}

export function matchesUsername(author: string, rule: string): boolean {
  const name = author.toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(name)) return false;
  // Match a tiny glob directly: user input never becomes executable regex.
  let i = 0;
  let j = 0;
  let star = -1;
  let retry = 0;
  while (i < name.length) {
    if (name[i] === rule[j]) {
      i++;
      j++;
    } else if (rule[j] === '*') {
      star = j++;
      retry = i;
    } else if (star >= 0) {
      j = star + 1;
      i = ++retry;
    } else return false;
  }
  while (rule[j] === '*') j++;
  return j === rule.length;
}
