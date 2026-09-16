import { describe, expect, it } from 'vitest';
import { inspect, type Post } from '../lib/detector';
import { defaultSettings } from '../lib/settings';
import { BUNDLED_RULE_PACK, validateRulePack } from '../lib/rule-pack';
import { compileRules } from '../lib/rules';
import { historyMatch, validateHistoryEntries } from '../lib/history';

const sample = (text: string): Post => ({
  id: '5601',
  author: 'sample_intent',
  name: '虚构作者',
  text,
  links: [],
});

describe('solicitation intent with synthetic positive and negative cases', () => {
  it.each([
    '示例广场附近约炮',
    '合成街区周边约炮',
    '附近可约炮',
    '附近约p',
    '约炮，示例园区附近',
    '提供最新成人资源',
    '附近约\u200b炮🍃',
    '不想在附近约炮，但提供成人资源',
    '文中提到了附近约炮。在线裸聊，私信预约。',
    '不提供成人资源，提供裸聊',
  ])('filters a supported solicitation combination: %s', (text) => {
    expect(inspect(sample(text), defaultSettings)).toMatchObject({
      level: 'block',
      rules: ['adult-solicitation'],
    });
  });

  it.each([
    '不要在示例广场附近约炮',
    '我不在附近约炮',
    '我不🍃提供成人资源',
    '有人说示例广场附近约炮',
    '这部电影提到附近约炮',
    '示例广场附近约炮是什么意思',
    '示例广场附近约炮是骗局',
    '附近约炮的软件界面改版了',
    '我在附近吃饭，文章讨论约炮',
    '我看到有人提供成人资源',
    '文中提到成人资源，项目使用说明请私信获取',
    '成人资源，项目文档请私信获取',
    '不要相信“附近约炮，私信我”这种广告',
    '附近有一家书店，文中提到了约炮',
    '附近的活动欢迎报名',
    '预约 Python 课程，地点在附近',
  ])('preserves narration, negation, warnings and unrelated context: %s', (text) => {
    expect(inspect(sample(text), defaultSettings).level).toBe('allow');
  });

  it.each([
    ['示例广场附近约炮', '约炮', '附近', '地域'],
    ['提供最新成人资源', '成人资源', '提供', '提供'],
    ['成人资源，私信获取', '成人资源', '私信获取', '联系'],
    ['NSFW 新合集已更新\n完整内容看我主页', 'nsfw', '看我主页', '相邻'],
  ])(
    'explains the actual evidence for %s and retains it in history',
    (text, subject, cue, kind) => {
      const post = sample(text);
      const decision = inspect(post, defaultSettings);
      const explanation = decision.reasons.join('；');
      expect(explanation).toContain(subject);
      expect(explanation).toContain(cue);
      expect(explanation).toContain(kind);
      expect(explanation).toContain('片段');
      const row = historyMatch(post, decision, true);
      expect(row?.reasons).toEqual(decision.reasons);
      expect(validateHistoryEntries([{ ...row, recordedAt: 1000 }])).toHaveLength(1);
    },
  );

  it('honors personal rules, category switches and whitelists', () => {
    const post = sample('示例广场附近约炮');
    expect(inspect(post, { ...defaultSettings, adult: false }).level).toBe('allow');
    expect(inspect(post, { ...defaultSettings, whitelist: ['sample_intent'] }).level).toBe('allow');
    expect(
      inspect(post, { ...defaultSettings, disabledRules: ['adult-solicitation', 'adult-hint'] })
        .level,
    ).toBe('allow');
    expect(
      inspect(sample('不要在附近约炮'), { ...defaultSettings, keywords: ['约炮'] }).rules,
    ).toEqual(['custom-keyword']);
  });

  it('takes literal location cues from the rule pack', () => {
    const pack = structuredClone(BUNDLED_RULE_PACK);
    pack.terms.serviceLocations = ['合成[近处]+'];
    const post = sample('示例街区合成[近处]+约炮');
    expect(inspect(post, defaultSettings).level).toBe('allow');
    const rules = compileRules(validateRulePack(pack));
    expect(inspect(post, defaultSettings, {}, rules).rules).toEqual(['adult-solicitation']);
    expect(inspect(sample('示例街区合成近处约炮'), defaultSettings, {}, rules).level).toBe('allow');
  });
});
