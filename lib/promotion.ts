import { compactText } from './text';
import { DEFAULT_RULES, type RuleSet } from './rules';

export function hasAdultReferral(value: string, rules: RuleSet = DEFAULT_RULES): boolean {
  const text = compactText(value);
  const p = rules.promotion;
  if (!p.platform.test(text) || !p.creator.test(text)) return false;
  if (p.explicitDetail.test(text) || p.intimateDetail.test(text)) return true;
  // Softer recommendations need all three signals; private settings and sport
  // descriptions alone must not become adult referrals.
  if (p.bodyContext.test(text) && p.intimateActivity.test(text) && p.eroticResponse.test(text))
    return true;
  return [p.bodyMotion, p.affair, p.eroticTone].filter((pattern) => pattern.test(text)).length >= 2;
}

export function hasAdultProfile(value: string, rules: RuleSet = DEFAULT_RULES): boolean {
  const name = compactText(value);
  const p = rules.promotion;
  if (p.seekingPartner.test(name) && !p.declinedSeeking.test(name)) return true;
  if (!p.profileContact.test(name)) return false;
  // Overnight stays can describe accommodation; that branch also needs dating.
  return p.explicitOffer.test(name) || (p.overnightOffer.test(name) && p.matchmaking.test(name));
}

export function hasProfileSpam(
  nameValue: string,
  textValue: string,
  rules: RuleSet = DEFAULT_RULES,
): boolean {
  const name = compactText(nameValue);
  const p = rules.promotion;
  return (
    /^\d{1,3}$/.test(compactText(textValue)) &&
    p.invitationPersona.test(name) &&
    p.offlineInvitation.test(name)
  );
}
