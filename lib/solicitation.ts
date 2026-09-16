import { DEFAULT_RULES, type RuleSet } from './rules';
import { compactText, normalizeText, stripDecorations } from './text';

interface Hit {
  text: string;
  start: number;
  end: number;
}

interface Evidence {
  kind: 'offer' | 'location' | 'contact' | 'adjacent';
  subject: string;
  cue: string;
  reasons: string[];
}

function evidence(kind: Evidence['kind'], subject: string, cue: string, text: string): Evidence {
  const labels = {
    offer: '招揽动作',
    location: '地域邀约',
    contact: '联系入口',
    adjacent: '相邻短句联系入口',
  };
  return {
    kind,
    subject,
    cue,
    reasons: [
      `成人内容线索“${subject}”与${labels[kind]}“${cue}”组合命中`,
      `命中片段：${text.slice(0, 160)}${text.length > 160 ? '…' : ''}`,
    ],
  };
}

function hits(pattern: RegExp, text: string): Hit[] {
  // Each scan owns its cursor; shared compiled rules remain stateless across posts.
  return Array.from(text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`)), (match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function pair(
  subjects: Hit[],
  cues: Hit[],
  distance: number,
  accept: (subject: Hit, cue: Hit) => boolean = () => true,
): [Hit, Hit] | undefined {
  let first = 0;
  for (const cue of cues) {
    while (first < subjects.length && subjects[first]!.end < cue.start - distance) first++;
    for (let index = first; index < subjects.length; index++) {
      const subject = subjects[index]!;
      if (subject.start > cue.end + distance) break;
      if (subject.end > cue.start && cue.end > subject.start) continue;
      if (accept(subject, cue)) return [subject, cue];
    }
  }
  return undefined;
}

export function detectSolicitation(value: string, rules: RuleSet = DEFAULT_RULES): Evidence | null {
  const patterns = rules.solicitation;
  const supported = (text: string, hit: Hit) => {
    // Context only qualifies its own clause. A negated or narrated example
    // must not cancel a separate affirmative offer after a comma or sentence.
    const before = text
      .slice(Math.max(0, hit.start - 80), hit.start)
      .split(/[,，]/u)
      .at(-1)!;
    const after = text.slice(hit.end, hit.end + 80).split(/[,，]/u)[0]!;
    return (
      !patterns.negation.test(before) &&
      !patterns.narrative.test(before + hit.text + after) &&
      !patterns.rejection.test(after)
    );
  };

  const fragments = value
    .split(/[。！？!?;；\r\n]+|\.(?=\s|$)/u)
    .map((raw) => ({ normal: stripDecorations(normalizeText(raw)), compact: compactText(raw) }))
    .filter((fragment) => fragment.compact.length > 0);
  const collected = fragments.map((fragment) => {
    let direct: Evidence | null = null;
    let pitch: string | undefined;
    let invitation: string | undefined;
    for (const text of new Set([fragment.normal, fragment.compact])) {
      const active = (pattern: RegExp) => hits(pattern, text).filter((hit) => supported(text, hit));
      const subjects = active(patterns.subject);
      const calls = active(patterns.call);
      const offered = pair(
        subjects,
        active(patterns.offer),
        12,
        (subject, cue) =>
          cue.end <= subject.start &&
          patterns.qualifier.test(text.slice(cue.end, subject.start).trim()),
      );
      const local = pair(active(patterns.service), active(patterns.location), 12);
      const contact = pair(subjects, calls, 24);
      const match = offered ?? local ?? contact;
      if (match) {
        const start = Math.max(0, Math.min(match[0].start, match[1].start) - 24);
        direct = evidence(
          offered ? 'offer' : local ? 'location' : 'contact',
          match[0].text,
          match[1].text,
          text.slice(start),
        );
        break;
      }
      if (patterns.pitch.test(text) && subjects[0]) pitch = subjects[0].text;
      if (patterns.invitation.test(text) && calls[0]) invitation = calls[0].text;
    }
    return { ...fragment, direct, pitch, invitation };
  });
  const direct = collected.find((fragment) => fragment.direct)?.direct;
  if (direct) return direct;
  // Keep intervening content: dropping fragments with no evidence would join
  // unrelated paragraphs. Only whole, adjacent promotional fragments qualify.
  for (let index = 0; index < collected.length - 1; index++) {
    const current = collected[index]!;
    const next = collected[index + 1]!;
    if (current.compact.length + next.compact.length > 120) continue;
    const subject = current.pitch && next.invitation ? current.pitch : next.pitch;
    const cue = current.pitch && next.invitation ? next.invitation : current.invitation;
    if (subject && cue)
      return evidence('adjacent', subject, cue, `${current.normal} / ${next.normal}`);
  }
  return null;
}
