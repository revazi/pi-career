// SPDX-License-Identifier: MIT OR Apache-2.0

import { Worker } from "node:worker_threads";

export const PDF_MAX_RAW_BYTES = 10 * 1_024 * 1_024;
const PDF_MAX_PAGES = 20;
const PDF_EXTRACTION_TIMEOUT_MS = 10_000;
const PDF_MAX_RESULT_BYTES = 512 * 1_024;

interface PdfWorkerSuccess {
  ok: true;
  text: string;
  pageCount: number;
}

interface PdfWorkerFailure {
  ok: false;
}

type PdfWorkerResult = PdfWorkerSuccess | PdfWorkerFailure;

export type PdfExtractionResult =
  | { ok: true; text: string; pageCount: number }
  | { ok: false };

function workerUrl(): URL {
  return import.meta.url.endsWith("/dist/index.js")
    ? new URL("./pdf-worker.js", import.meta.url)
    : new URL("./pdf-worker.ts", import.meta.url);
}

function validWorkerResult(value: unknown): value is PdfWorkerResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result.ok === false) return Object.keys(result).length === 1;
  return (
    result.ok === true &&
    Object.keys(result).sort().join(",") === "ok,pageCount,text" &&
    typeof result.text === "string" &&
    Buffer.byteLength(result.text, "utf8") <= PDF_MAX_RESULT_BYTES &&
    Number.isSafeInteger(result.pageCount) &&
    (result.pageCount as number) > 0 &&
    (result.pageCount as number) <= PDF_MAX_PAGES
  );
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfExtractionResult> {
  if (bytes.byteLength === 0 || bytes.byteLength > PDF_MAX_RAW_BYTES) return { ok: false };

  let worker: Worker;
  try {
    worker = new Worker(workerUrl(), {
      env: {},
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 32,
        stackSizeMb: 4,
      },
    });
  } catch {
    return { ok: false };
  }

  return await new Promise<PdfExtractionResult>((resolve) => {
    let settled = false;
    const finish = (result: PdfExtractionResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false }), PDF_EXTRACTION_TIMEOUT_MS);

    worker.once("message", (value: unknown) => {
      if (!validWorkerResult(value) || value.ok === false || value.text.trim().length === 0) {
        finish({ ok: false });
        return;
      }
      finish({ ok: true, text: value.text, pageCount: value.pageCount });
    });
    worker.once("error", () => finish({ ok: false }));
    worker.once("exit", () => finish({ ok: false }));

    const transferable = Uint8Array.from(bytes);
    try {
      worker.postMessage(transferable, [transferable.buffer]);
    } catch {
      finish({ ok: false });
    }
  });
}
