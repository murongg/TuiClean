import { describe, expect, it } from 'vitest';
import { findTemplates, templateKey } from '../lib/templates';
import { inspect, type Post } from '../lib/detector';
import { defaultSettings } from '../lib/settings';

const sample = (id: string, author: string, emoji = '🌿'): Post => ({
  id,
  author,
  name: '虚构测试账号',
  links: [],
  text: `合成样本前半句今天顺利${emoji}合成样本后半句明天继续`,
});

describe('cross-account template evidence using synthetic text', () => {
  it('recognizes a shared text skeleton despite emoji, skin tones, flags and zero-width characters', () => {
    const a = sample('201', 'sample_one', '👩🏽‍💻🌿');
    const b = sample('202', 'sample_two', '🇨🇦🧩\u200b');
    expect(templateKey(a)).toBe(templateKey(b));
    expect(findTemplates([a, b])).toEqual(
      new Map([
        ['201', 2],
        ['202', 2],
      ]),
    );
  });
  it('counts distinct authors and unique post ids, not repeated DOM copies', () => {
    const a = sample('201', 'sample_one');
    expect(findTemplates([a, a])).toEqual(new Map());
    expect(findTemplates([a, sample('202', 'SAMPLE_ONE')])).toEqual(new Map());
  });
  it('leaves short acknowledgements, emoji-only messages, and media posts alone', () => {
    for (const text of ['谢谢分享', '🌿🧩✨', '123456789012345']) {
      expect(templateKey({ ...sample('201', 'sample_one'), text })).toBeNull();
    }
    expect(templateKey({ ...sample('201', 'sample_one'), hasMedia: true })).toBeNull();
  });
  it('preserves meaningful numbers, negation and link targets', () => {
    const a = sample('201', 'sample_one');
    expect(templateKey({ ...a, text: a.text + '版本1' })).not.toBe(
      templateKey({ ...a, text: a.text + '版本2' }),
    );
    expect(templateKey({ ...a, text: a.text + '同意' })).not.toBe(
      templateKey({ ...a, text: a.text + '不同意' }),
    );
    expect(templateKey({ ...a, links: ['https://example.test/One'] })).not.toBe(
      templateKey({ ...a, links: ['https://example.test/Two'] }),
    );
    expect(templateKey({ ...a, text: a.text + '1️⃣' })).not.toBe(
      templateKey({ ...a, text: a.text + '2️⃣' }),
    );
  });
  it('reports template evidence as suspicion without declaring pornography', () => {
    const a = sample('201', 'sample_one');
    expect(inspect(a, defaultSettings).level).toBe('allow');
    expect(inspect(a, defaultSettings, { templateAuthors: 2 })).toMatchObject({
      level: 'suspect',
      category: 'spam',
      rules: ['spam-template'],
    });
    expect(inspect(a, defaultSettings, { templateAuthors: 2 }).reasons.join('')).toContain(
      '2 个不同账号',
    );
  });
  it('honors the spam switch, rule switch, whitelist and explicit custom rules', () => {
    const a = sample('201', 'sample_one');
    const evidence = { templateAuthors: 2 };
    expect(inspect(a, { ...defaultSettings, spam: false }, evidence).level).toBe('allow');
    expect(
      inspect(a, { ...defaultSettings, disabledRules: ['spam-template'] }, evidence).level,
    ).toBe('allow');
    expect(inspect(a, { ...defaultSettings, whitelist: ['sample_one'] }, evidence).level).toBe(
      'allow',
    );
    expect(inspect(a, { ...defaultSettings, keywords: ['合成样本'] }, evidence).category).toBe(
      'custom',
    );
    expect(inspect({ ...a, text: '科普：' + a.text }, defaultSettings, evidence).level).toBe(
      'allow',
    );
  });
});
