import type { Post } from './detector';
import { compactText } from './text';

export function templateKey(post: Post): string | null {
  if (post.hasMedia || post.text.length > 2000) return null;
  const text = compactText(post.text);
  if ((text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 16) return null;
  // The same caption with different links can describe different resources.
  // Keep link targets (including path case) in the comparison key.
  return JSON.stringify([text, [...new Set(post.links)].sort()]);
}

export function findTemplates(posts: readonly Post[]): Map<string, number> {
  const groups = new Map<string, { ids: string[]; authors: Set<string> }>();
  const seen = new Set<string>();
  for (const post of posts) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    const key = templateKey(post);
    if (!key) continue;
    const group = groups.get(key) ?? { ids: [], authors: new Set<string>() };
    group.ids.push(post.id);
    group.authors.add(post.author.toLowerCase());
    groups.set(key, group);
  }
  const evidence = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.authors.size < 2) continue;
    for (const id of group.ids) evidence.set(id, group.authors.size);
  }
  return evidence;
}
