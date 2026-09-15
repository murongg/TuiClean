import { afterEach, describe, expect, it, vi } from 'vitest';
import { present, noticeInPlace } from '../lib/presentation';
import { createController } from '../lib/controller';
import { defaultSettings } from '../lib/settings';
import type { Decision, Post } from '../lib/detector';

const post: Post = { id: '301', author: 'sample_user', name: '虚构用户', text: 'NSFW', links: [] };
const decision: Decision = {
  level: 'suspect',
  category: 'spam',
  rules: ['spam-template'],
  reasons: ['虚构的跨账号重复判断依据。'],
};

function fixture() {
  const article = document.createElement('article');
  article.dataset.testid = 'tweet';
  article.style.display = 'flex';
  article.style.flexDirection = 'row';
  article.innerHTML =
    '<div class="original"><div class="row"><div class="avatar"></div><div class="body"><div data-testid="User-Name"><span>虚构用户</span><a href="https://x.com/sample_user/status/301"><time>虚构时间</time></a></div><div class="text-wrap"><div data-testid="tweetText">NSFW</div></div><div role="group"><button>原始操作</button></div></div></div></div>';
  document.body.append(article);
  return article;
}
afterEach(() => {
  document.body.innerHTML = '';
});

describe('compact inline notice', () => {
  it('keeps failed local blocks retryable and makes the error visible', async () => {
    const setBlocked = vi.fn().mockRejectedValue(new Error('测试写入失败'));
    const host = present(fixture(), post, decision, true, {
      reveal: vi.fn(),
      dismiss: vi.fn(),
      allow: vi.fn(),
      fold: vi.fn(),
      setBlocked,
    });
    const block = host.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="block"]')!;
    block.click();
    expect(block.disabled).toBe(true);
    await vi.waitFor(() => expect(block.disabled).toBe(false));
    expect(host.shadowRoot!.querySelector('[role="alert"]')?.textContent).toContain('失败');
    expect(host.shadowRoot!.querySelector<HTMLElement>('[data-details]')!.hidden).toBe(false);
  });
  it('only invokes the native X action from its separate explicit button', async () => {
    const blockX = vi.fn().mockResolvedValue(undefined);
    const setBlocked = vi.fn().mockResolvedValue(undefined);
    const host = present(fixture(), post, decision, true, {
      reveal: vi.fn(),
      dismiss: vi.fn(),
      allow: vi.fn(),
      fold: vi.fn(),
      setBlocked,
      blockX,
    });
    expect(blockX).not.toHaveBeenCalled();
    host.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="block-x"]')!.click();
    await vi.waitFor(() => expect(blockX).toHaveBeenCalledOnce());
    expect(setBlocked).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(host.shadowRoot!.querySelector('[role="status"]')?.textContent).toContain('已提交'),
    );
  });
  it('inserts below the actual text, never as a competing outer flex column', () => {
    const article = fixture();
    const text = article.querySelector('[data-testid="tweetText"]')!;
    const host = present(article, post, decision, false, {
      reveal: vi.fn(),
      dismiss: vi.fn(),
      allow: vi.fn(),
      fold: vi.fn(),
    });
    expect(host.parentElement).toBe(text.parentElement);
    expect(host.previousElementSibling).toBe(text);
    expect(noticeInPlace(article, host, false)).toBe(true);
    expect(article.children.length).toBe(1);
  });
  it('shows details only on demand, with an accessible disclosure state', () => {
    const host = present(fixture(), post, decision, false, {
      reveal: vi.fn(),
      dismiss: vi.fn(),
      allow: vi.fn(),
      fold: vi.fn(),
    });
    const toggle = host.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="details"]')!;
    const panel = host.shadowRoot!.querySelector<HTMLElement>('[data-details]')!;
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    expect(panel.hidden).toBe(true);
  });
  it('keeps the restore control outside the hidden original content when folded', () => {
    const article = fixture();
    const reveal = vi.fn();
    const host = present(article, post, decision, true, {
      reveal,
      dismiss: vi.fn(),
      allow: vi.fn(),
      fold: vi.fn(),
    });
    expect(host.parentElement).toBe(article);
    expect(article.hasAttribute('data-tuiclean-folded')).toBe(true);
    host.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="reveal"]')!.click();
    expect(reveal).toHaveBeenCalledOnce();
  });
  it('keeps the open details panel stable across rescans and supports manual folding', () => {
    const article = fixture();
    const controller = createController({
      document,
      getUrl: () => 'https://x.com/sample_op/status/100',
      settings: { ...defaultSettings, mode: 'mark' },
      onWhitelist: vi.fn(),
    });
    controller.scan();
    const host = article.querySelector<HTMLElement>('[data-tuiclean-host]')!;
    host.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="details"]')!.click();
    controller.scan();
    expect(article.querySelector('[data-tuiclean-host]')).toBe(host);
    expect(host.shadowRoot!.querySelector<HTMLElement>('[data-details]')!.hidden).toBe(false);
    host.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="fold"]')!.click();
    expect(article.hasAttribute('data-tuiclean-folded')).toBe(true);
    article
      .querySelector('[data-tuiclean-host]')!
      .shadowRoot!.querySelector<HTMLButtonElement>('[data-action="reveal"]')!
      .click();
    expect(article.hasAttribute('data-tuiclean-folded')).toBe(false);
    controller.stop();
  });
  it('moves the notice when the website replaces its text wrapper', () => {
    const article = fixture();
    const host = present(article, post, decision, false, {
      reveal: vi.fn(),
      dismiss: vi.fn(),
      allow: vi.fn(),
      fold: vi.fn(),
    });
    const text = article.querySelector('[data-testid="tweetText"]')!;
    article.querySelector('.body')!.append(text);
    expect(noticeInPlace(article, host, false)).toBe(false);
  });
  it('keeps the toolbar through repeated expand and collapse cycles', () => {
    const article = fixture();
    const controller = createController({
      document,
      getUrl: () => 'https://x.com/sample_op/status/100',
      settings: defaultSettings,
      onWhitelist: vi.fn(),
    });
    try {
      controller.scan();
      expect(article.hasAttribute('data-tuiclean-folded')).toBe(true);
      for (let round = 0; round < 3; round++) {
        article
          .querySelector('[data-tuiclean-host]')!
          .shadowRoot!.querySelector<HTMLButtonElement>('[data-action="reveal"]')!
          .click();
        controller.scan();
        expect(article.hasAttribute('data-tuiclean-folded')).toBe(false);
        const expanded = article.querySelector<HTMLElement>('[data-tuiclean-host]');
        expect(expanded).not.toBeNull();
        expect(noticeInPlace(article, expanded!, false)).toBe(true);
        expect(controller.getStats()).toMatchObject({ folded: 0, marked: 1 });
        expanded!.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="fold"]')!.click();
        controller.scan();
        expect(article.hasAttribute('data-tuiclean-folded')).toBe(true);
        expect(controller.getStats()).toMatchObject({ folded: 1, marked: 0 });
      }
    } finally {
      controller.stop();
    }
  });
  it('only explicit dismissal removes the toolbar and stays dismissed on rescans', () => {
    const article = fixture();
    const controller = createController({
      document,
      getUrl: () => 'https://x.com/sample_op/status/100',
      settings: defaultSettings,
      onWhitelist: vi.fn(),
    });
    try {
      controller.scan();
      article
        .querySelector('[data-tuiclean-host]')!
        .shadowRoot!.querySelector<HTMLButtonElement>('[data-action="reveal"]')!
        .click();
      const host = article.querySelector<HTMLElement>('[data-tuiclean-host]');
      expect(host).not.toBeNull();
      host!.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="details"]')!.click();
      host!.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="dismiss"]')!.click();
      controller.scan();
      expect(article.querySelector('[data-tuiclean-host]')).toBeNull();
      expect(article.hasAttribute('data-tuiclean-folded')).toBe(false);
    } finally {
      controller.stop();
    }
  });
  it('separates the expand callback from explicit dismissal', () => {
    const article = fixture();
    const reveal = vi.fn();
    const dismiss = vi.fn();
    const host = present(article, post, decision, true, {
      reveal,
      dismiss,
      fold: vi.fn(),
      allow: vi.fn(),
    });
    host.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="dismiss"]')!.click();
    expect(dismiss).toHaveBeenCalledOnce();
    expect(reveal).not.toHaveBeenCalled();
  });
});
