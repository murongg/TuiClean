import type { Post } from './detector';

const QUOTE = '[data-testid="quoteTweet"], [data-testid="card.wrapper"], div[role="link"]';
function owned(node: Element, article: Element): boolean {
  return node.closest('article') === article && !node.closest(QUOTE);
}

function visibleText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? '';
  if (node instanceof HTMLImageElement) return node.alt;
  if (node instanceof HTMLBRElement) return '\n';
  return Array.from(node.childNodes).map(visibleText).join('');
}

export function findPostText(article: Element): Element[] {
  return Array.from(article.querySelectorAll('[data-testid="tweetText"]')).filter((node) =>
    owned(node, article),
  );
}

function displayName(user: Element | undefined, author: string): string {
  if (!user) return '';
  const profile = Array.from(user.querySelectorAll('a[href]')).find((link) => {
    try {
      const url = new URL(link.getAttribute('href')!, 'https://x.com');
      return (
        ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname) &&
        url.pathname.replace(/\/$/, '').toLowerCase() === `/${author.toLowerCase()}` &&
        visibleText(link).trim().toLowerCase() !== `@${author.toLowerCase()}`
      );
    } catch {
      return false;
    }
  });
  // Display names may be split into multiple spans around emoji. The profile
  // link owns the full name; the handle and timestamp links are separate.
  const name = profile ?? user.querySelector('span');
  return name ? visibleText(name) : '';
}

export function readPost(article: Element): Post | null {
  const time = Array.from(article.querySelectorAll('time')).find((node) => owned(node, article));
  const href = time?.closest('a')?.getAttribute('href');
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, 'https://x.com');
  } catch {
    return null;
  }
  if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)) return null;
  const match = url.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)(?:\/|$)/);
  if (!match?.[1] || !match[2]) return null;
  // X embeds quoted posts inside the outer article. Classifying their text as
  // the author's own would hide legitimate discussion of spam.
  const nodes = findPostText(article);
  const links = nodes.flatMap((node) =>
    Array.from(node.querySelectorAll('a[href]')).map((link) => {
      const title = link.getAttribute('title');
      return title?.match(/^https?:\/\//) && !title.includes('…')
        ? title
        : link.getAttribute('href')!;
    }),
  );
  const user = Array.from(article.querySelectorAll('[data-testid="User-Name"]')).find((node) =>
    owned(node, article),
  );
  return {
    id: match[2],
    author: match[1],
    name: displayName(user, match[1]),
    text: nodes.map(visibleText).join('\n'),
    links,
    hasMedia: Boolean(
      article.querySelector(
        '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="poll"], [data-testid="card.wrapper"], [data-testid="quoteTweet"], div[role="link"]',
      ),
    ),
  };
}

export function threadRootId(href: string): string | null {
  try {
    return new URL(href).pathname.match(/^\/[^/]+\/status\/(\d+)\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function supportedPage(href: string, scope: 'all' | 'replies'): boolean {
  try {
    const url = new URL(href);
    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname))
      return false;
    if (/^\/(messages|i\/chat|settings|compose|login|logout|account)(\/|$)/.test(url.pathname))
      return false;
    return scope === 'all' || /^\/[^/]+\/status\/\d+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}
