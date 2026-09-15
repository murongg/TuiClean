import { inspectBatch, type Post } from './detector';
import type { Settings } from './settings';
import { readPost, supportedPage, threadRootId } from './page';
import { noticeInPlace, pageStyle, present } from './presentation';
import { historyMatch, type HistoryMatch } from './history';

export interface PageStats {
  scanned: number;
  folded: number;
  marked: number;
  paused: boolean;
  supported: boolean;
  errors: number;
}
interface Options {
  document: Document;
  getUrl: () => string;
  settings: Settings;
  onWhitelist: (author: string) => Promise<void>;
  onBlock?: (author: string, blocked: boolean) => Promise<Settings>;
  onBlockX?: (article: Element, post: Post, signal: AbortSignal) => Promise<void>;
  onStats?: (stats: PageStats) => void;
  onHistory?: (entries: HistoryMatch[]) => Promise<void>;
}

export function createController(options: Options) {
  const { document: doc } = options;
  let settings = options.settings;
  let url = options.getUrl();
  let paused = false;
  let stopped = false;
  let started = false;
  let nativeAbort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let navigationTimer: ReturnType<typeof setInterval> | undefined;
  const visibility = new Map<string, 'expanded' | 'folded' | 'dismissed'>();
  const recorded = new Set<string>();
  const mounted = new Map<Element, { key: string; host: HTMLElement; folded: boolean }>();
  let stats: PageStats = { scanned: 0, folded: 0, marked: 0, paused, supported: false, errors: 0 };
  const stylesheet = doc.createElement('style');
  stylesheet.dataset.tuicleanStyle = '';
  stylesheet.textContent = pageStyle;
  const observer = new MutationObserver(() => {
    if (!timer && !stopped)
      timer = setTimeout(() => {
        timer = undefined;
        scan();
      }, 150);
  });
  const observe = () => {
    if (started && !stopped)
      observer.observe(doc.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['href', 'data-testid', 'alt'],
      });
  };

  function restore(element: Element) {
    element.removeAttribute('data-tuiclean-folded');
    mounted.get(element)?.host.remove();
    mounted.delete(element);
  }
  function scan() {
    if (stopped) return;
    // Disconnect during our own writes so injected notices never trigger a
    // self-sustaining MutationObserver loop on X's virtualized feed.
    observer.disconnect();
    try {
      const nextUrl = options.getUrl();
      if (nextUrl !== url) {
        nativeAbort.abort();
        nativeAbort = new AbortController();
        url = nextUrl;
        paused = false;
        visibility.clear();
        recorded.clear();
        for (const el of mounted.keys()) restore(el);
      }
      const supported = supportedPage(url, settings.scope);
      stats = { scanned: 0, folded: 0, marked: 0, paused, supported, errors: 0 };
      if (!stylesheet.isConnected) doc.head.append(stylesheet);
      for (const element of mounted.keys()) {
        if (!element.isConnected || !element.matches('article[data-testid="tweet"]'))
          restore(element);
      }
      if (!settings.enabled || paused || !supported) {
        nativeAbort.abort();
        nativeAbort = new AbortController();
        for (const element of mounted.keys()) restore(element);
        return;
      }
      const candidates: { element: Element; post: Post }[] = [];
      for (const element of doc.querySelectorAll('article[data-testid="tweet"]')) {
        try {
          const post = readPost(element);
          if (!post) {
            restore(element);
            stats.errors++;
            continue;
          }
          stats.scanned++;
          candidates.push({ element, post });
        } catch {
          restore(element);
          stats.errors++;
        }
      }
      // Compare a snapshot before presenting anything: the second arrival must
      // also update earlier replies. Never pool unrelated home-feed threads or
      // use the root post/explicitly allowed authors as evidence against others.
      const decisions = inspectBatch(
        candidates.map((item) => item.post),
        settings,
        threadRootId(url),
      );
      const records: HistoryMatch[] = [];
      for (const { element, post } of candidates) {
        try {
          const decision = decisions.get(post)!;
          // A new explicit account block must override old one-post dismissals
          // and expansions, including other loaded posts by the same author.
          const blocked = decision.rules.includes('blocked-user');
          const identity = JSON.stringify([post.id, post.author, post.text, post.links, blocked]);
          const preference = visibility.get(identity);
          if (decision.level === 'allow' || preference === 'dismissed') {
            restore(element);
            continue;
          }
          // Expansion is a visibility override, not a dismissal. Keeping these
          // states separate leaves the toolbar available after every toggle.
          // Evidence strength labels suspicion; the selected mode controls
          // whether matched content starts folded, including weak matches.
          const folded = preference
            ? preference === 'folded'
            : blocked || settings.mode === 'balanced';
          const key = JSON.stringify([identity, decision, folded]);
          const existing = mounted.get(element);
          if (
            existing?.key !== key ||
            !existing.host.isConnected ||
            !noticeInPlace(element, existing.host, folded)
          ) {
            restore(element);
            const host = present(element, post, decision, folded, {
              reveal: () => {
                visibility.set(identity, 'expanded');
                scan();
              },
              fold: () => {
                visibility.set(identity, 'folded');
                scan();
              },
              dismiss: () => {
                visibility.set(identity, 'dismissed');
                scan();
              },
              allow: async () => {
                await options.onWhitelist(post.author);
                settings = {
                  ...settings,
                  whitelist: [...new Set([...settings.whitelist, post.author.toLowerCase()])],
                };
                scan();
              },
              setBlocked: options.onBlock
                ? async (blocked) => {
                    const current = readPost(element);
                    if (
                      current?.id !== post.id ||
                      current.author.toLowerCase() !== post.author.toLowerCase()
                    )
                      throw new Error('目标账号已变化，请重新操作。');
                    settings = await options.onBlock!(post.author, blocked);
                    scan();
                  }
                : undefined,
              blockX: options.onBlockX
                ? () => options.onBlockX!(element, post, nativeAbort.signal)
                : undefined,
            });
            mounted.set(element, { key, host, folded });
          }
          if (folded) stats.folded++;
          else stats.marked++;
          if (settings.historyEnabled && options.onHistory && !recorded.has(post.id)) {
            try {
              const record = historyMatch(post, decision, folded);
              if (record) {
                records.push(record);
                recorded.add(post.id);
              }
            } catch {
              stats.errors++;
            }
          }
        } catch {
          restore(element);
          stats.errors++;
        }
      }
      if (records.length) {
        // Remember before the async write: rescans and virtualized DOM remounts
        // must not duplicate records or refill a history just cleared by the user.
        void Promise.resolve()
          .then(() => {
            if (!stopped && settings.historyEnabled) return options.onHistory!(records);
          })
          .catch(() => {
            if (stopped) return;
            for (const row of records) recorded.delete(row.id);
            stats.errors++;
            options.onStats?.({ ...stats });
          });
      }
    } finally {
      observe();
      options.onStats?.({ ...stats });
    }
  }
  return {
    scan,
    getStats: () => ({ ...stats }),
    updateSettings(next: Settings) {
      if ((!settings.enabled || !settings.historyEnabled) && next.enabled && next.historyEnabled)
        recorded.clear();
      settings = next;
      scan();
    },
    togglePause() {
      paused = !paused;
      scan();
    },
    start() {
      if (started || stopped) return;
      started = true;
      scan();
      // pushState does not emit popstate. A cheap URL-only check covers X's
      // client navigation even when it produces no observable DOM mutation.
      navigationTimer = setInterval(() => {
        if (options.getUrl() !== url) scan();
      }, 800);
    },
    stop() {
      stopped = true;
      nativeAbort.abort();
      observer.disconnect();
      clearTimeout(timer);
      clearInterval(navigationTimer);
      for (const element of mounted.keys()) restore(element);
      stylesheet.remove();
      visibility.clear();
      recorded.clear();
    },
  };
}
