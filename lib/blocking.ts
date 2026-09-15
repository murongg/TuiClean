import type { Post } from './detector';
import { normalizeUsername } from './accounts';
import { readPost } from './page';

const pending = new WeakSet<Document>();

function waitFor<T>(doc: Document, signal: AbortSignal, read: () => T | null): Promise<T> {
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(check);
    const timer = setTimeout(() => finish(new Error('X 菜单响应超时，请关闭菜单后重试。')), 5000);
    const abort = () => finish(new Error('页面已变化，拉黑操作已取消。'));
    function finish(error?: Error, value?: T) {
      observer.disconnect();
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(value!);
    }
    function check() {
      try {
        if (signal.aborted) {
          abort();
          return;
        }
        const value = read();
        if (value) finish(undefined, value);
      } catch (error) {
        finish(error as Error);
      }
    }
    signal.addEventListener('abort', abort, { once: true });
    observer.observe(doc.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    check();
  });
}

/** Only called by an explicit X-block button. Rule matches never invoke this. */
export async function blockOnX(article: Element, post: Post, signal: AbortSignal): Promise<void> {
  const doc = article.ownerDocument;
  const startUrl = doc.URL;
  const author = normalizeUsername(post.author);
  if (pending.has(doc)) throw new Error('另一项 X 拉黑操作正在进行，请稍后重试。');
  function assertTarget() {
    const current = readPost(article);
    if (
      signal.aborted ||
      doc.URL !== startUrl ||
      !article.isConnected ||
      current?.id !== post.id ||
      current.author.toLowerCase() !== author
    )
      throw new Error('页面或目标账号已变化，请重新找到该内容后操作。');
  }
  function assertHandle(element: Element) {
    const handles = element.textContent?.toLowerCase().match(/@[a-z0-9_]+/g) ?? [];
    if (!handles.length || handles.some((handle) => handle !== '@' + author))
      throw new Error('X 菜单中的账号与目标不一致，已停止操作。');
  }
  assertTarget();
  if (doc.querySelector('[role="menu"], [role="menuitem"], [role="dialog"], [role="alertdialog"]'))
    throw new Error('请先关闭 X 上已打开的菜单或弹窗，再重试。');
  const menu = Array.from(article.querySelectorAll<HTMLElement>('[data-testid="caret"]')).find(
    (element) =>
      element.closest('article') === article && !element.closest('[data-testid="quoteTweet"]'),
  );
  if (!menu) throw new Error('未找到这条内容的 X 菜单，请刷新页面后重试。');
  pending.add(doc);
  try {
    menu.click();
    const block = await waitFor(doc, signal, () => {
      assertTarget();
      const element = doc.querySelector<HTMLElement>('[role="menuitem"][data-testid="block"]');
      if (element) assertHandle(element);
      return element;
    });
    assertTarget();
    if (!block.isConnected) throw new Error('X 菜单已关闭，请重试。');
    assertHandle(block);
    block.click();
    const confirm = await waitFor(doc, signal, () => {
      assertTarget();
      const dialogs = doc.querySelectorAll('[role="dialog"], [role="alertdialog"]');
      for (const dialog of dialogs) {
        const button = dialog.querySelector<HTMLButtonElement>(
          '[data-testid="confirmationSheetConfirm"]',
        );
        if (!button) continue;
        assertHandle(dialog);
        if (!/^(block|屏蔽|封锁|封鎖|拉黑)$/iu.test(button.textContent?.trim() ?? ''))
          throw new Error('X 确认按钮已变化，已停止操作，请使用 X 原生菜单。');
        return button.disabled ? null : button;
      }
      return null;
    });
    assertTarget();
    const dialog = confirm.closest('[role="dialog"], [role="alertdialog"]');
    if (!confirm.isConnected || !dialog || confirm.disabled)
      throw new Error('X 确认界面已变化，已停止操作。');
    assertHandle(dialog);
    // X owns the request and any error feedback. Clicking confirms submission,
    // not server success; the UI must never label this as "successfully blocked".
    confirm.click();
  } finally {
    pending.delete(doc);
  }
}
