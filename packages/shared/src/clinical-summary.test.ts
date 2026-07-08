import { describe, expect, it } from "vitest";
import { parseClinicalSummary, sanitizeClinicalSummaryText } from "./clinical-summary.js";

describe("clinical summary parsing", () => {
  it("normalizes Markdown section headings into stable clinical sections", () => {
    const summary = [
      "**Chief Complaint**: Fever for two days.",
      "",
      "## History of Present Illness",
      "Patient reports chills and fatigue.",
      "",
      "- Plan: Fluids and paracetamol.",
      "",
      "Follow up - Return if fever persists."
    ].join("\n");

    expect(parseClinicalSummary(summary)).toEqual([
      { title: "Chief Complaint", body: "Fever for two days." },
      { title: "History of Present Illness", body: "Patient reports chills and fatigue." },
      { title: "Treatment / Prescription", body: "Fluids and paracetamol." },
      { title: "Follow-up Instructions", body: "Return if fever persists." }
    ]);
  });

  it("strips raw Markdown markers from saved summary text", () => {
    expect(
      sanitizeClinicalSummaryText("**Chief Complaint**: Fever\n\n### Assessment\nLikely viral illness.")
    ).toBe("Chief Complaint\nFever\n\nProvisional Diagnosis\nLikely viral illness.");
  });

  it("keeps legacy paragraph-only summaries readable without Markdown artifacts", () => {
    expect(sanitizeClinicalSummaryText("**Patient improved.**\n\n- Continue hydration.")).toBe(
      "Patient improved.\nContinue hydration."
    );
  });
});
