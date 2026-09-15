import { describe, expect, it } from 'vitest';
import { decodeBackup, defaultSettings, encodeBackup, validateSettings } from '../lib/settings';

describe('settings and backups', () => {
  it('round-trips all user preferences', () => {
    const settings = {
      ...defaultSettings,
      adult: false,
      keywords: ['示例词'],
      whitelist: ['sample_user'],
    };
    expect(decodeBackup(encodeBackup(settings))).toEqual(settings);
  });
  it('normalizes and deduplicates account and domain lists', () => {
    expect(
      validateSettings({
        ...defaultSettings,
        whitelist: ['@Sample_User', 'sample_user'],
        domains: ['ADS.EXAMPLE.TEST'],
      }),
    ).toMatchObject({ whitelist: ['sample_user'], domains: ['ads.example.test'] });
  });
  it('rejects wrong field types, unsupported versions and foreign files', () => {
    expect(() => validateSettings({ ...defaultSettings, enabled: 'false' })).toThrow();
    expect(() => validateSettings({ ...defaultSettings, mode: ['balanced'] })).toThrow();
    expect(() => validateSettings(JSON.parse('{"__proto__":{}}'))).toThrow();
    expect(() => decodeBackup('{"app":"tuiclean","version":2,"settings":{}}')).toThrow();
    expect(() => decodeBackup('{"other":"data"}')).toThrow();
    expect(() => decodeBackup('oops')).toThrow();
  });
  it('rejects invalid lists and overlarge imports', () => {
    expect(() => validateSettings({ ...defaultSettings, whitelist: ['user/name'] })).toThrow();
    expect(() =>
      validateSettings({ ...defaultSettings, domains: ['https://example.test/path'] }),
    ).toThrow();
    expect(() => decodeBackup(' '.repeat(140_000))).toThrow();
  });
});
