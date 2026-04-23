import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUMMARY_PROMPT,
  MAX_CUSTOM_PROMPT_CHARS,
  TRANSCRIPT_PLACEHOLDER,
  renderSummaryPrompt,
  validateSummaryPrompt
} from "./prompts.js";

describe("summary prompt validation", () => {
  it("accepts prompts with the transcript placeholder", () => {
    expect(validateSummaryPrompt(`Summarize ${TRANSCRIPT_PLACEHOLDER}`)).toEqual({
      ok: true,
      prompt: `Summarize ${TRANSCRIPT_PLACEHOLDER}`
    });
  });

  it("rejects missing placeholders", () => {
    expect(validateSummaryPrompt("Summarize this consultation")).toEqual({
      ok: false,
      reason: "missing_transcript_placeholder"
    });
  });

  it("rejects empty prompts", () => {
    expect(validateSummaryPrompt("  ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects prompts longer than the Phase 1 editor limit", () => {
    const prompt = `${"x".repeat(MAX_CUSTOM_PROMPT_CHARS)} ${TRANSCRIPT_PLACEHOLDER}`;

    expect(validateSummaryPrompt(prompt)).toEqual({ ok: false, reason: "too_long" });
  });

  it("renders the default prompt when no custom prompt exists", () => {
    expect(renderSummaryPrompt(null, "patient transcript")).toBe(
      DEFAULT_SUMMARY_PROMPT.replaceAll(TRANSCRIPT_PLACEHOLDER, "patient transcript")
    );
  });
});
