import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { parseClinicalSummary } from "@bharatdoc/shared";
import type { PdfRenderer } from "./types.js";

const require = createRequire(import.meta.url);
const fontFamily = "Noto Sans Devanagari";
const PGIMER_CLINIC_CODE = "PGIMER";
let fontsRegistered = false;
let pgimerHeaderDataUri: string | null | undefined;

function registerFonts() {
  if (fontsRegistered) {
    return;
  }

  Font.register({
    family: fontFamily,
    fonts: [
      {
        src: require.resolve("@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff"),
        fontWeight: "normal"
      },
      {
        src: require.resolve("@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff"),
        fontWeight: "bold"
      }
    ]
  });
  fontsRegistered = true;
}

const styles = StyleSheet.create({
  page: {
    paddingBottom: 54,
    paddingHorizontal: 42,
    paddingTop: 42,
    fontFamily,
    fontSize: 10,
    color: "#2F251B",
    lineHeight: 1.45
  },
  clinicName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4
  },
  clinicAddress: {
    color: "#6B5D4D",
    marginBottom: 18
  },
  pgimerHeader: {
    height: 74,
    marginBottom: 18,
    objectFit: "contain",
    width: "100%"
  },
  title: {
    borderBottomColor: "#E3D7C3",
    borderBottomWidth: 1,
    borderTopColor: "#E3D7C3",
    borderTopWidth: 1,
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 12,
    paddingBottom: 8,
    paddingTop: 8
  },
  meta: {
    color: "#514536",
    marginBottom: 4
  },
  sectionTitle: {
    color: "#B9472B",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 18
  },
  paragraph: {
    fontSize: 10,
    marginBottom: 8
  },
  sectionBody: {
    borderLeftColor: "#E3D7C3",
    borderLeftWidth: 2,
    paddingLeft: 10
  },
  footer: {
    borderTopColor: "#E3D7C3",
    borderTopWidth: 1,
    bottom: 24,
    color: "#7A6B5B",
    fontSize: 8,
    left: 42,
    paddingTop: 8,
    position: "absolute",
    right: 42
  }
});

function formattedGeneratedAt(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(date);
}

function summaryParagraphs(summary: string): string[] {
  const paragraphs = summary
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length > 0 ? paragraphs : ["No summary text was provided."];
}

function formattedTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formattedGeneratedAt(date);
}

function pgimerHeaderAssetCandidates(): string[] {
  return [
    join(process.cwd(), "assets", "pgimer-pdf-header.png"),
    join(process.cwd(), "apps", "worker", "assets", "pgimer-pdf-header.png")
  ];
}

function getPgimerHeaderDataUri(): string | null {
  if (pgimerHeaderDataUri !== undefined) {
    return pgimerHeaderDataUri;
  }

  const assetPath = pgimerHeaderAssetCandidates().find((candidate) => existsSync(candidate));
  pgimerHeaderDataUri = assetPath
    ? `data:image/png;base64,${readFileSync(assetPath).toString("base64")}`
    : null;

  return pgimerHeaderDataUri;
}

function isPgimerClinic(clinicCode: string): boolean {
  return clinicCode.toUpperCase() === PGIMER_CLINIC_CODE;
}

function pdfDocument(input: Parameters<PdfRenderer["render"]>[0]) {
  const generatedAt = formattedGeneratedAt(input.generatedAt);
  const patientId = input.recording.patient_id ?? "Unassigned";
  const summary = input.recording.summary ?? "";
  const sections = parseClinicalSummary(summary);
  const pgimerHeaderSrc = isPgimerClinic(input.clinic.clinic_code) ? getPgimerHeaderDataUri() : null;
  const h = React.createElement;

  return h(
    Document,
    {
      author: input.doctor.name,
      creationDate: input.generatedAt,
      creator: "BharatDoc",
      keywords: `patient:${patientId},recorded:${formattedTimestamp(input.recording.recorded_at)},generated:${generatedAt}`,
      producer: "BharatDoc",
      subject: `Recorded ${formattedTimestamp(input.recording.recorded_at)} | Generated ${generatedAt}`,
      title: `Clinical Summary - Patient ${patientId}`
    },
    h(
      Page,
      { size: "A4", style: styles.page, wrap: true },
      pgimerHeaderSrc
        ? h(Image, { src: pgimerHeaderSrc, style: styles.pgimerHeader })
        : [
            h(Text, { key: "clinic-name", style: styles.clinicName }, input.clinic.name),
            h(Text, { key: "clinic-address", style: styles.clinicAddress }, input.clinic.address ?? "Hospital address not provided")
          ],
      h(Text, { style: styles.title }, `Clinical Summary - Patient ${patientId}`),
      h(Text, { style: styles.meta }, `Doctor: ${input.doctor.name} (${input.doctor.specialization})`),
      h(Text, { style: styles.meta }, `Recorded: ${formattedTimestamp(input.recording.recorded_at)}`),
      h(Text, { style: styles.meta }, `Generated: ${generatedAt}`),
      sections.length > 0
        ? sections.map((section) =>
            h(View, { key: section.title }, [
              h(Text, { key: `${section.title}-title`, style: styles.sectionTitle }, section.title),
              ...summaryParagraphs(section.body).map((paragraph, index) =>
                h(Text, { key: `${section.title}-${index}`, style: [styles.paragraph, styles.sectionBody] }, paragraph)
              )
            ])
          )
        : h(View, { wrap: true }, [
            h(Text, { key: "summary-title", style: styles.sectionTitle }, "Summary"),
            ...summaryParagraphs(summary).map((paragraph, index) =>
              h(Text, { key: `summary-${index}`, style: styles.paragraph }, paragraph)
            )
          ]),
      h(Text, { fixed: true, style: styles.footer }, "Powered by BharatDoc | AI-assisted - verify before clinical use")
    )
  );
}

export function createSimplePdfRenderer(): PdfRenderer {
  return {
    async render(input): Promise<Buffer> {
      registerFonts();
      return renderToBuffer(pdfDocument(input));
    }
  };
}
