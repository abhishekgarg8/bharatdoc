import OpenAI, { toFile } from "openai";
import type { TranscriptionClient } from "./types.js";
import { transcriptionLanguageHint } from "./transcription.js";

export function createOpenAITranscriptionClient(apiKey: string, model: string): TranscriptionClient {
  const openai = new OpenAI({ apiKey });

  return {
    async transcribe(input): Promise<string> {
      const file = await toFile(
        input.audio.buffer,
        input.audio.originalname || "recording.webm",
        { type: input.audio.mimetype || "application/octet-stream" }
      );
      const language = transcriptionLanguageHint(input.language);
      const result = await openai.audio.transcriptions.create({
        file,
        model,
        ...(language ? { language } : {})
      });

      return result.text;
    }
  };
}
