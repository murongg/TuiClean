import type { Post } from '../../lib/detector';
import { normalizeText } from '../../lib/text';

export interface Draft {
  text: string;
  author: string;
  name: string;
}
export interface Sample extends Post {
  kind: string;
  time: string;
  custom?: boolean;
}
interface Segment {
  text: string;
  url?: string;
}

export function textSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gu)) {
    const url = match[0].replace(/[.,!?;:，。！？；：、）)\]}]+$/u, '');
    if (!url) continue;
    try {
      new URL(url);
    } catch {
      continue;
    }
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index) });
    segments.push({ text: url, url });
    cursor = match.index + url.length;
  }
  if (cursor < text.length || !segments.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

export function createSample(draft: Draft, sequence: number): Sample {
  if (!normalizeText(draft.text)) throw new Error('请输入要测试的内容。');
  if (draft.text.length > 20_000) throw new Error('每条测试内容最多 20,000 个字符。');
  const author = draft.author.trim().replace(/^@/, '').toLowerCase() || `test_${sequence}`;
  if (!/^[a-z0-9_]{1,15}$/.test(author))
    throw new Error('账号请使用 1–15 位英文字母、数字或下划线。');
  const name = draft.name.trim() || '测试作者';
  if (name.length > 80) throw new Error('昵称最多 80 个字符。');
  return {
    id: String(sequence),
    author,
    name,
    text: draft.text,
    links: textSegments(draft.text).flatMap((segment) => (segment.url ? [segment.url] : [])),
    kind: '自定义测试',
    time: '刚刚',
    custom: true,
  };
}
