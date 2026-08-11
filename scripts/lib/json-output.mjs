// SPDX-License-Identifier: MIT OR Apache-2.0

import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function insideProject(projectRoot, candidate) {
  const relative = path.relative(projectRoot, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

export async function writeJsonOutput(value, args = process.argv) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const outputIndexes = args.flatMap((value, index) => value === "--output" ? [index] : []);
  if (outputIndexes.length === 0) {
    process.stdout.write(text);
    return;
  }
  if (outputIndexes.length !== 1) throw new Error("--output may be specified only once");
  const output = args[outputIndexes[0] + 1];
  if (!output) throw new Error("--output requires a path");
  if (!path.isAbsolute(output)) throw new Error("--output requires an absolute path outside the repository");

  const parent = await realpath(path.dirname(output));
  const projectRoot = await realpath(PROJECT_ROOT);
  const target = path.join(parent, path.basename(output));
  if (insideProject(projectRoot, target)) {
    throw new Error("--output must not modify the repository");
  }
  try {
    const existing = await lstat(target);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error("--output must target a regular non-symlink file");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const handle = await open(
    target,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(text, "utf8");
  } finally {
    await handle.close();
  }
}
