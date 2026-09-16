import { BUNDLED_RULE_PACK, type RulePack, type TermKey } from './rule-pack';
import { normalizeText } from './text';

const literal = (value: string) => normalizeText(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function compileRules(pack: RulePack) {
  // Downloaded entries are literals, never regex source or executable commands.
  // All vocabulary, including connectors, belongs to the data pack so updates
  // take effect consistently. Only bounded grammar and combinations stay here.
  const terms = (key: TermKey) => `(?:${pack.terms[key].map(literal).join('|')})`;
  const phrases = (key: TermKey) =>
    `(?:${pack.terms[key].map((value) => literal(value).replaceAll(' ', '\\s*')).join('|')})`;
  const re = (source: string) => new RegExp(source, 'iu');
  const appearance = terms('baitAppearance');
  const teasing = terms('baitTeasing');
  const comparison = `${terms('comparisonModifiers')}?${terms('comparisonRelations')}`;
  const appearanceFirst = `${terms('comparisonPrefixes')}${appearance}${comparison}${teasing}`;
  const teasingFirst = `${terms('comparisonPrefixes')}${teasing}${comparison}${appearance}`;
  const separator = '[\\p{P}]{0,4}';
  const target = `${terms('seekingCounts')}?${terms('seekingDurations')}?${terms('seekingTargets')}`;
  const service = `${terms('dateVerbs')}(?:${terms('dateAbbreviations')}(?![a-z])|${terms('dateActions')})|${terms('profileOffers')}`;
  const adult = `(?:${terms('adultOffers')}|${service}|${terms('adultHints')}|\\b${terms('adultLabels')}\\b)`;
  const call = `(?:${phrases('adultCalls')}|${phrases('contactPhrases')}|\\b${terms('contactHandles')}[:：])`;
  const quoted = (source: string) => re(`^[“‘「『"']?${source}[”’」』"']?$`);
  return {
    pack,
    adultOfferPattern: re(terms('adultOffers')),
    adultPattern: re(adult),
    spamPattern: re(
      `${terms('spamPhrases')}|${terms('dailyEarnings')}\\d+|${terms('profitPromises')}\\s*${terms('profitTargets')}|${terms('doublePromises')}\\s*${terms('doublePossessives')}\\s*${terms('doubleTargets')}`,
    ),
    contactPattern: re(
      `${terms('contactWords')}|${terms('contactHandles')}[:：]|${phrases('contactPhrases')}|\\b${terms('contactEnglishWords')}\\b`,
    ),
    contextPattern: re(`${terms('contextWords')}|${phrases('contextPhrases')}`),
    comparisonBaitPattern: re(
      `(?:${appearanceFirst}${separator}${teasingFirst}|${teasingFirst}${separator}${appearanceFirst})`,
    ),
    bodyOnlyBaitPattern: re(
      `${terms('bodyRefusals')}${terms('entryVerbs')}${terms('bodyPossessives')}?${terms('lifeContexts')}${separator}${terms('bodyOnlyPrefixes')}${terms('intentWords')}?${terms('bodyEntryVerbs')}${terms('bodyPossessives')}?${terms('bodyParts')}`,
    ),
    solicitation: {
      subject: re(adult),
      service: re(service),
      offer: re(terms('adultOfferActions')),
      location: re(terms('serviceLocations')),
      call: re(call),
      negation: re(terms('solicitationNegations')),
      narrative: re(terms('narrativeMarkers')),
      rejection: re(terms('rejectionPhrases')),
      qualifier: re(`^(?:${phrases('promotionModifiers')}\\s*){0,3}$`),
      // Across sentence boundaries, require whole promotional fragments rather
      // than borrowing a keyword from a story or a call from another topic.
      pitch: quoted(
        `(?:${phrases('promotionModifiers')}\\s*){0,2}${adult}(?:\\s*${phrases('promotionModifiers')}){0,3}`,
      ),
      invitation: quoted(
        `(?:${phrases('callPrefixes')}\\s*){0,2}${call}(?:\\s*${phrases('callSuffixes')}){0,2}`,
      ),
    },
    promotion: {
      platform: re(terms('platforms')),
      creator: re(terms('creators')),
      explicitDetail: re(terms('explicitDetails')),
      intimateDetail: re(
        `${terms('intimatePlaces')}${terms('intimateLinkers')}?${terms('intimateClothing')}?${terms('intimateModifiers')}{0,3}${terms('intimateStates')}`,
      ),
      bodyMotion: re(`${terms('bodyMotionParts')}[^，。！？]{0,8}${terms('bodyMotionActions')}`),
      affair: re(
        `${terms('affairWords')}|${terms('affairPeople')}[^，。！？]{0,6}${terms('affairConcealment')}[^，。！？]{0,6}${terms('affairPartners')}`,
      ),
      eroticTone: re(
        `${terms('eroticTone')}|${terms('eroticIntensifiers')}[^，。！？]{0,4}${terms('eroticTeasing')}|${terms('eroticVocalizations')}[^，。！？]{0,6}${teasing}`,
      ),
      bodyContext: re(
        `${terms('bodyContext')}|${terms('fullerBody')}[^，。！？]{0,4}${terms('fullerMotion')}`,
      ),
      intimateActivity: re(
        `${terms('intimateParts')}[^，。！？]{0,10}${terms('intimateActions')}|${terms('bodyParts')}${terms('intimateLinkers')}?${terms('privateQualifiers')}${terms('privateActions')}`,
      ),
      eroticResponse: re(terms('eroticResponse')),
      profileContact: re(`${terms('profileContacts')}|\\b${terms('profileHandles')}\\b`),
      explicitOffer: re(service),
      overnightOffer: re(terms('overnightOffers')),
      matchmaking: re(terms('matchmaking')),
      seekingPartner: re(`${terms('seekingVerbs')}${target}`),
      declinedSeeking: re(`${terms('declineWords')}${terms('seekingVerbs')}?${target}`),
      invitationPersona: re(`${terms('invitationPrefixes')}${terms('invitationRoles')}`),
      offlineInvitation: re(
        `${terms('offlineAvailability')}|${terms('offlineLocations')}${terms('offlineActions')}`,
      ),
    },
  };
}
export type RuleSet = ReturnType<typeof compileRules>;
export const DEFAULT_RULES = compileRules(BUNDLED_RULE_PACK);
export const RULES = BUNDLED_RULE_PACK.rules;
export const {
  adultOfferPattern,
  adultPattern,
  spamPattern,
  contactPattern,
  contextPattern,
  comparisonBaitPattern,
  bodyOnlyBaitPattern,
} = DEFAULT_RULES;
