import { describe, expect, it } from 'vitest';
import { createSample, textSegments } from '../entrypoints/demo/input';
import { inspectBatch } from '../lib/detector';
import { defaultSettings } from '../lib/settings';

describe('demo input uses local, bounded sample data', () => {
  it('preserves entered characters and creates separate default authors', () => {
    const draft = { text: '  虚构\u200b测试文本\n第二行  ', author: '', name: '' };
    const first = createSample(draft, 1000);
    const second = createSample(draft, 1001);
    expect(first.text).toBe(draft.text);
    expect(first.id).not.toBe(second.id);
    expect(first.author).not.toBe(second.author);
    expect(first.custom).toBe(true);
  });
  it('validates visible content, account names and input limits', () => {
    for (const text of ['', '  \n\u200b', 'a'.repeat(20_001)]) {
      expect(() => createSample({ text, author: '', name: '' }, 1000)).toThrow();
    }
    expect(() => createSample({ text: '虚构文本', author: 'bad/name', name: '' }, 1000)).toThrow();
    expect(
      createSample({ text: '虚构文本', author: '@Sample_User', name: '示例名称' }, 1000),
    ).toMatchObject({ author: 'sample_user', name: '示例名称' });
  });
  it('extracts HTTP links without turning HTML input into markup', () => {
    const text = '<img src=x onerror=example()> https://ads.example.test/path。';
    const sample = createSample({ text, author: '', name: '' }, 1000);
    expect(sample.links).toEqual(['https://ads.example.test/path']);
    expect(
      textSegments(text)
        .map((segment) => segment.text)
        .join(''),
    ).toBe(text);
    expect(
      inspectBatch([sample], { ...defaultSettings, domains: ['ads.example.test'] }, '100').get(
        sample,
      )?.category,
    ).toBe('custom');
  });
  it('uses the same cross-account, root and whitelist policies as the page', () => {
    const one = createSample(
      { text: '合成文本今天的小纸船🌿合成文本明天的小风车', author: '', name: '' },
      1000,
    );
    const two = createSample(
      { text: '合成文本今天的小纸船🧩合成文本明天的小风车', author: '', name: '' },
      1001,
    );
    expect(inspectBatch([one, two], defaultSettings, '100').get(one)?.rules).toContain(
      'spam-template',
    );
    expect(inspectBatch([one, two], defaultSettings, one.id).get(two)?.level).toBe('allow');
    expect(
      inspectBatch([one, two], { ...defaultSettings, whitelist: [one.author] }, '100').get(two)
        ?.level,
    ).toBe('allow');
  });
});
