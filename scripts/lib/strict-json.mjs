// SPDX-License-Identifier: MIT OR Apache-2.0

import assert from "node:assert/strict";

const DEFAULT_MAX_BYTES = 512 * 1024;
const MAX_DEPTH = 128;
const NUMBER_PATTERN = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

function syntaxFailure(label, detail) {
  throw new SyntaxError(`${label} must be valid JSON without duplicate decoded keys (${detail})`);
}

export function parseStrictJson(text, { label = "JSON", maximumBytes = DEFAULT_MAX_BYTES } = {}) {
  assert.equal(typeof text, "string", `${label} text must be a string`);
  assert.ok(Number.isSafeInteger(maximumBytes) && maximumBytes > 0, `${label} maximum bytes`);
  const byteLength = Buffer.byteLength(text);
  assert.ok(byteLength > 0 && byteLength <= maximumBytes, `${label} size`);

  let offset = 0;

  function skipWhitespace() {
    while (offset < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[offset])) offset += 1;
  }

  function parseString() {
    if (text[offset] !== '"') syntaxFailure(label, `expected string at offset ${offset}`);
    const start = offset;
    offset += 1;
    while (offset < text.length) {
      const code = text.charCodeAt(offset);
      if (text[offset] === '"') {
        offset += 1;
        try {
          return JSON.parse(text.slice(start, offset));
        } catch {
          syntaxFailure(label, `invalid string at offset ${start}`);
        }
      }
      if (code <= 0x1f) syntaxFailure(label, `control character in string at offset ${offset}`);
      if (text[offset] === "\\") {
        offset += 1;
        const escaped = text[offset];
        if (escaped === "u") {
          const digits = text.slice(offset + 1, offset + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) syntaxFailure(label, `invalid Unicode escape at offset ${offset - 1}`);
          offset += 5;
          continue;
        }
        if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escaped)) {
          syntaxFailure(label, `invalid escape at offset ${offset - 1}`);
        }
      }
      offset += 1;
    }
    syntaxFailure(label, `unterminated string at offset ${start}`);
  }

  function parseObject(depth) {
    offset += 1;
    skipWhitespace();
    const keys = new Set();
    if (text[offset] === "}") {
      offset += 1;
      return;
    }
    while (offset < text.length) {
      const key = parseString();
      if (keys.has(key)) syntaxFailure(label, `duplicate decoded key ${JSON.stringify(key)} at offset ${offset}`);
      keys.add(key);
      skipWhitespace();
      if (text[offset] !== ":") syntaxFailure(label, `expected colon at offset ${offset}`);
      offset += 1;
      parseValue(depth + 1);
      skipWhitespace();
      if (text[offset] === "}") {
        offset += 1;
        return;
      }
      if (text[offset] !== ",") syntaxFailure(label, `expected comma at offset ${offset}`);
      offset += 1;
      skipWhitespace();
    }
    syntaxFailure(label, "unterminated object");
  }

  function parseArray(depth) {
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
      if (text[offset] !== ",") syntaxFailure(label, `expected comma at offset ${offset}`);
      offset += 1;
      skipWhitespace();
    }
    syntaxFailure(label, "unterminated array");
  }

  function parseValue(depth) {
    if (depth > MAX_DEPTH) syntaxFailure(label, `nesting exceeds ${MAX_DEPTH}`);
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
    NUMBER_PATTERN.lastIndex = offset;
    const number = NUMBER_PATTERN.exec(text);
    if (number) {
      offset = NUMBER_PATTERN.lastIndex;
      return;
    }
    syntaxFailure(label, `unexpected token at offset ${offset}`);
  }

  parseValue(0);
  skipWhitespace();
  if (offset !== text.length) syntaxFailure(label, `trailing content at offset ${offset}`);
  try {
    return JSON.parse(text);
  } catch {
    syntaxFailure(label, "parser rejection");
  }
}
