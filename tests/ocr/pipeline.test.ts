import assert from "node:assert/strict";
import { test } from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { TesseractOcrProvider } from "@/lib/ocr/tesseract-provider";
import { DocumentInputError, validateDocumentBytes } from "@/lib/ocr/validation";
import { parseDateFromText, parseLabValues } from "@/lib/ocr/parser";
import { classifyLabResult, evaluateAgainstRange } from "@/lib/health/metrics";

function makePdf(objects: Buffer[]): Buffer {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "ascii")];
  const offsets = [0];
  let position = parts[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(position);
    const wrapped = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, "ascii"),
      object,
      Buffer.from("\nendobj\n", "ascii"),
    ]);
    parts.push(wrapped);
    position += wrapped.length;
  }
  const xrefOffset = position;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  ].join("");
  parts.push(Buffer.from(xref, "ascii"));
  return Buffer.concat(parts);
}

function makeScannedPdf(): Buffer {
  const canvas = createCanvas(1400, 300);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "black";
  context.font = "bold 78px Arial";
  context.fillText("HEMOGLOBIN 13.5 g/dL", 35, 170);
  const jpeg = canvas.toBuffer("image/jpeg", 92);
  const content = Buffer.from("q\n550 0 0 118 31 560 cm\n/Im0 Do\nQ\n", "ascii");
  return makePdf([
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "ascii"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "ascii"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>", "ascii"),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "ascii"), content, Buffer.from("endstream", "ascii")]),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, "ascii"),
      jpeg,
      Buffer.from("\nendstream", "ascii"),
    ]),
  ]);
}

test("byte validation rejects mismatched MIME and malformed documents", async () => {
  await assert.rejects(
    validateDocumentBytes(Buffer.from("not a real PDF document"), "application/pdf"),
    (error: unknown) => error instanceof DocumentInputError && error.code === "INVALID_DOCUMENT",
  );
  const canvas = createCanvas(160, 160);
  const png = canvas.toBuffer("image/png");
  await assert.rejects(
    validateDocumentBytes(png, "application/pdf"),
    (error: unknown) => error instanceof DocumentInputError && error.code === "MIME_MISMATCH",
  );
});

test("lab parsing preserves provenance and uses only printed ranges and source flags", () => {
  const page = { pageNumber: 2, text: "Hemoglobin 13.5 g/dL 12.0 - 16.0", confidence: 0.95, source: "TESSERACT" as const };
  const values = parseLabValues([page.text], page);
  assert.equal(values.length, 1);
  assert.equal(values[0].status, "WITHIN_RANGE");
  assert.equal(values[0].sourceText, page.text);
  assert.equal(values[0].sourcePage, 2);
  assert.equal(values[0].criticalFlag, false);

  assert.equal(evaluateAgainstRange(17, "12 - 16", "g/dL"), "ABOVE_RANGE");
  assert.equal(evaluateAgainstRange(17, "12 - 16 g/dL", "mmol/L"), "UNKNOWN");
  assert.equal(classifyLabResult({ value: 17, unit: "g/dL", referenceRange: "12 - 16", sourceFlag: "H", confidence: 0.95 }).status, "ABOVE_RANGE");
  assert.equal(classifyLabResult({ value: 17, unit: "g/dL", referenceRange: "12 - 16", sourceFlag: "HH", confidence: 0.95 }).status, "CRITICAL");
  const uncertainCritical = classifyLabResult({ value: 17, unit: "g/dL", referenceRange: "12 - 16", sourceFlag: "HH", confidence: 0.4 });
  assert.equal(uncertainCritical.status, "UNKNOWN");
  assert.equal(uncertainCritical.criticalFlag, true);
});

test("invalid calendar dates do not roll into another month", () => {
  assert.equal(parseDateFromText("Report date: 31/02/2026"), null);
  assert.equal(parseDateFromText("Report date: 2026-02-28")?.toISOString().slice(0, 10), "2026-02-28");
});

test("local Tesseract reads an image and a scanned PDF without a hosted OCR service", async () => {
  const canvas = createCanvas(1500, 360);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "black";
  context.font = "bold 82px Arial";
  context.fillText("HEMOGLOBIN 13.5 g/dL", 35, 200);
  const png = canvas.toBuffer("image/png");
  const provider = new TesseractOcrProvider();
  const imageResult = await provider.extractTextFromImage({ buffer: png, fileName: "report.png", mimeType: "image/png" });
  assert.match(imageResult.text.toUpperCase(), /HEMOGLOBIN/);
  assert.equal(imageResult.pages?.[0]?.pageNumber, 1);
  assert.ok(imageResult.confidence > 0);

  const pdf = makeScannedPdf();
  const pdfResult = await provider.extractTextFromPdf({ buffer: pdf, fileName: "scan.pdf", mimeType: "application/pdf" });
  assert.match(pdfResult.text.toUpperCase(), /HEMOGLOBIN/);
  assert.equal(pdfResult.pages?.[0]?.source, "TESSERACT");
  assert.equal(pdfResult.pageCount, 1);
});
