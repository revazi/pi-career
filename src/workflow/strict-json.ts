// SPDX-License-Identifier: MIT OR Apache-2.0

const MAX_DEPTH = 32;
const NUMBER_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;

function invalidJson(): never {
  throw new SyntaxError("invalid strict JSON");
}

/** Parse one JSON value while rejecting duplicate decoded object keys. */
export function parseStrictJson(text: string): unknown {
  let offset = 0;

  function skipWhitespace(): void {
    while (offset < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[offset]!)) offset += 1;
  }

  function skipEscape(): void {
    offset += 1;
    const escaped = text[offset];
    if (escaped === "u") {
      if (!/^[0-9a-fA-F]{4}$/.test(text.slice(offset + 1, offset + 5))) invalidJson();
      offset += 5;
      return;
    }
    if (escaped === undefined || !['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escaped)) {
      invalidJson();
    }
    offset += 1;
  }

  function parseString(): string {
    if (text[offset] !== '"') invalidJson();
    const start = offset;
    offset += 1;
    while (offset < text.length) {
      const character = text[offset]!;
      if (character === '"') {
        offset += 1;
        try {
          return JSON.parse(text.slice(start, offset)) as string;
        } catch {
          invalidJson();
        }
      }
      if (text.charCodeAt(offset) <= 0x1f) invalidJson();
      if (character === "\\") skipEscape();
      else offset += 1;
    }
    invalidJson();
  }

  function parseObject(depth: number): void {
    offset += 1;
    skipWhitespace();
    const keys = new Set<string>();
    if (text[offset] === "}") {
      offset += 1;
      return;
    }
    while (offset < text.length) {
      const key = parseString();
      if (keys.has(key)) invalidJson();
      keys.add(key);
      skipWhitespace();
      if (text[offset] !== ":") invalidJson();
      offset += 1;
      parseValue(depth + 1);
      skipWhitespace();
      if (text[offset] === "}") {
        offset += 1;
        return;
      }
      if (text[offset] !== ",") invalidJson();
      offset += 1;
      skipWhitespace();
    }
    invalidJson();
  }

  function parseArray(depth: number): void {
    offset += 1;
    skipWhitespace();
    if (text[offset] === "]") {
      offset += 1;
      return;
    }
    while (offset < text.length) {
      parseValue(depth + 1);
      skipWhitespace();
      if (text[offset] === "]") {
        offset += 1;
        return;
      }
      if (text[offset] !== ",") invalidJson();
      offset += 1;
      skipWhitespace();
    }
    invalidJson();
  }

  function parseValue(depth: number): void {
    if (depth > MAX_DEPTH) invalidJson();
    skipWhitespace();
    const character = text[offset];
    if (character === "{") return parseObject(depth);
    if (character === "[") return parseArray(depth);
    if (character === '"') {
      parseString();
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, offset)) {
        offset += literal.length;
        return;
      }
    }
    const number = text.slice(offset).match(NUMBER_PATTERN)?.[0];
    if (number !== undefined) {
      offset += number.length;
      return;
    }
    invalidJson();
  }

  if (text.length === 0) invalidJson();
  parseValue(0);
  skipWhitespace();
  if (offset !== text.length) invalidJson();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    invalidJson();
  }
}
