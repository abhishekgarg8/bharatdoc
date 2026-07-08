export interface ClinicalSummarySection {
  title: string;
  body: string;
}

export const CLINICAL_SUMMARY_SECTION_TITLES = [
  "Chief Complaint",
  "History of Present Illness",
  "Key Findings / Symptoms Mentioned",
  "Provisional Diagnosis",
  "Treatment / Prescription",
  "Follow-up Instructions",
  "Additional Notes"
] as const;

const canonicalTitles = new Map(
  [
    ...CLINICAL_SUMMARY_SECTION_TITLES.flatMap((title) => [
      [normalizeTitle(title), title],
      [normalizeTitle(title.replace(/\s*\(.*?\)/g, "")), title]
    ]),
    ["complaint", "Chief Complaint"],
    ["hpi", "History of Present Illness"],
    ["history", "History of Present Illness"],
    ["findings", "Key Findings / Symptoms Mentioned"],
    ["symptoms", "Key Findings / Symptoms Mentioned"],
    ["diagnosis", "Provisional Diagnosis"],
    ["assessment", "Provisional Diagnosis"],
    ["treatment", "Treatment / Prescription"],
    ["prescription", "Treatment / Prescription"],
    ["medications", "Treatment / Prescription"],
    ["plan", "Treatment / Prescription"],
    ["follow up", "Follow-up Instructions"],
    ["followup", "Follow-up Instructions"],
    ["notes", "Additional Notes"]
  ] as [string, string][]
);

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripMarkdown(value: string): string {
  return value
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .trim();
}

function splitHeading(line: string): { title: string; body: string } | null {
  const clean = stripMarkdown(line).replace(/^\d+[.)]\s*/, "").trim();
  const match = clean.match(/^(.+?)(?:\s*[:–]\s*|\s+-\s+)(.*)$/);
  const titleText = match?.[1] ?? clean;

  const title = canonicalTitles.get(normalizeTitle(titleText));
  return title ? { title, body: match?.[2]?.trim() ?? "" } : null;
}

export function parseClinicalSummary(summary: string | null | undefined): ClinicalSummarySection[] {
  const sections = new Map<string, string[]>();
  let currentTitle: string | null = null;
  const fallback: string[] = [];

  for (const rawLine of (summary ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const heading = splitHeading(line);

    if (heading) {
      currentTitle = heading.title;
      sections.set(currentTitle, [...(sections.get(currentTitle) ?? []), ...(heading.body ? [heading.body] : [])]);
      continue;
    }

    (currentTitle ? sections.get(currentTitle)! : fallback).push(stripMarkdown(line));
  }

  if (sections.size === 0 && fallback.length > 0) {
    sections.set("Additional Notes", fallback);
  }

  return CLINICAL_SUMMARY_SECTION_TITLES.map((title) => ({
    title,
    body: (sections.get(title) ?? []).join("\n").trim()
  })).filter((section) => section.body);
}

export function sanitizeClinicalSummaryText(summary: string | null | undefined): string {
  const stripped = stripMarkdown(summary ?? "");
  const sections = parseClinicalSummary(summary);

  if (sections.length === 0) {
    return stripped;
  }

  if (sections.length === 1 && sections[0]?.title === "Additional Notes") {
    return sections[0].body || stripped;
  }

  return sections.map(({ title, body }) => `${title}\n${body}`).join("\n\n");
}
