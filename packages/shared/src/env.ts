import { z } from "zod";

const nonEmpty = z.string().min(1);

export const WebEnvSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    NEXT_PUBLIC_ENABLE_DEMO_MODE: z.enum(["true", "false"]).default("false"),
    NEXT_PUBLIC_RAILWAY_WORKER_URL: z.string().url(),
    RAILWAY_WORKER_URL: z.string().url(),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
    SUPABASE_JWT_SECRET: nonEmpty.optional(),
    RESEND_API_KEY: nonEmpty.optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
    RESEND_FROM_NAME: nonEmpty.default("BharatDoc"),
    RESEND_SENDING_DOMAIN: nonEmpty.optional()
  })
  .superRefine(({ RESEND_FROM_EMAIL, RESEND_SENDING_DOMAIN }, ctx) => {
    if (RESEND_FROM_EMAIL && RESEND_SENDING_DOMAIN && !RESEND_FROM_EMAIL.endsWith(`@${RESEND_SENDING_DOMAIN}`)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "RESEND_FROM_EMAIL must use RESEND_SENDING_DOMAIN",
        path: ["RESEND_FROM_EMAIL"]
      });
    }
  });

export const WorkerEnvSchema = z.object({
  OPENAI_API_KEY: nonEmpty,
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  SUPABASE_JWT_SECRET: nonEmpty.optional(),
  PORT: z.coerce.number().int().positive().default(8080),
  OPENAI_TRANSCRIPTION_MODEL: nonEmpty.default("gpt-4o-mini-transcribe"),
  OPENAI_SUMMARY_MODEL: nonEmpty.default("gpt-4o-mini"),
  WORKER_CORS_ORIGINS: nonEmpty.default(
    "https://bharatdoc-web.vercel.app,http://localhost:3000,http://127.0.0.1:3000"
  )
});

export type WebEnv = z.infer<typeof WebEnvSchema>;
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function parseWebEnv(input: NodeJS.ProcessEnv): WebEnv {
  return WebEnvSchema.parse(input);
}

export function parseWorkerEnv(input: NodeJS.ProcessEnv): WorkerEnv {
  return WorkerEnvSchema.parse(input);
}
