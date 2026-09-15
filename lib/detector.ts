import type { Settings } from './settings';
import {
  adultPattern,
  adultOfferPattern,
  spamPattern,
  contactPattern,
  contextPattern,
  comparisonBaitPattern,
  bodyOnlyBaitPattern,
} from './rules';
import { compactText, normalizeText } from './text';
import { findTemplates } from './templates';
import { hasAdultProfile, hasAdultReferral, hasProfileSpam } from './promotion';
import { matchesUsername } from './accounts';
export { normalizeText } from './text';

export interface Post {
  id: string;
  author: string;
  name: string;
  text: string;
  links: string[];
  hasMedia?: boolean;
}
export interface Decision {
  level: 'allow' | 'suspect' | 'block';
  category?: 'adult' | 'spam' | 'custom';
  rules: string[];
  reasons: string[];
}

const allow = (): Decision => ({ level: 'allow', rules: [], reasons: [] });
function result(
  level: Decision['level'],
  category: Decision['category'],
  rule: string,
  reason: string,
): Decision {
  return { level, category, rules: [rule], reasons: [reason] };
}

export function inspect(
  post: Post,
  settings: Settings,
  evidence: { templateAuthors?: number } = {},
): Decision {
  if (
    !settings.enabled ||
    settings.whitelist.some((name) => name.toLowerCase() === post.author.toLowerCase())
  )
    return allow();
  if (settings.blockedUsers.includes(post.author.toLowerCase()))
    return result('block', 'custom', 'blocked-user', `@${post.author} 在你的本地黑名单中`);
  const accountRule = settings.usernameRules.find((rule) => matchesUsername(post.author, rule));
  if (accountRule)
    return result(
      'block',
      'custom',
      'custom-username',
      `用户名 @${post.author} 命中规则：${accountRule}`,
    );
  const text = normalizeText(post.text.slice(0, 20_000));
  const name = normalizeText(post.name.slice(0, 200));
  const combined = `${text} ${name}`;
  const compact = combined.replace(/\s/g, '');
  const active = (id: string) => !settings.disabledRules.includes(id);
  for (const word of settings.keywords) {
    if (combined.includes(normalizeText(word)))
      return result('block', 'custom', 'custom-keyword', `命中你的关键词：${word}`);
  }
  for (const link of post.links) {
    try {
      const parsed = new URL(link);
      if (!['https:', 'http:'].includes(parsed.protocol)) continue;
      const host = parsed.hostname.toLowerCase();
      const match = settings.domains.find(
        (domain) => host === domain || host.endsWith(`.${domain}`),
      );
      if (match) return result('block', 'custom', 'custom-domain', `命中你的屏蔽域名：${match}`);
    } catch {
      /* Unparseable links are not evidence of spam. */
    }
  }

  // Context protection belongs to the evidence field: an educational body
  // cannot cancel a separate solicitation advertised in the author's name.
  if (
    settings.adult &&
    active('adult-profile') &&
    !contextPattern.test(name) &&
    hasAdultProfile(name)
  ) {
    return result(
      'suspect',
      'adult',
      'adult-profile',
      '昵称包含明确的成人交友招揽，或成人招揽与联系信息的组合',
    );
  }
  if (
    settings.spam &&
    active('spam-profile') &&
    !contextPattern.test(name) &&
    !post.hasMedia &&
    hasProfileSpam(name, text)
  ) {
    return result(
      'suspect',
      'spam',
      'spam-profile',
      '昵称同时含招揽式自称、线下邀约，且正文仅为短数字',
    );
  }

  // A quoted warning or educational discussion is not a solicitation. Explicit
  // user rules above remain authoritative; built-in heuristics fail open here.
  if (contextPattern.test(text)) return allow();
  if (settings.adult && active('adult-referral') && hasAdultReferral(text)) {
    return result(
      'suspect',
      'adult',
      'adult-referral',
      '同时包含其他平台的博主或账号推荐，以及露骨描述或多组性暗示',
    );
  }
  if (settings.adult && active('adult-bait')) {
    const bait = compactText(text);
    if (comparisonBaitPattern.test(bait))
      return result('suspect', 'adult', 'adult-bait', '命中成对的挑逗式自我比较引流话术');
    if (bodyOnlyBaitPattern.test(bait))
      return result('suspect', 'adult', 'adult-bait', '命中完整的关系与身体对照式招揽话术');
  }
  const spam = spamPattern.test(combined) || spamPattern.test(compact);
  // Topic/platform labels in a name do not describe this reply. Keep body hints
  // separate from explicit profile offers; suspect matches also fold by default.
  const adultText = adultPattern.test(text) || adultPattern.test(text.replace(/\s/g, ''));
  const adultName = adultOfferPattern.test(name) || adultOfferPattern.test(name.replace(/\s/g, ''));
  const spamText = spamPattern.test(text) || spamPattern.test(text.replace(/\s/g, ''));
  const external = post.links.some((link) => {
    try {
      const url = new URL(link);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(url.hostname)
      );
    } catch {
      return false;
    }
  });
  const contact =
    contactPattern.test(text) || contactPattern.test(text.replace(/\s/g, '')) || external;
  if (settings.adult && (adultText || adultName)) {
    if (adultText && contact && active('adult-solicitation'))
      return result('block', 'adult', 'adult-solicitation', '同时出现成人内容线索与招揽、导流行为');
    if (active('adult-hint'))
      return result('suspect', 'adult', 'adult-hint', '存在成人内容线索，证据不足');
  }
  if (settings.spam && spam) {
    if (spamText && contact && active('spam-solicitation'))
      return result('block', 'spam', 'spam-solicitation', '同时出现高风险广告话术与招揽、导流行为');
    if (active('spam-hint'))
      return result('suspect', 'spam', 'spam-hint', '存在广告话术，证据不足');
  }
  if (settings.spam && active('spam-template') && (evidence.templateAuthors ?? 0) >= 2) {
    return result(
      'suspect',
      'spam',
      'spam-template',
      `当前已加载回复中，${evidence.templateAuthors} 个不同账号使用相同文字模板（已忽略表情、空白和零宽字符）`,
    );
  }
  return allow();
}

/** Shared by the real page and editable demo so their context rules cannot drift. */
export function inspectBatch(
  posts: readonly Post[],
  settings: Settings,
  rootId: string | null,
): Map<Post, Decision> {
  const whitelist = new Set(settings.whitelist.map((author) => author.toLowerCase()));
  const templates =
    rootId && settings.spam && !settings.disabledRules.includes('spam-template')
      ? findTemplates(
          posts.filter((post) => post.id !== rootId && !whitelist.has(post.author.toLowerCase())),
        )
      : new Map<string, number>();
  return new Map(
    posts.map((post) => [
      post,
      inspect(post, settings, { templateAuthors: templates.get(post.id) }),
    ]),
  );
}
