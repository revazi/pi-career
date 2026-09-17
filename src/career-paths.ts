// SPDX-License-Identifier: MIT OR Apache-2.0

import path from "node:path";
import { fileURLToPath } from "node:url";

export function careerSkillsDirectory(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skills");
}
