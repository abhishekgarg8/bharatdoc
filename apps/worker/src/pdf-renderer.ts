import type { PdfRenderer } from "./types.js";

function asciiText(value: string): string {
  return value.replace(/[^\x20-\x7E\n]/g, " ").replace(/\s+/g, " ").trim();
}

function pdfText(value: string): string {
  return asciiText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value: string, maxChars: number): string[] {
  const words = asciiText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function textLine(x: number, y: number, font: "F1" | "F2", size: number, text: string): string {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(text)}) Tj ET`;
}

function buildContent(input: Parameters<PdfRenderer["render"]>[0]): string {
  const generatedAt = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(input.generatedAt);
  const patientId = input.recording.patient_id ?? "Unassigned";
  const summary = input.recording.summary ?? "";
  const lines: string[] = [
    textLine(50, 790, "F2", 18, input.clinic.name),
    textLine(50, 766, "F1", 10, input.clinic.address ?? "Clinic address not provided"),
    textLine(50, 738, "F2", 12, `Clinical Summary - Patient ${patientId}`),
    textLine(50, 718, "F1", 10, `Doctor: ${input.doctor.name} (${input.doctor.specialization})`),
    textLine(50, 702, "F1", 10, `Recorded: ${input.recording.recorded_at}`),
    textLine(50, 686, "F1", 10, `Generated: ${generatedAt}`),
    textLine(50, 654, "F2", 12, "Summary")
  ];
  let y = 632;

  for (const paragraph of summary.split(/\n+/).filter(Boolean)) {
    for (const wrappedLine of wrapText(paragraph, 86)) {
      if (y < 60) {
        lines.push(textLine(50, y, "F1", 9, "[Content continues in BharatDoc record]"));
        return lines.join("\n");
      }

      lines.push(textLine(50, y, "F1", 10, wrappedLine));
      y -= 15;
    }

    y -= 8;
  }

  return lines.join("\n");
}

function object(id: number, body: string): string {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

function buildPdf(content: string): Buffer {
  const stream = `${content}\n`;
  const objects = [
    object(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    object(
      3,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>"
    ),
    object(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    object(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"),
    object(6, `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}endstream`)
  ];
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  for (const item of objects) {
    offsets.push(Buffer.byteLength(chunks.join(""), "ascii"));
    chunks.push(item);
  }

  const xrefOffset = Buffer.byteLength(chunks.join(""), "ascii");
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");

  for (const offset of offsets.slice(1)) {
    chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }

  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.from(chunks.join(""), "ascii");
}

export function createSimplePdfRenderer(): PdfRenderer {
  return {
    async render(input): Promise<Buffer> {
      return buildPdf(buildContent(input));
    }
  };
}
