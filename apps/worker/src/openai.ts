import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { HttpError } from "./http-errors.js";
import type { SummaryClient, TranscriptionClient } from "./types.js";

export function createOpenAISummaryClient(apiKey: string, model: string): SummaryClient {
  const openai = new OpenAI({ apiKey });

  return {
    async summarize(input): Promise<string> {
      const result = await openai.chat.completions.create(
        {
          model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You generate concise, factual clinical documentation from doctor-patient consultation transcripts."
            },
            { role: "user", content: input.prompt }
          ]
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
      );
      const summary = result.choices[0]?.message?.content?.trim();

      if (!summary) {
        throw new HttpError(502, "Summary provider returned an empty response.", "SUMMARY_EMPTY");
      }

      return summary;
    }
  };
}

export function createOpenAITranscriptionClient(apiKey: string, model: string): TranscriptionClient {
  const openai = new OpenAI({ apiKey });

  return {
    async transcribe(input): Promise<string> {
      const file = await toFile(input.audio, input.filename, { type: input.mimeType });
      const params = {
        file,
        model,
        stream: false as const
      };
      const result = await openai.audio.transcriptions.create(
        input.language === "hi" || input.language === "en" ? { ...params, language: input.language } : params,
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined
      );
      const transcript = result.text?.trim();

      if (!transcript) {
        throw new HttpError(502, "Transcription provider returned an empty response.", "TRANSCRIPT_EMPTY");
      }

      return transcript;
    }
  };
}
