import { describe, expect, it } from 'vitest';
import { inspect } from '../lib/detector';
import { defaultSettings } from '../lib/settings';

const sample = (text: string, name = '虚构测试作者') => ({
  id: '501',
  author: 'sample_author',
  text,
  name,
  links: [],
});
const referral = '抖音有位博主叫「虚构频道甲」，推荐去看，内容带有娇喘片段。';
const profile = '同城约ｐ · 主页私信';

describe('adult promotion signal combinations with synthetic data', () => {
  it.each([
    '虚构账号甲 · 寻固炮',
    '样本乙（寻炮友）',
    '示例丙 · 找长期炮友',
    '虚构丁 · 求固定炮友',
    '样本戊 · 尋固定炮友',
    '虚构己 · 寻🌿固\u200b炮',
  ])('recognizes explicit partner solicitation in the name without a contact link', (name) => {
    expect(inspect(sample('8', name), defaultSettings)).toMatchObject({
      level: 'suspect',
      category: 'adult',
      rules: ['adult-profile'],
    });
  });
  it.each([
    '你的学姐 · 可线下',
    '坏哥哥 · 线下报名',
    '专属学长 · 线下见面',
    '你的妹🌿妹 · 可\u200b以线下',
  ])(
    'combines an invitation-style name, offline solicitation and a numeric filler reply',
    (name) => {
      expect(inspect(sample('８', name), defaultSettings)).toMatchObject({
        level: 'suspect',
        category: 'spam',
        rules: ['spam-profile'],
      });
    },
  );
  it.each([
    ['8', '虚构亲友 · 姐姐'],
    ['8', '示例教练 · 可线下'],
    ['8', '读书会 · 线下报名'],
    ['8', '你的学姐 · 活动志愿者'],
    ['本周读书会在图书馆举行，欢迎报名。', '你的学姐 · 线下报名'],
    ['', '坏哥哥 · 可线下'],
    ['2026', '你的学姐 · 线下报名'],
    ['8', '模型社 · 寻找固定炮台'],
    ['8', '象棋社 · 寻棋友'],
    ['8', '虚构作者 · 不寻炮友'],
    ['8', '虚构作者 · 拒绝找固定炮友'],
    ['8', '科普示例 · 寻固炮'],
  ])('keeps normal roles, events and non-solicitation contexts visible', (text, name) => {
    expect(inspect(sample(text, name), defaultSettings).level).toBe('allow');
  });
  it('does not classify numeric captions with real media as filler-only profile spam', () => {
    expect(
      inspect({ ...sample('8', '你的学姐 · 可线下'), hasMedia: true }, defaultSettings).level,
    ).toBe('allow');
  });
  it('honors the relevant category, rule switches, and whitelist for the new name patterns', () => {
    const adult = sample('8', '虚构账号甲 · 寻固炮');
    const spam = sample('8', '你的学姐 · 可线下');
    expect(inspect(adult, { ...defaultSettings, adult: false }).level).toBe('allow');
    expect(inspect(adult, { ...defaultSettings, disabledRules: ['adult-profile'] }).level).toBe(
      'allow',
    );
    expect(inspect(spam, { ...defaultSettings, spam: false }).level).toBe('allow');
    expect(inspect(spam, { ...defaultSettings, disabledRules: ['spam-profile'] }).level).toBe(
      'allow',
    );
    for (const post of [adult, spam]) {
      expect(inspect(post, { ...defaultSettings, whitelist: ['sample_author'] }).level).toBe(
        'allow',
      );
      expect(inspect(post, { ...defaultSettings, enabled: false }).level).toBe('allow');
    }
  });
  it.each([
    referral,
    '快手有个博主叫「示例频道乙」，点进去看，胸部晃动的镜头，尺度很大。',
    '小红书账号「虚构频道丙」有偷情题材，尺度很大，点进去看。',
    'B站主播「测试频道丁」推荐片段，里面有奶沟镜头。',
  ])('recognizes a named off-platform destination with sexualized content', (text) => {
    expect(inspect(sample(text), defaultSettings)).toMatchObject({
      category: 'adult',
      rules: ['adult-referral'],
    });
  });
  it('recognizes obfuscated promotion and profile offers', () => {
    const hidden = [...referral].join('\u200b\u2060');
    expect(inspect(sample(hidden), defaultSettings).rules).toContain('adult-referral');
    expect(
      inspect(sample('一条虚构的普通留言。', '同🌿城 约Ｐ · 主\u200b页联 系'), defaultSettings)
        .rules,
    ).toContain('adult-profile');
  });
  it.each([profile, '免费过夜 · 同城匹配 · 主页联系', '免费陪睡 · 私信预约'])(
    'recognizes explicit solicitation plus contact in a display name',
    (name) => {
      expect(inspect(sample('一条虚构的普通留言。', name), defaultSettings)).toMatchObject({
        category: 'adult',
        rules: ['adult-profile'],
      });
    },
  );
  it.each([
    '抖音博主「示例教练」讲动感单车，心率升到150，胸口随呼吸起伏，运动衣被汗水打湿。',
    '快手有个博主叫「虚构教程」，推荐他的智能手表和骑行训练视频。',
    '小红书账号「示例妈妈」分享乳腺健康和哺乳护理。',
    '有人把单车训练误会成出轨，实际上只是日常运动。',
    '朋友讨论电影的尺度和偷情题材，没有推荐任何站外账号。',
    'B站博主「虚构影评」分析电影剧情高潮，推荐看看。',
    '小红书美食博主「虚构厨师」演示烹饪，下面锅里的水溢出来了。',
  ])('preserves ordinary fitness and discussion without the required combination', (text) => {
    expect(inspect(sample(text), defaultSettings).level).toBe('allow');
  });
  it.each([
    '同城骑行 · 主页联系',
    '旅行民宿 · 免费过夜 · 主页预订',
    '预约 Python 课程 · 主页联系',
    '同城交友 · 实时匹配 · 主页联系',
  ])('does not infer adult solicitation from contact or dating alone', (name) => {
    expect(inspect(sample('一条虚构的普通留言。', name), defaultSettings).level).toBe('allow');
  });
  it('applies contextual protection to the same evidence field', () => {
    expect(inspect(sample('科普：' + referral), defaultSettings).level).toBe('allow');
    expect(inspect(sample('科普：一段正常技术交流。', profile), defaultSettings).rules).toContain(
      'adult-profile',
    );
    expect(
      inspect(sample('普通留言。', '反诈科普 · 同城约p · 主页联系'), defaultSettings).level,
    ).toBe('allow');
  });
  it('honors category, individual rule and whitelist controls', () => {
    expect(inspect(sample(referral), { ...defaultSettings, adult: false }).level).toBe('allow');
    expect(
      inspect(sample(referral), { ...defaultSettings, disabledRules: ['adult-referral'] }).level,
    ).toBe('allow');
    expect(
      inspect(sample('普通留言。', profile), {
        ...defaultSettings,
        disabledRules: ['adult-profile'],
      }).level,
    ).toBe('allow');
    expect(
      inspect(sample(referral, profile), { ...defaultSettings, whitelist: ['sample_author'] })
        .level,
    ).toBe('allow');
  });
});
