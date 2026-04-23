export const TRANSCRIPT_PLACEHOLDER = "{{transcript}}";
export const MAX_CUSTOM_PROMPT_CHARS = 2000;

export const DEFAULT_SUMMARY_PROMPT = `You are a clinical documentation assistant. Based on the following doctor-patient conversation transcript, generate a structured clinical summary with these sections:

- Chief Complaint
- History of Present Illness
- Key Findings / Symptoms Mentioned
- Provisional Diagnosis (if mentioned)
- Treatment / Prescription (if mentioned)
- Follow-up Instructions (if mentioned)
- Additional Notes

Be concise, clinical, and factual. Do not infer anything not explicitly mentioned.

Transcript:
{{transcript}}`;

export type PromptValidationResult =
  | { ok: true; prompt: string }
  | { ok: false; reason: "missing_transcript_placeholder" | "too_long" | "empty" };

export function validateSummaryPrompt(prompt: string): PromptValidationResult {
  const trimmed = prompt.trim();

  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }

  if (trimmed.length > MAX_CUSTOM_PROMPT_CHARS) {
    return { ok: false, reason: "too_long" };
  }

  if (!trimmed.includes(TRANSCRIPT_PLACEHOLDER)) {
    return { ok: false, reason: "missing_transcript_placeholder" };
  }

  return { ok: true, prompt: trimmed };
}

export function renderSummaryPrompt(prompt: string | null | undefined, transcript: string): string {
  const selectedPrompt = prompt?.trim() ? prompt : DEFAULT_SUMMARY_PROMPT;
  return selectedPrompt.replaceAll(TRANSCRIPT_PLACEHOLDER, transcript);
}
