import { createRequire } from "node:module";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createWorker, OEM, PSM } from "tesseract.js";
import type { OcrInput, OcrPage, OcrProvider, OcrTextResult } from "./types";
import { DocumentInputError, MAX_DOCUMENT_PAGES, validateDocumentBytes } from "./validation";

const MAX_RENDER_EDGE = 3_200;
const MIN_PDF_TEXT_CHARS = 45;
const MAX_CONCURRENT_OCR_WORKERS = 2;
const workerWaiters: Array<() => void> = [];
let activeWorkers = 0;
const require = createRequire(path.join(process.cwd(), "package.json"));

type PageTextItem = { str?: string; hasEOL?: boolean; transform?: number[]; width?: number };

/** Local CPU OCR. Image bytes and PDF pages stay on this server. */
export class TesseractOcrProvider implements OcrProvider {
  readonly name = "Tesseract.js (local)";
  readonly isMock = false;

  async extractTextFromImage(input: OcrInput): Promise<OcrTextResult> {
    const validated = await validateDocumentBytes(input.buffer, input.mimeType);
    if (validated.mimeType === "application/pdf") throw new DocumentInputError("MIME_MISMATCH");
    const ocrWorker = await createOcrWorker();
    try {
      let image;
      try {
        image = await loadImage(input.buffer);
      } catch {
        throw new DocumentInputError("INVALID_DOCUMENT");
      }
      const scale = Math.min(1, MAX_RENDER_EDGE / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = createCanvas(width, height);
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      const page = await recognizePage(canvas.toBuffer("image/png"), 1, ocrWorker.worker);
      if (!page.text.trim()) throw new DocumentInputError("OCR_EMPTY");
      return makeResult([page], this.name, []);
    } finally {
      await ocrWorker.close();
    }
  }

  async extractTextFromPdf(input: OcrInput): Promise<OcrTextResult> {
    const validated = await validateDocumentBytes(input.buffer, input.mimeType);
    if (validated.mimeType !== "application/pdf") throw new DocumentInputError("MIME_MISMATCH");

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // PDF.js ships its own declarations; the dynamic import keeps the parser
    // and renderer out of client-side bundles.
    let document: { numPages: number; getPage(n: number): Promise<any>; destroy(): Promise<void> };
    try {
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(input.buffer),
        isEvalSupported: false,
        enableXfa: false,
        useSystemFonts: true,
        verbosity: 0,
      });
      document = await loadingTask.promise as { numPages: number; getPage(n: number): Promise<any>; destroy(): Promise<void> };
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name === "PasswordException") throw new DocumentInputError("PDF_ENCRYPTED");
      throw new DocumentInputError("INVALID_DOCUMENT");
    }
    if (document.numPages < 1 || document.numPages > MAX_DOCUMENT_PAGES) {
      await document.destroy();
      throw new DocumentInputError("PDF_TOO_MANY_PAGES");
    }

    const pages: OcrPage[] = [];
    const warnings: string[] = [];
    let ocrWorker: Awaited<ReturnType<typeof createOcrWorker>> | null = null;
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const embeddedText = formatPdfText(textContent.items as PageTextItem[]);
        if (embeddedText.replace(/\s/g, "").length >= MIN_PDF_TEXT_CHARS) {
          pages.push({ pageNumber, text: embeddedText, confidence: 0.98, source: "PDF_TEXT" });
          page.cleanup();
          continue;
        }

        ocrWorker ??= await createOcrWorker();
        const viewportAtOne = page.getViewport({ scale: 1 });
        const scale = Math.min(2.2, MAX_RENDER_EDGE / Math.max(viewportAtOne.width, viewportAtOne.height));
        const viewport = page.getViewport({ scale });
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        if (width < 1 || height < 1 || width * height > 18_000_000) {
          page.cleanup();
          throw new DocumentInputError("IMAGE_TOO_LARGE");
        }

        const canvas = createCanvas(width, height);
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        await page.render({
          canvasContext: context as never,
          viewport,
          canvas: canvas as never,
        }).promise;
        page.cleanup();

        const recognized = await recognizePage(canvas.toBuffer("image/png"), pageNumber, ocrWorker.worker);
        if (!recognized.text.trim()) {
          warnings.push(`Page ${pageNumber} could not be read. Review the original document.`);
        }
        pages.push(recognized);
      }
    } finally {
      await ocrWorker?.close();
      await document.destroy();
    }

    if (!pages.some((page) => page.text.trim())) throw new DocumentInputError("OCR_EMPTY");
    return makeResult(pages, this.name, warnings);
  }
}

function formatPdfText(items: PageTextItem[]): string {
  const positioned = items
    .filter((item) => item.str?.trim())
    .map((item) => ({
      text: item.str!.trim(),
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
      width: item.width ?? 0,
      hasEOL: item.hasEOL ?? false,
    }));
  if (!positioned.length) return "";

  // PDF text operators often expose columns as independent fragments. Rebuild
  // rows from baselines and retain column gaps for the downstream table parser.
  const lines: { y: number; pieces: typeof positioned }[] = [];
  for (const item of positioned) {
    let line = lines.find((entry) => Math.abs(entry.y - item.y) <= 2.5);
    if (!line) {
      line = { y: item.y, pieces: [] };
      lines.push(line);
    }
    line.pieces.push(item);
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      const pieces = line.pieces.sort((a, b) => a.x - b.x);
      let output = "";
      let previousRight: number | null = null;
      for (const piece of pieces) {
        if (previousRight !== null) output += piece.x - previousRight > 16 ? "   " : " ";
        output += piece.text;
        previousRight = piece.x + piece.width;
      }
      return output;
    })
    .join("\n");
}

async function acquireWorkerSlot(): Promise<() => void> {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const next = workerWaiters.shift();
    if (next) next();
    else activeWorkers = Math.max(0, activeWorkers - 1);
  };
  if (activeWorkers < MAX_CONCURRENT_OCR_WORKERS) {
    activeWorkers += 1;
    return release;
  }
  await new Promise<void>((resolve) => workerWaiters.push(resolve));
  return release;
}

async function createOcrWorker(): Promise<{ worker: Awaited<ReturnType<typeof createWorker>>; close: () => Promise<void> }> {
  const releaseSlot = await acquireWorkerSlot();
  let cleanup: () => Promise<void> = async () => {};
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    const languageCodes = [...new Set((process.env.OCR_LANGUAGES ?? "eng")
      .split("+")
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean))];
    const languageData = await resolveLanguagePath(languageCodes);
    cleanup = languageData.cleanup;
    worker = await createWorker(languageCodes, OEM.LSTM_ONLY, {
      langPath: languageData.langPath,
      gzip: true,
      cacheMethod: "none",
      logger: () => undefined,
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    const createdWorker = worker;
    let closed = false;
    return {
      worker: createdWorker,
      close: async () => {
        if (closed) return;
        closed = true;
        try {
          await createdWorker.terminate();
        } finally {
          try {
            await cleanup();
          } finally {
            releaseSlot();
          }
        }
      },
    };
  } catch {
    try {
      await worker?.terminate();
    } catch {
      // Best-effort cleanup after a worker initialization failure.
    }
    try {
      await cleanup();
    } finally {
      releaseSlot();
    }
    throw new DocumentInputError("OCR_PROVIDER_UNAVAILABLE");
  }
}

async function recognizePage(
  image: Buffer,
  pageNumber: number,
  worker: Awaited<ReturnType<typeof createWorker>>,
): Promise<OcrPage> {
  try {
    const result = await worker.recognize(image, { rotateAuto: true });
    return {
      pageNumber,
      text: result.data.text.trim(),
      confidence: clamp01(result.data.confidence / 100),
      source: "TESSERACT",
    };
  } catch {
    throw new DocumentInputError("OCR_PROVIDER_UNAVAILABLE");
  }
}

async function resolveLanguagePath(codes: string[]): Promise<{ langPath: string; cleanup: () => Promise<void> }> {
  if (!codes.length || codes.some((code) => !["eng", "hin"].includes(code))) {
    throw new DocumentInputError("OCR_PROVIDER_UNAVAILABLE", "Only the bundled eng and hin models are supported.");
  }
  const models = codes.map((code) => {
    const pkg = require(`@tesseract.js-data/${code}`) as { langPath: string };
    return { code, source: path.join(pkg.langPath, `${code}.traineddata.gz`) };
  });
  if (models.length === 1) return { langPath: path.dirname(models[0].source), cleanup: async () => undefined };

  const directory = await mkdtemp(path.join(os.tmpdir(), "parikshan-tessdata-"));
  try {
    await Promise.all(models.map((model) => copyFile(model.source, path.join(directory, `${model.code}.traineddata.gz`))));
  } catch {
    await rm(directory, { recursive: true, force: true });
    throw new DocumentInputError("OCR_PROVIDER_UNAVAILABLE");
  }
  return { langPath: directory, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

function makeResult(pages: OcrPage[], provider: string, warnings: string[]): OcrTextResult {
  const text = pages.map((page) => `\n[Page ${page.pageNumber}]\n${page.text}`).join("\n").trim();
  const confidence = pages.length ? pages.reduce((sum, page) => sum + page.confidence, 0) / pages.length : 0;
  return { text, confidence: clamp01(confidence), provider, pageCount: pages.length, pages, warnings };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
