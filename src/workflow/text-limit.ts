// SPDX-License-Identifier: MIT OR Apache-2.0

export const CORE_MAX_CHARACTERS = 50_000;

export function isWithinCoreCharacterLimit(value: string): boolean {
  let codePoints = 0;
  for (const _codePoint of value) {
    codePoints += 1;
    if (codePoints > CORE_MAX_CHARACTERS) return false;
  }
  return true;
}
