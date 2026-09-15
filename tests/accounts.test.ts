import { describe, expect, it } from 'vitest';
import { inspect } from '../lib/detector';
import { defaultSettings, validateSettings, encodeBackup, decodeBackup } from '../lib/settings';

const post = (author = 'sample_ad', name = '虚构作者', text = '科普：一段普通测试内容。') => ({
  id: '701',
  author,
  name,
  text,
  links: [],
});

describe('local account rules with synthetic handles', () => {
  it('loads existing settings and backups without account lists', () => {
    expect(validateSettings({ enabled: true })).toMatchObject({
      blockedUsers: [],
      usernameRules: [],
    });
    expect(decodeBackup('{"app":"tuiclean","version":1,"settings":{"adult":false}}')).toMatchObject(
      { adult: false, blockedUsers: [], usernameRules: [] },
    );
  });
  it('normalizes and round-trips exact handles and wildcard rules', () => {
    const settings = validateSettings({
      blockedUsers: ['@Sample_Ad', 'sample_ad'],
      usernameRules: ['@DEMO_**', 'demo_*', '*test*'],
    });
    expect(settings).toMatchObject({
      blockedUsers: ['sample_ad'],
      usernameRules: ['demo_*', '*test*'],
    });
    expect(decodeBackup(encodeBackup(settings))).toEqual(settings);
  });
  it.each(['*', '**', '/demo/i', 'sample?', 'a.b', 'https://x.com/a', '名字', 'a'.repeat(16)])(
    'rejects invalid or all-account rules: %s',
    (rule) => {
      expect(() => validateSettings({ usernameRules: [rule] })).toThrow();
    },
  );
  it('only accepts complete handles in the exact blacklist', () => {
    expect(() => validateSettings({ blockedUsers: ['demo_*'] })).toThrow();
  });
  it.each([
    ['sample_ad', 'sample_ad', true],
    ['sample_ad', 'sample', false],
    ['SAMPLE_AD', 'sample_*', true],
    ['sample_ad', '*_ad', true],
    ['sample_ad', '*ample*', true],
    ['sample_ad', 's*e*a*d', true],
    ['sample_ad', 'ad*sample', false],
    ['sample_ad', 's*d*d', false],
    ['sample_ad', 'sample_ad*', true],
  ])('matches the entire handle %s against %s', (author, rule, matches) => {
    const result = inspect(post(author), { ...defaultSettings, usernameRules: [rule] });
    expect(result.rules.includes('custom-username')).toBe(matches);
  });
  it('does not apply username patterns to display names or mentions in the text', () => {
    expect(
      inspect(post('sample_safe', 'sample_ad', '@sample_ad 普通引用'), {
        ...defaultSettings,
        usernameRules: ['sample_ad'],
      }).level,
    ).toBe('allow');
  });
  it('honors explicit account rules even with category switches off or educational context', () => {
    expect(
      inspect(post(), {
        ...defaultSettings,
        adult: false,
        spam: false,
        blockedUsers: ['sample_ad'],
      }),
    ).toMatchObject({ level: 'block', category: 'custom', rules: ['blocked-user'] });
  });
  it('keeps the master switch and whitelist authoritative', () => {
    const settings = {
      ...defaultSettings,
      blockedUsers: ['sample_ad'],
      usernameRules: ['sample_*'],
    };
    expect(inspect(post(), { ...settings, enabled: false }).level).toBe('allow');
    expect(inspect(post(), { ...settings, whitelist: ['sample_ad'] }).level).toBe('allow');
  });
});
