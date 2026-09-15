import { afterEach, describe, expect, it, vi } from 'vitest';
import { blockOnX } from '../lib/blocking';
import { readPost } from '../lib/page';

function fixture(menuAuthor = 'sample_ad', dialogAuthor = menuAuthor) {
  document.body.innerHTML =
    '<article data-testid="tweet"><div><a href="/sample_ad/status/701"><time>测试时间</time></a><div data-testid="tweetText">虚构测试内容。</div><button data-testid="caret">More</button></div></article>';
  const article = document.querySelector('article')!;
  const submit = vi.fn();
  const menuClick = vi.fn(() => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `<div role="menuitem" data-testid="block">Block @${menuAuthor}</div>`;
    menu.firstElementChild!.addEventListener('click', () => {
      menu.remove();
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.innerHTML = `<h2>Block @${dialogAuthor}?</h2><button data-testid="confirmationSheetConfirm">Block</button><button data-testid="confirmationSheetCancel">Cancel</button>`;
      dialog
        .querySelector('[data-testid="confirmationSheetConfirm"]')!
        .addEventListener('click', submit);
      document.body.append(dialog);
    });
    document.body.append(menu);
  });
  article.querySelector('button')!.addEventListener('click', menuClick);
  return { article, post: readPost(article)!, submit, menuClick };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});
describe('explicit native X block action using a synthetic page', () => {
  it('submits through the matched account menu and confirmation', async () => {
    const { article, post, submit, menuClick } = fixture();
    await blockOnX(article, post, new AbortController().signal);
    expect(menuClick).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
  });
  it.each([
    ['sample_other', 'sample_other'],
    ['sample_ad', 'sample_other'],
  ])('refuses a mismatched menu or confirmation', async (menu, dialog) => {
    const { article, post, submit } = fixture(menu, dialog);
    await expect(blockOnX(article, post, new AbortController().signal)).rejects.toThrow(/账号/);
    expect(submit).not.toHaveBeenCalled();
  });
  it('refuses an existing native dialog or another open menu', async () => {
    const { article, post, submit, menuClick } = fixture();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    await expect(blockOnX(article, post, new AbortController().signal)).rejects.toThrow();
    expect(menuClick).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  it('rechecks the dialog target immediately before submitting', async () => {
    const { article, post, submit } = fixture();
    const action = blockOnX(article, post, new AbortController().signal);
    const rejected = expect(action).rejects.toThrow(/账号/);
    queueMicrotask(() => {
      const heading = document.querySelector('[role="dialog"] h2');
      if (heading) heading.textContent = 'Block @sample_other?';
    });
    await rejected;
    expect(submit).not.toHaveBeenCalled();
  });
  it('refuses a recycled article and an aborted page action', async () => {
    const { article, post, submit } = fixture();
    article.querySelector('a')!.setAttribute('href', '/sample_other/status/702');
    await expect(blockOnX(article, post, new AbortController().signal)).rejects.toThrow();
    const abort = new AbortController();
    abort.abort();
    await expect(blockOnX(article, post, abort.signal)).rejects.toThrow();
    expect(submit).not.toHaveBeenCalled();
  });
  it('stops if the URL changes while the original article remains mounted', async () => {
    const { article, post, menuClick, submit } = fixture();
    article.querySelector('button')!.removeEventListener('click', menuClick);
    const action = blockOnX(article, post, new AbortController().signal);
    const rejected = expect(action).rejects.toThrow(/变化/);
    history.pushState({}, '', '/other-test-page');
    menuClick();
    await rejected;
    expect(submit).not.toHaveBeenCalled();
    history.replaceState({}, '', '/');
  });
  it('stops on timeout and releases the page for later attempts', async () => {
    vi.useFakeTimers();
    const { article, post, menuClick } = fixture();
    article.querySelector('button')!.removeEventListener('click', menuClick);
    const action = blockOnX(article, post, new AbortController().signal);
    const rejected = expect(action).rejects.toThrow(/超时/);
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    article.querySelector('button')!.addEventListener('click', menuClick);
    await blockOnX(article, post, new AbortController().signal);
  });
  it('rejects overlapping operations and cancels a pending menu wait', async () => {
    const { article, post, menuClick } = fixture();
    article.querySelector('button')!.removeEventListener('click', menuClick);
    const abort = new AbortController();
    const first = blockOnX(article, post, abort.signal);
    const rejected = expect(first).rejects.toThrow();
    await expect(blockOnX(article, post, abort.signal)).rejects.toThrow(/进行/);
    abort.abort();
    await rejected;
  });
});
