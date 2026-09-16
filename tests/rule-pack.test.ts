import { describe, expect, it } from 'vitest';
import { BUNDLED_RULE_PACK, validateRulePack } from '../lib/rule-pack';
import { compileRules, type RuleSet } from '../lib/rules';
import { inspect } from '../lib/detector';
import { defaultSettings } from '../lib/settings';

const sample = (text: string) => ({
  id: '5101',
  author: 'sample_rules',
  name: '合成作者',
  text,
  links: [],
});
const copy = () => structuredClone(BUNDLED_RULE_PACK);
const comparison = '比我俊的都不如我浪；比我浪的都不如我俊';
const bodyBait = '不走进你的生活；只会走进你的身體';
const intimateDetail = '内裤的裤子明显湿';

describe('versioned data-only rule packs', () => {
  it('accepts the bundled pack and projects a separate validated copy', () => {
    const pack = validateRulePack(copy());
    expect(pack).toEqual(BUNDLED_RULE_PACK);
    pack.terms.adultOffers.push('合成附加词');
    expect(BUNDLED_RULE_PACK.terms.adultOffers).not.toContain('合成附加词');
  });
  it('updates detection from vocabulary while preserving user overrides', () => {
    const pack = copy();
    pack.version++;
    pack.terms.adultOffers.push('合成成人线索');
    const rules = compileRules(pack);
    const post = sample('合成成人线索，私信领取');
    expect(inspect(post, defaultSettings).level).toBe('allow');
    expect(inspect(post, defaultSettings, {}, rules).rules).toEqual(['adult-solicitation']);
    expect(
      inspect(post, { ...defaultSettings, whitelist: ['sample_rules'] }, {}, rules).level,
    ).toBe('allow');
    expect(inspect(post, { ...defaultSettings, adult: false }, {}, rules).level).toBe('allow');
  });
  it('updates compound profile/referral dictionaries without executing rule-supplied logic', () => {
    const pack = copy();
    pack.terms.platforms.push('合成平台');
    pack.terms.creators.push('合成作者');
    pack.terms.explicitDetails.push('合成片段');
    pack.terms.seekingTargets.push('合成伴侣');
    const rules = compileRules(pack);
    expect(
      inspect(sample('合成平台的合成作者分享合成片段'), defaultSettings, {}, rules).rules,
    ).toEqual(['adult-referral']);
    expect(
      inspect({ ...sample('8'), name: '虚构昵称·寻合成伴侣' }, defaultSettings, {}, rules).rules,
    ).toEqual(['adult-profile']);
  });
  it.each([
    ['comparisonPrefixes', 'comparisonBaitPattern', '比我', comparison],
    ['comparisonModifiers', 'comparisonBaitPattern', '的都', comparison],
    ['comparisonRelations', 'comparisonBaitPattern', '不如我', comparison],
    ['bodyRefusals', 'bodyOnlyBaitPattern', '不', bodyBait],
    ['bodyPossessives', 'bodyOnlyBaitPattern', '你的', bodyBait],
    ['lifeContexts', 'bodyOnlyBaitPattern', '生活', bodyBait],
    ['bodyOnlyPrefixes', 'bodyOnlyBaitPattern', '只', bodyBait],
    ['doublePossessives', 'spamPattern', 'your', 'double your crypto'],
    ['seekingCounts', 'seekingPartner', '一位', '找一位固定炮友'],
    ['seekingCounts', 'declinedSeeking', '一位', '勿找一位固定炮友'],
    ['intimateLinkers', 'intimateDetail', '的', intimateDetail],
    ['intimateClothing', 'intimateDetail', '裤子', intimateDetail],
    ['intimateModifiers', 'intimateDetail', '明显', intimateDetail],
    ['intimateStates', 'intimateDetail', '湿', intimateDetail],
    ['intimateStates', 'intimateDetail', '水都溢', '内裤水都溢'],
    ['intimateStates', 'intimateDetail', '水流', '内裤水流'],
    ['eroticIntensifiers', 'eroticTone', '太', '太过撩'],
    ['eroticTeasing', 'eroticTone', '撩', '太过撩'],
    ['eroticVocalizations', 'eroticTone', '喘', '喘得浪'],
    ['intimateLinkers', 'intimateActivity', '的', '身體的私密探索'],
    ['privateQualifiers', 'intimateActivity', '私密', '身體的私密探索'],
    ['dateVerbs', 'explicitOffer', '约', '约啪'],
    ['dateAbbreviations', 'explicitOffer', 'p', '约p'],
    ['offlineAvailability', 'offlineInvitation', '可以線下', '可以線下'],
    ['offlineLocations', 'offlineInvitation', '線下', '線下預約'],
  ] as const)(
    'uses replacement literals from %s in %s, including regex metacharacters',
    (key, pattern, previous, original) => {
      const pack = copy();
      const replacement = '合成[词]+';
      pack.terms[key] = [replacement];
      const select = (rules: RuleSet) => {
        const patterns = { ...rules, ...rules.promotion };
        // Full matching makes optional vocabulary changes observable as well.
        return new RegExp(`^(?:${patterns[pattern].source})$`, 'iu');
      };
      const bundled = select(compileRules(BUNDLED_RULE_PACK));
      const updated = select(compileRules(validateRulePack(pack)));
      const changed = original.replaceAll(previous, replacement);
      expect(bundled.test(original)).toBe(true);
      expect(bundled.test(changed)).toBe(false);
      expect(updated.test(changed)).toBe(true);
      expect(updated.test(original)).toBe(false);
    },
  );
  it('applies a new offline phrase to nickname detection with the same evidence requirements', () => {
    const pack = copy();
    pack.terms.offlineAvailability = ['合成见面短语'];
    const rules = compileRules(validateRulePack(pack));
    const post = { ...sample('7'), name: '虚构昵称·你的学长·合成见面短语' };
    expect(inspect(post, defaultSettings).level).toBe('allow');
    expect(inspect(post, defaultSettings, {}, rules).rules).toEqual(['spam-profile']);
    expect(
      inspect({ ...post, text: '一条合成的普通讨论。' }, defaultSettings, {}, rules).level,
    ).toBe('allow');
    expect(
      inspect(post, { ...defaultSettings, whitelist: ['sample_rules'] }, {}, rules).level,
    ).toBe('allow');
  });
  it('treats metacharacters in downloaded words as literal text', () => {
    const pack = copy();
    pack.terms.adultOffers = ['(a+)+$'];
    const rules = compileRules(validateRulePack(pack));
    expect(inspect(sample('a'.repeat(5000)), defaultSettings, {}, rules).level).toBe('allow');
    expect(inspect(sample('(a+)+$'), defaultSettings, {}, rules).rules).toEqual(['adult-hint']);
  });
  it.each([
    (pack: Record<string, unknown>) => {
      pack.schema = 99;
    },
    (pack: Record<string, unknown>) => {
      pack.version = -1;
    },
    (pack: Record<string, unknown>) => {
      pack.updatedAt = '2026-02-30';
    },
    (pack: Record<string, unknown>) => {
      pack.script = 'synthetic-code';
    },
  ])('rejects incompatible or malformed metadata', (mutate) => {
    const pack = copy();
    mutate(pack as unknown as Record<string, unknown>);
    expect(() => validateRulePack(pack)).toThrow();
  });
  it('rejects missing, excessive and blank dictionaries, unknown rules and wrong categories', () => {
    const missing = copy();
    Reflect.deleteProperty(missing.terms, 'platforms');
    const excessive = copy();
    excessive.terms.platforms = Array.from({ length: 201 }, (_, i) => `合成${i}`);
    const blank = copy();
    blank.terms.platforms = ['\u200b'];
    const rule = copy();
    rule.rules[0]!.id = 'unknown' as never;
    const category = copy();
    category.rules[0]!.category = 'spam';
    for (const pack of [missing, excessive, blank, rule, category])
      expect(() => validateRulePack(pack)).toThrow();
  });
});
