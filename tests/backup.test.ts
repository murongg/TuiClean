import { describe, expect, it } from 'vitest';
import { encodeDataBackup, decodeDataBackup, DATA_BACKUP_LIMIT } from '../lib/backup';
import { defaultSettings, encodeBackup } from '../lib/settings';

const settings = { ...defaultSettings, keywords: ['合成规则'], blockedUsers: ['sample_backup'] };
const history = [
  {
    id: '1801',
    author: 'sample_backup',
    category: 'spam' as const,
    action: 'folded' as const,
    recordedAt: 1000,
    rules: ['spam-template'],
    reasons: ['合成依据'],
    text: '合成原文',
  },
];
describe('portable data backups', () => {
  it('round-trips preferences, accounts and original text with timestamps', () => {
    expect(decodeDataBackup(encodeDataBackup(settings, history))).toEqual({ settings, history });
  });
  it('still imports an existing v1 settings-only backup', () => {
    expect(decodeDataBackup(encodeBackup(settings))).toEqual({ settings });
  });
  it.each([
    { app: 'other', version: 2, settings, history },
    { app: 'tuiclean', version: 2, settings, history: [{ ...history[0], recordedAt: -1 }] },
    { app: 'tuiclean', version: 2, settings: { ...settings, domains: ['invalid/path'] }, history },
    { app: 'tuiclean', version: 2, settings, history: [{ ...history[0], text: { unsafe: true } }] },
  ])('rejects invalid data before it can be applied', (data) => {
    expect(() => decodeDataBackup(JSON.stringify(data))).toThrow();
  });
  it('rejects oversized files before parsing', () => {
    expect(() => decodeDataBackup(' '.repeat(DATA_BACKUP_LIMIT + 1))).toThrow(/过大/);
  });
});
