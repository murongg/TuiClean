import bundled from '../rules/builtin.json';
import { normalizeText } from './text';

export const RULE_PACK_LIMIT = 256 * 1024;
const categories = {
  'adult-solicitation': 'adult',
  'adult-hint': 'adult',
  'adult-bait': 'adult',
  'adult-referral': 'adult',
  'adult-profile': 'adult',
  'spam-profile': 'spam',
  'spam-solicitation': 'spam',
  'spam-hint': 'spam',
  'spam-template': 'spam',
} as const;
export type RuleId = keyof typeof categories;
export type TermKey = keyof typeof bundled.terms;
export interface RuleInfo {
  id: RuleId;
  category: 'adult' | 'spam';
  name: string;
  description: string;
}
export interface RulePack {
  schema: 2;
  version: number;
  updatedAt: string;
  rules: RuleInfo[];
  terms: Record<TermKey, string[]>;
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error('规则包字段不完整或包含不支持的数据。');
  return value as Record<string, unknown>;
}
function text(value: unknown, limit: number): string {
  if (
    typeof value !== 'string' ||
    !normalizeText(value) ||
    value.length > limit ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error('规则包包含无效或过长的文字。');
  return value;
}
export function validateRulePack(value: unknown): RulePack {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > RULE_PACK_LIMIT)
    throw new Error('规则包过大，已保留当前规则。');
  const pack = object(value, ['schema', 'version', 'updatedAt', 'rules', 'terms']);
  if (pack.schema !== 2) throw new Error('规则包格式不兼容，请先更新扩展。');
  if (!Number.isSafeInteger(pack.version) || (pack.version as number) < 1)
    throw new Error('规则包版本无效。');
  const date = text(pack.updatedAt, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error('规则包日期无效。');
  if (!Array.isArray(pack.rules) || pack.rules.length !== Object.keys(categories).length)
    throw new Error('规则列表不完整。');
  const seen = new Set<string>();
  const rules = pack.rules.map((raw) => {
    const rule = object(raw, ['id', 'category', 'name', 'description']);
    const id = text(rule.id, 40) as RuleId;
    if (!Object.hasOwn(categories, id) || seen.has(id) || rule.category !== categories[id])
      throw new Error('规则编号或分类不兼容。');
    seen.add(id);
    return {
      id,
      category: categories[id],
      name: text(rule.name, 40),
      description: text(rule.description, 240),
    };
  });
  const keys = Object.keys(bundled.terms) as TermKey[];
  const rawTerms = object(pack.terms, keys);
  let total = 0;
  const terms = Object.fromEntries(
    keys.map((key) => {
      const list = rawTerms[key];
      if (!Array.isArray(list) || !list.length || list.length > 200)
        throw new Error('规则词表为空或超过数量限制。');
      const values = list.map((value) => text(value, 80));
      total += values.length;
      return [key, [...new Set(values)]];
    }),
  ) as RulePack['terms'];
  if (total > 2000) throw new Error('规则词条总量超过限制。');
  return { schema: 2, version: pack.version as number, updatedAt: date, rules, terms };
}
export const BUNDLED_RULE_PACK = validateRulePack(bundled);
