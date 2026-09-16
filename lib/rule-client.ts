import { browser } from 'wxt/browser';
import { RULES_KEY, readRuleState, type RuleSource } from './rule-updates';
import { validateRulePack } from './rule-pack';

async function request(action: 'update' | 'restore') {
  let reply;
  try {
    reply = await browser.runtime.sendMessage({ type: 'tuiclean:rules', action });
  } catch {
    throw new Error('无法连接扩展后台，请重新加载扩展后重试。');
  }
  if (!reply?.ok) throw new Error(reply?.error || '无法更新规则，请重新加载扩展后重试。');
  if (!reply.state?.pack) throw new Error('规则更新返回结果不完整，请重新加载扩展。');
  validateRulePack(reply.state.pack);
  return readRuleState(reply.state);
}
export const ruleClient: RuleSource = {
  async get() {
    return readRuleState((await browser.storage.local.get(RULES_KEY))[RULES_KEY]);
  },
  update: () => request('update'),
  restore: () => request('restore'),
  subscribe(listener) {
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && Object.hasOwn(changes, RULES_KEY)) listener();
    };
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  },
};
