import type { Decision, Post } from './detector';
import { findPostText } from './page';
import noticeStyle from './notice.css?inline';

export const pageStyle =
  'article[data-tuiclean-folded] > :not([data-tuiclean-host]) { display: none !important; }';

function noticePosition(article: Element, folded: boolean): { parent: Element; after?: Element } {
  if (folded) return { parent: article };
  const text = findPostText(article)[0];
  if (text?.parentElement) return { parent: text.parentElement, after: text };
  const original = Array.from(article.children).find(
    (node) => !node.hasAttribute('data-tuiclean-host'),
  );
  return { parent: original ?? article };
}

export function noticeInPlace(article: Element, host: HTMLElement, folded: boolean): boolean {
  const { parent, after } = noticePosition(article, folded);
  return host.parentElement === parent && (!after || host.previousElementSibling === after);
}

export function present(
  article: Element,
  post: Post,
  decision: Decision,
  folded: boolean,
  callbacks: {
    reveal: () => void;
    fold: () => void;
    dismiss: () => void;
    allow: () => Promise<void>;
    setBlocked?: (blocked: boolean) => Promise<void>;
    blockX?: () => Promise<void>;
  },
): HTMLElement {
  const doc = article.ownerDocument;
  const host = doc.createElement('div');
  host.dataset.tuicleanHost = '';
  host.toggleAttribute('data-folded', folded);
  // X's article is a horizontal flex row. An uncollapsed notice must live
  // inside its text column; a root-level sibling steals width from the post.
  // Folded notices stay outside the original subtree so Restore stays visible.
  const { parent, after } = noticePosition(article, folded);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = noticeStyle;
  shadow.append(style);
  const bar = doc.createElement('div');
  bar.className = 'bar';
  const label = doc.createElement('div');
  label.className = 'label';
  label.title = 'TuiClean · 本地过滤';
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M2 4h12M4 8h8M6 12h4');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  const caption = doc.createElement('span');
  const category = decision.rules.includes('spam-template')
    ? '模板刷屏'
    : decision.category === 'adult'
      ? '色情引流'
      : decision.category === 'spam'
        ? '垃圾广告'
        : '个人规则';
  const blocked = decision.rules.includes('blocked-user');
  caption.textContent = blocked
    ? `本地已拉黑 @${post.author}`
    : `${folded ? '已折叠' : '疑似'}${category}`;
  label.title = `TuiClean · @${post.author}`;
  label.append(svg, caption);
  bar.append(label);
  const panel = doc.createElement('div');
  panel.className = 'panel';
  panel.dataset.details = '';
  panel.id = 'tuiclean-details';
  panel.hidden = true;
  const reason = doc.createElement('p');
  reason.className = 'reason';
  reason.textContent = decision.reasons.join('；');
  const actions = doc.createElement('div');
  actions.className = 'actions';

  function button(container: Element, text: string, action: string, callback: () => void) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.dataset.action = action;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      callback();
    });
    container.append(button);
    return button;
  }
  const primary = button(
    bar,
    folded ? '展开' : '折叠',
    folded ? 'reveal' : 'fold',
    folded ? callbacks.reveal : callbacks.fold,
  );
  primary.className = 'primary';
  primary.setAttribute('aria-label', folded ? '展开内容' : '折叠这条内容');
  const accountActions = doc.createElement('span');
  accountActions.className = 'account-actions';
  bar.append(accountActions);
  function feedback(message: string, error = false) {
    reason.textContent = message;
    reason.setAttribute('role', error ? 'alert' : 'status');
    panel.hidden = false;
    more.setAttribute('aria-expanded', 'true');
    more.textContent = '收起';
  }
  if (callbacks.setBlocked) {
    const block = button(
      accountActions,
      blocked ? '取消拉黑' : '本地拉黑',
      blocked ? 'unblock' : 'block',
      () => {
        block.disabled = true;
        callbacks.setBlocked!(!blocked)
          .catch((error) => {
            feedback(error instanceof Error ? error.message : '本地黑名单保存失败，请重试。', true);
          })
          .finally(() => {
            block.disabled = false;
          });
      },
    );
    block.title = `${blocked ? '取消本地拉黑' : '在 TuiClean 中拉黑'} @${post.author}`;
    block.setAttribute('aria-label', block.title);
  }
  if (callbacks.blockX) {
    const native = button(accountActions, 'X 拉黑', 'block-x', () => {
      native.disabled = true;
      feedback(`正在向 X 提交拉黑 @${post.author}…`);
      callbacks.blockX!()
        .then(() => {
          feedback(`已确认在 X 中拉黑 @${post.author}。取消请使用 X 原生菜单。`);
        })
        .catch((error) => {
          feedback(error instanceof Error ? error.message : 'X 拉黑未能提交，请重试。', true);
        })
        .finally(() => {
          native.disabled = false;
        });
    });
    native.title = `在 X 中拉黑 @${post.author}，会修改你的 X 黑名单`;
    native.setAttribute('aria-label', `在 X 中拉黑 @${post.author}`);
  }
  const more = button(bar, '详情', 'details', () => {
    panel.hidden = !panel.hidden;
    more.setAttribute('aria-expanded', String(!panel.hidden));
    more.textContent = panel.hidden ? '详情' : '收起';
  });
  more.className = 'more';
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-controls', panel.id);
  more.setAttribute('aria-label', '识别详情');
  button(actions, '不再提示这条', 'dismiss', callbacks.dismiss);
  const permit = button(actions, '信任此作者', 'allow', () => {
    permit.disabled = true;
    callbacks.allow().catch(() => {
      feedback('白名单保存失败，请重试。', true);
      permit.disabled = false;
    });
  });
  permit.setAttribute('aria-label', `始终允许 @${post.author}`);
  permit.title = `将 @${post.author} 加入本地白名单`;
  const credit = doc.createElement('p');
  credit.className = 'credit';
  credit.textContent = 'TuiClean · 本地识别';
  panel.append(reason, actions, credit);
  shadow.append(bar, panel);
  host.addEventListener('click', (event) => event.stopPropagation());
  if (after) after.after(host);
  else parent.append(host);
  article.toggleAttribute('data-tuiclean-folded', folded);
  return host;
}
