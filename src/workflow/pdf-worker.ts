// SPDX-License-Identifier: MIT OR Apache-2.0

import { parentPort } from "node:worker_threads";

const PDF_MAX_PAGES = 20;
const PDF_MAX_RESULT_BYTES = 512 * 1_024;

interface PdfTextItem {
  str?: unknown;
  hasEOL?: unknown;
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

async function extract(bytes: Uint8Array): Promise<{ ok: true; text: string; pageCount: number } | { ok: false }> {
  let loadingTask: { promise: Promise<unknown>; destroy(): Promise<void> } | undefined;
  try {
    Object.defineProperty(globalThis, "fetch", { value: undefined, configurable: false, writable: false });
    const { getDocument } = await import("unpdf/pdfjs");
    const documentOptions = {
      data: bytes,
      verbosity: 0,
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      useWasm: false,
      disableAutoFetch: true,
      disableStream: true,
      maxImageSize: 4_194_304,
    } as unknown as Parameters<typeof getDocument>[0];
    loadingTask = getDocument(documentOptions) as typeof loadingTask;
    if (loadingTask === undefined) return { ok: false };
    const document = await loadingTask.promise as {
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{ items: PdfTextItem[] }>;
        cleanup(): void;
      }>;
    };
    if (!Number.isSafeInteger(document.numPages) || document.numPages < 1 || document.numPages > PDF_MAX_PAGES) {
      return { ok: false };
    }

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.flatMap((item) =>
        typeof item.str === "string" ? [`${item.str}${item.hasEOL === true ? "\n" : ""}`] : []).join("");
      pages.push(pageText);
      page.cleanup();
      if (Buffer.byteLength(pages.join("\n"), "utf8") > PDF_MAX_RESULT_BYTES) return { ok: false };
    }

    const text = normalizeExtractedText(pages.join("\n"));
    return text.trim().length === 0 ? { ok: false } : { ok: true, text, pageCount: document.numPages };
  } catch {
    return { ok: false };
  } finally {
    await loadingTask?.destroy().catch(() => undefined);
  }
}

if (parentPort !== null) {
  parentPort.once("message", async (value: unknown) => {
    const result = value instanceof Uint8Array ? await extract(value) : { ok: false as const };
    parentPort?.postMessage(result);
  });
}
