import { describe, expect, it } from 'vitest';
import { inspect, inspectBatch, normalizeText } from '../lib/detector';
import { defaultSettings } from '../lib/settings';

const post = (text: string, author = 'sample_account', links: string[] = []) => ({
  id: '101',
  text,
  author,
  name: '示例账号',
  links,
});

describe('local detection with synthetic content', () => {
  it.each([
    '虚构样本：不进入你的生活，只进入你的身体。',
    '不介入生活🌿只进入身体',
    '不走进你的生活，只想走进你的身体',
    '不進入你的生活，只進入你的身體',
  ])('recognizes complete relationship/body bait without a peer or a suspicious name', (text) => {
    expect(inspect(post(text), defaultSettings)).toMatchObject({
      level: 'suspect',
      category: 'adult',
      rules: ['adult-bait'],
    });
  });
  it('independently detects decorated short bait even when only its peer is locally blocked', () => {
    const first = post('不介入生活🌿只进入身体', 'sample_one');
    const second = { ...post('不介入生活🧩只进入身体', 'sample_two'), id: '102' };
    const decisions = inspectBatch(
      [first, second],
      { ...defaultSettings, blockedUsers: ['sample_one'] },
      '100',
    );
    expect(decisions.get(first)?.rules).toEqual(['blocked-user']);
    expect(decisions.get(second)?.rules).toEqual(['adult-bait']);
    expect(inspect(second, defaultSettings).rules).toEqual(['adult-bait']);
    expect(
      inspect({ ...second, text: [...second.text].join('\u200b') }, defaultSettings).rules,
    ).toEqual(['adult-bait']);
  });
  it.each([
    '不介入别人的生活，只关注自己的身体健康。',
    '不介入生活，也不进入身体。',
    '只进入身体。',
    '不介入生活。',
    '相同的简短感谢。',
    '科普：识别“不介入生活，只进入身体”这类引流话术。',
  ])('keeps ordinary, incomplete and educational short phrases visible', (text) => {
    expect(inspect(post(text), defaultSettings).level).toBe('allow');
  });
  it('keeps category, rule and whitelist controls for relationship/body bait', () => {
    const input = post('不介入生活，只进入身体');
    expect(inspect(input, { ...defaultSettings, adult: false }).level).toBe('allow');
    expect(inspect(input, { ...defaultSettings, disabledRules: ['adult-bait'] }).level).toBe(
      'allow',
    );
    expect(inspect(input, { ...defaultSettings, whitelist: ['sample_account'] }).level).toBe(
      'allow',
    );
  });
  it('leaves ordinary project sharing alone', () => {
    expect(
      inspect(
        post('我做了一个开源笔记项目，欢迎试用和反馈。', 'sample_dev', [
          'https://example.test/project',
        ]),
        defaultSettings,
      ).level,
    ).toBe('allow');
  });
  it('requires solicitation evidence for adult text', () => {
    expect(inspect(post('成人资源，私信获取完整链接'), defaultSettings)).toMatchObject({
      level: 'block',
      category: 'adult',
    });
    expect(inspect(post('NSFW'), defaultSettings).level).not.toBe('block');
  });
  it('recognizes spaces, zero-width characters and full-width text', () => {
    expect(normalizeText(' ＮＳＦＷ\u200b ')).toBe('nsfw');
    expect(inspect(post('裸 聊，私\u200b信获取链接'), defaultSettings).level).toBe('block');
  });
  it('does not use a contact phrase alone as evidence', () => {
    expect(inspect(post('项目部署方法在主页，欢迎私信交流。'), defaultSettings).level).toBe(
      'allow',
    );
  });
  it('does not infer adult content from a topic label in the name and an ordinary link', () => {
    const input = {
      ...post('新项目，主页链接可以查看。', 'sample_author', ['https://example.test/project']),
      name: 'Sample NSFW Notes',
    };
    expect(inspect(input, defaultSettings).level).toBe('allow');
  });
  it.each([
    '虚构 NSFW 画室',
    '虚构 ＮＳＦＷ 画室',
    '虚构 N\u200bSFW 画室',
    'Sample OnlyFans Lab',
    'Sample Porn Notes',
    'Sample Nudes Notes',
  ])('does not classify an ordinary reply from an adult topic label in the name: %s', (name) => {
    expect(inspect({ ...post('这个演示有公开版本吗？'), name }, defaultSettings)).toEqual({
      level: 'allow',
      rules: [],
      reasons: [],
    });
  });
  it('keeps explicit adult offers in display names eligible for filtering', () => {
    for (const name of ['虚构作者 · 成人资源', '虚构作者 · 裸聊', '虚构作者 · 无码资源']) {
      expect(inspect({ ...post('合成留言'), name }, defaultSettings)).toMatchObject({
        level: 'suspect',
        rules: ['adult-hint'],
      });
    }
  });
  it('keeps body evidence and other independent rules when the name contains a topic label', () => {
    const name = 'Sample NSFW Notes';
    expect(inspect({ ...post('NSFW'), name }, defaultSettings)).toMatchObject({
      level: 'suspect',
      rules: ['adult-hint'],
    });
    expect(inspect({ ...post('成人资源，私信获取链接'), name }, defaultSettings)).toMatchObject({
      level: 'block',
      rules: ['adult-solicitation'],
    });
    expect(inspect({ ...post('刷单返佣，私信领取任务'), name }, defaultSettings).rules).toEqual([
      'spam-solicitation',
    ]);
    expect(
      inspect({ ...post('合成普通留言'), name }, defaultSettings, { templateAuthors: 2 }).rules,
    ).toEqual(['spam-template']);
    const input = { ...post('合成普通留言'), name };
    expect(inspect(input, { ...defaultSettings, keywords: ['nsfw'] }).rules).toEqual([
      'custom-keyword',
    ]);
    expect(
      inspect(input, { ...defaultSettings, keywords: ['nsfw'], whitelist: ['sample_account'] })
        .level,
    ).toBe('allow');
  });
  it('protects educational and warning contexts', () => {
    expect(
      inspect(post('科普：遇到“裸聊，私信获取链接”的广告应及时举报。'), defaultSettings).level,
    ).not.toBe('block');
    expect(
      inspect(post('正在开发色情内容过滤插件，欢迎讨论识别规则。'), defaultSettings).level,
    ).toBe('allow');
    expect(inspect(post('警惕“刷单返佣，私信领取任务”的骗局。'), defaultSettings).level).not.toBe(
      'block',
    );
  });
  it('detects spam offers combined with a call to action', () => {
    expect(inspect(post('刷单返佣，私信领取任务，每日结算。'), defaultSettings)).toMatchObject({
      level: 'block',
      category: 'spam',
    });
    expect(inspect(post('今天研究了收益率与投资风险。'), defaultSettings).level).toBe('allow');
  });
  it('allows independent category switches', () => {
    expect(
      inspect(post('成人资源，私信获取完整链接'), { ...defaultSettings, adult: false }).level,
    ).toBe('allow');
    expect(
      inspect(post('刷单返佣，私信领取任务。'), { ...defaultSettings, spam: false }).level,
    ).toBe('allow');
  });
  it('always honors explicit whitelists and the global switch', () => {
    const input = post('成人资源，私信获取完整链接', 'Sample_Account');
    expect(inspect(input, { ...defaultSettings, whitelist: ['sample_account'] }).level).toBe(
      'allow',
    );
    expect(inspect(input, { ...defaultSettings, enabled: false }).level).toBe('allow');
  });
  it('treats custom keywords as literals rather than regular expressions', () => {
    expect(
      inspect(post('测试字面内容 [sample]'), { ...defaultSettings, keywords: ['[sample]'] })
        .category,
    ).toBe('custom');
    expect(
      inspect(post('普通内容 sample'), { ...defaultSettings, keywords: ['[sample]'] }).level,
    ).toBe('allow');
  });
  it('matches a configured literal following an emoji in either body or display name', () => {
    const settings = { ...defaultSettings, keywords: ['青杉词'] };
    for (const input of [
      post('虚构测试作者🍑青杉词'),
      { ...post('1'), name: '虚构测试作者🍑青杉词' },
    ]) {
      expect(inspect(input, settings)).toMatchObject({
        level: 'block',
        rules: ['custom-keyword'],
        reasons: ['命中你的关键词：青杉词'],
      });
    }
  });
  it('matches domains at hostname boundaries only', () => {
    const settings = { ...defaultSettings, domains: ['ads.example.test'] };
    expect(
      inspect(post('链接', 'sample_user', ['https://sub.ads.example.test/a']), settings).level,
    ).toBe('block');
    expect(
      inspect(post('链接', 'sample_user', ['https://ads.example.test.evil.test']), settings).level,
    ).toBe('allow');
    expect(inspect(post('链接', 'sample_user', ['not a url']), settings).level).toBe('allow');
  });
  it('supports disabling one built-in rule', () => {
    expect(
      inspect(post('成人资源，私信获取完整链接'), {
        ...defaultSettings,
        disabledRules: ['adult-solicitation'],
      }).level,
    ).not.toBe('block');
  });
  it('provides rule ids and human-readable reasons', () => {
    const result = inspect(post('刷单返佣，私信领取任务。'), defaultSettings);
    expect(result.rules).toContain('spam-solicitation');
    expect(result.reasons.join('')).toContain('招揽');
  });
  it('recognizes a complete comparison-bait family in a single synthetic post', () => {
    const sample = '比我俊的没有我浪，比我浪的没有我俊';
    expect(inspect(post(sample), defaultSettings)).toMatchObject({
      level: 'suspect',
      category: 'adult',
      rules: ['adult-bait'],
    });
    expect(inspect(post('比我浪的没有我俊，比我俊的没有我浪'), defaultSettings).rules).toContain(
      'adult-bait',
    );
  });
  it('recognizes obfuscated comparison bait without needing a second account', () => {
    const sample = '比我俊的没有我浪🌿🧩比我浪的没有我俊';
    const hidden = [...sample].join('\u200d\u2060\u200c');
    expect(inspect(post(hidden), defaultSettings).rules).toContain('adult-bait');
  });
  it('does not match a single suggestive word or a non-sexual comparison', () => {
    for (const sample of [
      '这段代码写得有点骚。',
      '比我细心的没有我勤快，比我勤快的没有我细心',
      '海浪很大，今天适合在家阅读。',
    ]) {
      expect(inspect(post(sample), defaultSettings).level).toBe('allow');
    }
    expect(
      inspect(
        post('科普：如何识别“比我俊的没有我浪，比我浪的没有我俊”这样的文案。'),
        defaultSettings,
      ).level,
    ).toBe('allow');
  });
  it('keeps category, per-rule and whitelist control over comparison bait', () => {
    const input = post('比我俊的没有我浪，比我浪的没有我俊');
    expect(inspect(input, { ...defaultSettings, adult: false }).level).toBe('allow');
    expect(inspect(input, { ...defaultSettings, disabledRules: ['adult-bait'] }).level).toBe(
      'allow',
    );
    expect(inspect(input, { ...defaultSettings, whitelist: ['sample_account'] }).level).toBe(
      'allow',
    );
  });
});
