export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Emoji property alone also matches ASCII digits. Preserve prices, versions
// and other meaningful numbers while removing decorative emoji components.
const decoration =
  /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\uFE0E\uFE0F\u20E3\u200D]/gu;

export function stripDecorations(text: string): string {
  return text.replace(decoration, '');
}

export function compactText(text: string): string {
  return stripDecorations(normalizeText(text)).replace(/\s/g, '');
}
