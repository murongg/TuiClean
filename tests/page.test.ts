import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPost } from '../lib/page';
import { createController } from '../lib/controller';
import { defaultSettings } from '../lib/settings';
import { BUNDLED_RULE_PACK } from '../lib/rule-pack';
import { compileRules, DEFAULT_RULES } from '../lib/rules';

function article(id = '101', text = '成人资源，私信获取完整链接', author = 'sample_user') {
  const element = document.createElement('article');
  element.dataset.testid = 'tweet';
  element.innerHTML = `<div><div data-testid="User-Name"><span>示例账号</span><a href="https://x.com/${author}/status/${id}"><time>示例时间</time></a></div><div data-testid="tweetText"></div><button>原始操作</button></div>`;
  element.querySelector('[data-testid="tweetText"]')!.textContent = text;
  document.body.append(element);
  return element;
}

const controllers: ReturnType<typeof createController>[] = [];
function controller(getUrl = () => 'https://x.com/sample_op/status/100') {
  const instance = createController({
    document,
    getUrl,
    settings: defaultSettings,
    onWhitelist: vi.fn().mockResolvedValue(undefined),
  });
  controllers.push(instance);
  return instance;
}
afterEach(() => {
  controllers.forEach((c) => c.stop());
  controllers.length = 0;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('X page adapter', () => {
  it('extracts only the post author and its own text', () => {
    const element = article('101', '这是一个普通示例回复。');
    element
      .querySelector('div')!
      .insertAdjacentHTML(
        'beforeend',
        '<div role="link" data-testid="quoteTweet"><div data-testid="tweetText">成人资源，私信获取链接</div></div>',
      );
    expect(readPost(element)).toMatchObject({
      id: '101',
      author: 'sample_user',
      text: '这是一个普通示例回复。',
    });
  });
  it('keeps emoji alt text in the text being classified', () => {
    const element = article();
    element.querySelector('[data-testid="tweetText"]')!.innerHTML =
      '示例<img alt="🌿" src="https://example.test/emoji.svg">文本';
    expect(readPost(element)?.text).toBe('示例🌿文本');
  });
  it('reads a split display name from the profile link without the handle or timestamp', () => {
    const element = article('501', '一条虚构留言。', 'sample_author');
    element.querySelector('[data-testid="User-Name"]')!.innerHTML =
      '<a href="https://x.com/sample_author"><span>同城</span><span>约p</span><span>主页联系</span></a><a href="https://x.com/sample_author"><span>@sample_author</span></a><a href="https://x.com/sample_author/status/501"><time>示例时间</time></a>';
    expect(readPost(element)?.name).toBe('同城约p主页联系');
  });
  it('fails open when identity cannot be extracted', () => {
    const element = article();
    element.querySelector('a')!.remove();
    expect(readPost(element)).toBeNull();
  });
  it('distinguishes embedded media from emoji images for template comparison', () => {
    const element = article('201', '一条用于媒体提取的虚构文本');
    element
      .querySelector('[data-testid="tweetText"]')!
      .insertAdjacentHTML('beforeend', '<img alt="🌿" src="https://example.test/emoji.svg">');
    expect(readPost(element)?.hasMedia).toBe(false);
    element
      .querySelector('div')!
      .insertAdjacentHTML(
        'beforeend',
        '<div data-testid="tweetPhoto"><img alt="虚构插图" src="https://example.test/photo.png"></div>',
      );
    expect(readPost(element)?.hasMedia).toBe(true);
  });
});

describe('reversible page filtering', () => {
  it('rescans existing posts when the active rule package changes and restores removed matches', () => {
    const element = article('5201', '合成在线词', 'sample_online');
    const app = controller();
    app.scan();
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(false);
    const pack = structuredClone(BUNDLED_RULE_PACK);
    pack.version++;
    pack.terms.adultOffers.push('合成在线词');
    app.updateRules(compileRules(pack));
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(true);
    app.updateRules(DEFAULT_RULES);
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(false);
    expect(element.querySelector('[data-tuiclean-host]')).toBeNull();
  });
  it('keeps a harmless reply visible for an NSFW-labelled name while honoring explicit keywords', () => {
    const element = article('2301', '这个演示有公开版本吗？', 'sample_notes');
    element.querySelector('[data-testid="User-Name"] span')!.textContent = 'Sample NSFW Notes';
    const app = controller();
    app.scan();
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(false);
    expect(element.querySelector('[data-tuiclean-host]')).toBeNull();
    app.updateSettings({ ...defaultSettings, keywords: ['nsfw'] });
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(true);
    app.updateSettings(defaultSettings);
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(false);
    expect(element.querySelector('[data-tuiclean-host]')).toBeNull();
  });
  it('folds both short-bait replies even if just one author is on the local blacklist', () => {
    const first = article('2001', '不介入生活🌿只进入身体', 'sample_blocked');
    const second = article('2002', '不介入生活🧩只进入身体', 'sample_new');
    const app = controller();
    app.updateSettings({ ...defaultSettings, blockedUsers: ['sample_blocked'] });
    expect(first.hasAttribute('data-tuiclean-folded')).toBe(true);
    expect(second.hasAttribute('data-tuiclean-folded')).toBe(true);
    expect(
      second.querySelector('[data-tuiclean-host]')!.shadowRoot!.querySelector('.reason')
        ?.textContent,
    ).toContain('身体');
  });
  it('folds a standalone euphemistic referral with a readable reason', () => {
    const element = article(
      '1901',
      '抖音博主「虚构频道甲」分享身体私密探索片段，让人欲罢不能。',
      'sample_referral',
    );
    const app = controller();
    app.scan();
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(true);
    expect(
      element.querySelector('[data-tuiclean-host]')!.shadowRoot!.querySelector('.reason')
        ?.textContent,
    ).toContain('性暗示');
  });
  it('starts recording after a disabled pending capture is enabled again', async () => {
    article('900', 'NSFW', 'sample_switch');
    const onHistory = vi.fn().mockResolvedValue(undefined);
    const app = createController({
      document,
      getUrl: () => 'https://x.com/home',
      settings: defaultSettings,
      onWhitelist: vi.fn(),
      onHistory,
    });
    controllers.push(app);
    app.scan();
    app.updateSettings({ ...defaultSettings, historyEnabled: false });
    await Promise.resolve();
    expect(onHistory).not.toHaveBeenCalled();
    app.updateSettings(defaultSettings);
    await vi.waitFor(() => expect(onHistory).toHaveBeenCalledOnce());
  });
  it('records presented matches once per page without recording them again on rescans', async () => {
    article('901', 'NSFW', 'sample_history');
    const onHistory = vi.fn().mockResolvedValue(undefined);
    const app = createController({
      document,
      getUrl: () => 'https://x.com/home',
      settings: defaultSettings,
      onWhitelist: vi.fn(),
      onHistory,
    });
    controllers.push(app);
    app.scan();
    app.scan();
    await vi.waitFor(() => expect(onHistory).toHaveBeenCalledOnce());
    expect(onHistory).toHaveBeenCalledWith([
      expect.objectContaining({ id: '901', action: 'folded' }),
    ]);
    onHistory.mockClear();
    app.scan();
    await Promise.resolve();
    expect(onHistory).not.toHaveBeenCalled();
    article('902', 'NSFW', 'sample_fresh');
    app.scan();
    await vi.waitFor(() =>
      expect(onHistory).toHaveBeenCalledWith([expect.objectContaining({ id: '902' })]),
    );
  });
  it('honors the history switch and records mark-only treatment accurately', async () => {
    article('903', 'NSFW', 'sample_mark');
    const onHistory = vi.fn().mockResolvedValue(undefined);
    const app = createController({
      document,
      getUrl: () => 'https://x.com/home',
      settings: { ...defaultSettings, historyEnabled: false, mode: 'mark' },
      onWhitelist: vi.fn(),
      onHistory,
    });
    controllers.push(app);
    app.scan();
    await Promise.resolve();
    expect(onHistory).not.toHaveBeenCalled();
    app.updateSettings({ ...defaultSettings, mode: 'mark' });
    await vi.waitFor(() =>
      expect(onHistory).toHaveBeenCalledWith([expect.objectContaining({ action: 'marked' })]),
    );
  });
  it('keeps filtering usable when history storage rejects and retries on a later scan', async () => {
    const element = article('904', 'NSFW', 'sample_retry');
    const onHistory = vi
      .fn()
      .mockRejectedValueOnce(new Error('合成历史存储错误'))
      .mockResolvedValue(undefined);
    const app = createController({
      document,
      getUrl: () => 'https://x.com/home',
      settings: defaultSettings,
      onWhitelist: vi.fn(),
      onHistory,
    });
    controllers.push(app);
    app.scan();
    await vi.waitFor(() => expect(app.getStats().errors).toBe(1));
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(true);
    app.scan();
    await vi.waitFor(() => expect(onHistory).toHaveBeenCalledTimes(2));
  });
  it('folds name solicitation with numeric bodies and keeps restoration available', () => {
    const explicit = article('801', '8', 'sample_seeking');
    explicit.querySelector('[data-testid="User-Name"]')!.innerHTML =
      '<a href="/sample_seeking"><span>虚构账号</span><span>寻固炮</span></a><a href="/sample_seeking/status/801"><time>测试时间</time></a>';
    const invitation = article('802', '9', 'sample_offline');
    invitation.querySelector('[data-testid="User-Name"] span')!.textContent = '你的学长 · 线下报名';
    const app = controller();
    app.scan();
    for (const element of [explicit, invitation]) {
      expect(element.hasAttribute('data-tuiclean-folded')).toBe(true);
      element
        .querySelector('[data-tuiclean-host]')!
        .shadowRoot!.querySelector<HTMLButtonElement>('[data-action="reveal"]')!
        .click();
      expect(element.hasAttribute('data-tuiclean-folded')).toBe(false);
      expect(
        element
          .querySelector('[data-tuiclean-host]')!
          .shadowRoot!.querySelector('[data-action="fold"]'),
      ).not.toBeNull();
    }
  });
  it('locally blocks all loaded posts by an author and can undo without trusting them', async () => {
    const first = article('701', 'NSFW', 'sample_ad');
    const other = article('702', '普通虚构内容。', 'sample_ad');
    let settings = { ...defaultSettings, mode: 'mark' as const };
    const onBlock = vi.fn(async (author: string, blocked: boolean) => {
      settings = { ...settings, blockedUsers: blocked ? [author] : [] };
      return settings;
    });
    const app = createController({
      document,
      getUrl: () => 'https://x.com/home',
      settings,
      onWhitelist: vi.fn(),
      onBlock,
    });
    controllers.push(app);
    app.scan();
    first
      .querySelector('[data-tuiclean-host]')!
      .shadowRoot!.querySelector<HTMLButtonElement>('[data-action="block"]')!
      .click();
    await vi.waitFor(() => expect(other.hasAttribute('data-tuiclean-folded')).toBe(true));
    expect(first.hasAttribute('data-tuiclean-folded')).toBe(true);
    expect(onBlock).toHaveBeenCalledWith('sample_ad', true);
    other
      .querySelector('[data-tuiclean-host]')!
      .shadowRoot!.querySelector<HTMLButtonElement>('[data-action="unblock"]')!
      .click();
    await vi.waitFor(() => expect(other.querySelector('[data-tuiclean-host]')).toBeNull());
    expect(settings.whitelist).toEqual([]);
    expect(first.querySelector('[data-tuiclean-host]')).not.toBeNull();
  });
  it('folds standalone referral and profile promotion with the normal page pipeline', () => {
    const referral = article(
      '501',
      '抖音有位博主叫「虚构频道甲」，推荐去看，内容带有娇喘片段。',
      'sample_ref',
    );
    const named = article('502', '一条虚构留言。', 'sample_name');
    named.querySelector('[data-testid="User-Name"] span')!.textContent = '同城约p · 主页联系';
    const app = controller();
    app.scan();
    expect(referral.hasAttribute('data-tuiclean-folded')).toBe(true);
    expect(named.hasAttribute('data-tuiclean-folded')).toBe(true);
    expect(app.getStats()).toMatchObject({ scanned: 2, folded: 2 });
  });
  it('folds a standalone root post with comparison bait even with no peer replies', () => {
    const element = article('100', '比我俊的没有我浪🌿比我浪的没有我俊', 'sample_op');
    const app = controller();
    app.scan();
    expect(app.getStats()).toMatchObject({ scanned: 1, folded: 1 });
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(true);
    expect(element.querySelector('[data-tuiclean-host]')!.shadowRoot!.textContent).toContain(
      '引流话术',
    );
  });
  it('folds high-confidence content without removing original nodes and allows reveal', () => {
    const element = article();
    const original = element.firstElementChild;
    const app = controller();
    app.scan();
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(true);
    expect(element.firstElementChild).toBe(original);
    const host = element.querySelector('[data-tuiclean-host]')!;
    expect(host.shadowRoot!.textContent).toContain('色情引流');
    (host.shadowRoot!.querySelector('[data-action="reveal"]') as HTMLButtonElement).click();
    app.scan();
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(false);
  });
  it('keeps weak signals visible and mark-only mode never folds', () => {
    const weak = article('102', 'NSFW');
    const high = article();
    const app = controller();
    app.updateSettings({ ...defaultSettings, mode: 'mark' });
    app.scan();
    expect(weak.hasAttribute('data-tuiclean-folded')).toBe(false);
    expect(high.hasAttribute('data-tuiclean-folded')).toBe(false);
    expect(app.getStats().marked).toBe(2);
  });
  it('restores everything when disabled and removes markers on stop', () => {
    const element = article();
    const app = controller();
    app.scan();
    app.updateSettings({ ...defaultSettings, enabled: false });
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(false);
    expect(element.querySelector('[data-tuiclean-host]')).toBeNull();
    app.stop();
    expect(document.querySelector('[data-tuiclean-style]')).toBeNull();
  });
  it('reclassifies recycled DOM nodes and clears stale UI', () => {
    const element = article();
    const app = controller();
    app.scan();
    element.querySelector('[data-testid="tweetText"]')!.textContent = '新的普通内容，欢迎交流。';
    element.querySelector('a')!.href = 'https://x.com/sample_other/status/999';
    app.scan();
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(false);
    expect(element.querySelector('[data-tuiclean-host]')).toBeNull();
  });
  it('restores a mounted article when the website reuses it for another role', () => {
    const element = article();
    const app = controller();
    app.scan();
    element.dataset.testid = 'other-content';
    app.scan();
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(false);
    expect(element.querySelector('[data-tuiclean-host]')).toBeNull();
  });
  it('page pause includes new posts and resets on navigation', () => {
    let url = 'https://x.com/sample_op/status/100';
    const app = controller(() => url);
    article();
    app.scan();
    app.togglePause();
    const next = article('103');
    app.scan();
    expect(next.hasAttribute('data-tuiclean-folded')).toBe(false);
    url = 'https://x.com/sample_op/status/200';
    app.scan();
    expect(next.hasAttribute('data-tuiclean-folded')).toBe(true);
  });
  it('explicit whitelisting restores all currently loaded posts from the account', () => {
    const element = article();
    const app = controller();
    app.scan();
    app.updateSettings({ ...defaultSettings, whitelist: ['sample_user'] });
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(false);
  });
  it('does not process direct messages or unsupported pages', () => {
    const element = article();
    const app = controller(() => 'https://x.com/messages');
    app.scan();
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(false);
    expect(app.getStats().supported).toBe(false);
  });
  it('observes dynamically loaded text and disconnects cleanly', async () => {
    vi.useFakeTimers();
    const app = controller();
    app.start();
    const element = article();
    await vi.advanceTimersByTimeAsync(300);
    expect(element.hasAttribute('data-tuiclean-folded')).toBe(true);
    app.stop();
    article('300');
    await vi.advanceTimersByTimeAsync(300);
    expect(document.querySelectorAll('[data-tuiclean-host]')).toHaveLength(0);
  });
});

describe('template evidence in a loaded discussion', () => {
  const text = (emoji: string) => `虚构模板今天的小纸船${emoji}虚构模板明天的小风车`;
  it('revisits earlier replies when a second account appears and clears stale evidence', () => {
    const first = article('201', text('🌿'), 'sample_one');
    const app = controller();
    app.scan();
    expect(app.getStats().marked).toBe(0);
    const second = article('202', text('🧩'), 'sample_two');
    app.scan();
    expect(app.getStats()).toMatchObject({ marked: 0, folded: 2 });
    expect(first.hasAttribute('data-tuiclean-folded')).toBe(true);
    expect(second.hasAttribute('data-tuiclean-folded')).toBe(true);
    expect(first.querySelector('[data-tuiclean-host]')?.shadowRoot?.textContent).toContain(
      '模板刷屏',
    );
    second.remove();
    app.scan();
    expect(app.getStats().marked).toBe(0);
    expect(first.querySelector('[data-tuiclean-host]')).toBeNull();
    expect(first.hasAttribute('data-tuiclean-folded')).toBe(false);
  });
  it('does not compare unrelated timeline posts or use the root post as a reply', () => {
    article('100', text('🌿'), 'sample_op');
    article('201', text('🧩'), 'sample_one');
    const app = controller();
    app.scan();
    expect(app.getStats().marked).toBe(0);
    article('202', text('🎈'), 'sample_two');
    const feed = controller(() => 'https://x.com/home');
    feed.scan();
    expect(feed.getStats().marked).toBe(0);
  });
  it('honors explicit whitelists when assembling cross-account evidence', () => {
    article('201', text('🌿'), 'sample_one');
    article('202', text('🧩'), 'sample_two');
    const app = controller();
    app.updateSettings({ ...defaultSettings, whitelist: ['sample_one'] });
    expect(app.getStats().marked).toBe(0);
  });
  it('preserves mark-only as an explicit opt-out from default collapsing', () => {
    const first = article('201', text('🌿'), 'sample_one');
    article('202', text('🧩'), 'sample_two');
    const app = controller();
    app.updateSettings({ ...defaultSettings, mode: 'mark' });
    expect(app.getStats()).toMatchObject({ marked: 2, folded: 0 });
    expect(first.hasAttribute('data-tuiclean-folded')).toBe(false);
  });
});
