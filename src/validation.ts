/** Match Go strings.TrimSpace + unicode.IsLetter/IsDigit, counting Unicode code
 * points rather than JavaScript UTF-16 code units. IDs are display labels, so
 * punctuation-only IDs are permitted by protocol v1. No NFC folding is applied. */
export function normalizePlayerID(value: string): string | null {
  const id = value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
  const length = [...id].length;
  return length >= 1 && length <= 20 && /^[\p{L}\p{Nd} ._-]+$/u.test(id) ? id : null;
}
