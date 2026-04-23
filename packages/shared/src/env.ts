import { z } from "zod";

const nonEmpty = z.string().min(1);

export const WebEnvSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: nonEmpty,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: nonEmpty,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: nonEmpty,
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
  RAILWAY_WORKER_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  FIREBASE_ADMIN_SDK_JSON: nonEmpty
});

export const WorkerEnvSchema = z.object({
  OPENAI_API_KEY: nonEmpty,
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  FIREBASE_ADMIN_SDK_JSON: nonEmpty,
  PORT: z.coerce.number().int().positive().default(8080),
  OPENAI_TRANSCRIPTION_MODEL: nonEmpty.default("gpt-4o-mini-transcribe"),
  OPENAI_SUMMARY_MODEL: nonEmpty.default("gpt-4o-mini")
});

export type WebEnv = z.infer<typeof WebEnvSchema>;
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function parseWebEnv(input: NodeJS.ProcessEnv): WebEnv {
  return WebEnvSchema.parse(input);
}

export function parseWorkerEnv(input: NodeJS.ProcessEnv): WorkerEnv {
  return WorkerEnvSchema.parse(input);
}
