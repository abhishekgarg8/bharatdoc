import { describe, expect, it } from "vitest";
import { parseWebEnv, parseWorkerEnv } from "./env.js";

describe("environment validation", () => {
  it("parses required web app environment values", () => {
    expect(
      parseWebEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.com",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        NEXT_PUBLIC_SITE_URL: "https://bharatdoc-web.vercel.app/",
        NEXT_PUBLIC_RAILWAY_WORKER_URL: "https://worker.example.com",
        RAILWAY_WORKER_URL: "https://worker.example.com",
        SUPABASE_URL: "https://supabase.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        RESEND_API_KEY: "re_test",
        RESEND_FROM_EMAIL: "hello@send.example.com",
        RESEND_FROM_NAME: "BharatDoc",
        RESEND_SENDING_DOMAIN: "send.example.com"
      })
    ).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.com",
      NEXT_PUBLIC_SITE_URL: "https://bharatdoc-web.vercel.app/",
      NEXT_PUBLIC_ENABLE_DEMO_MODE: "false",
      RESEND_FROM_EMAIL: "hello@send.example.com",
      RESEND_SENDING_DOMAIN: "send.example.com"
    });
  });

  it("defaults the Resend sender name before email delivery is configured", () => {
    expect(
      parseWebEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.com",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        NEXT_PUBLIC_RAILWAY_WORKER_URL: "https://worker.example.com",
        RAILWAY_WORKER_URL: "https://worker.example.com",
        SUPABASE_URL: "https://supabase.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "service-role"
      })
    ).toMatchObject({
      RESEND_FROM_NAME: "BharatDoc"
    });
  });

  it("rejects a Resend sender outside the verified sending domain", () => {
    expect(() =>
      parseWebEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.com",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        NEXT_PUBLIC_RAILWAY_WORKER_URL: "https://worker.example.com",
        RAILWAY_WORKER_URL: "https://worker.example.com",
        SUPABASE_URL: "https://supabase.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        RESEND_FROM_EMAIL: "hello@example.com",
        RESEND_SENDING_DOMAIN: "send.example.com"
      })
    ).toThrow();
  });

  it("accepts explicit local demo mode only as a boolean-like flag", () => {
    expect(
      parseWebEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.com",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        NEXT_PUBLIC_ENABLE_DEMO_MODE: "true",
        NEXT_PUBLIC_RAILWAY_WORKER_URL: "https://worker.example.com",
        RAILWAY_WORKER_URL: "https://worker.example.com",
        SUPABASE_URL: "https://supabase.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "service-role"
      })
    ).toMatchObject({
      NEXT_PUBLIC_ENABLE_DEMO_MODE: "true"
    });

    expect(() =>
      parseWebEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.com",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        NEXT_PUBLIC_ENABLE_DEMO_MODE: "1",
        NEXT_PUBLIC_RAILWAY_WORKER_URL: "https://worker.example.com",
        RAILWAY_WORKER_URL: "https://worker.example.com",
        SUPABASE_URL: "https://supabase.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "service-role"
      })
    ).toThrow();
  });

  it("defaults worker model settings", () => {
    expect(
      parseWorkerEnv({
        OPENAI_API_KEY: "openai",
        SUPABASE_URL: "https://supabase.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "service-role"
      })
    ).toMatchObject({
      PORT: 8080,
      OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
      OPENAI_SUMMARY_MODEL: "gpt-4o-mini",
      TRANSCRIPTION_CHUNK_SESSIONS_ENABLED: "false",
      WORKER_CORS_ORIGINS: "https://bharatdoc-web.vercel.app,http://localhost:3000,http://127.0.0.1:3000",
      WORKER_QUEUE_ENABLED: "false",
      WORKER_QUEUE_TRANSCRIPTION: "false",
      WORKER_QUEUE_SUMMARY: "false",
      WORKER_QUEUE_PDF: "false",
      WORKER_QUEUE_POLL_MS: 1000,
      WORKER_QUEUE_BATCH_SIZE: 5,
      WORKER_QUEUE_WORKER_ID: "bharatdoc-worker"
    });
  });

  it("parses explicit worker queue rollout flags", () => {
    expect(
      parseWorkerEnv({
        OPENAI_API_KEY: "openai",
        SUPABASE_URL: "https://supabase.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        WORKER_QUEUE_ENABLED: "true",
        WORKER_QUEUE_SUMMARY: "true",
        WORKER_QUEUE_POLL_MS: "250",
        WORKER_QUEUE_BATCH_SIZE: "2",
        WORKER_QUEUE_WORKER_ID: "railway-worker-1"
      })
    ).toMatchObject({
      WORKER_QUEUE_ENABLED: "true",
      WORKER_QUEUE_SUMMARY: "true",
      WORKER_QUEUE_POLL_MS: 250,
      WORKER_QUEUE_BATCH_SIZE: 2,
      WORKER_QUEUE_WORKER_ID: "railway-worker-1"
    });
  });

  it("accepts an optional Supabase JWT secret for local token verification", () => {
    expect(
      parseWebEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.com",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        NEXT_PUBLIC_RAILWAY_WORKER_URL: "https://worker.example.com",
        RAILWAY_WORKER_URL: "https://worker.example.com",
        SUPABASE_URL: "https://supabase.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        SUPABASE_JWT_SECRET: "jwt-secret"
      })
    ).toMatchObject({
      SUPABASE_JWT_SECRET: "jwt-secret"
    });

    expect(
      parseWorkerEnv({
        OPENAI_API_KEY: "openai",
        SUPABASE_URL: "https://supabase.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        SUPABASE_JWT_SECRET: "jwt-secret"
      })
    ).toMatchObject({
      SUPABASE_JWT_SECRET: "jwt-secret"
    });
  });

  it("rejects invalid URLs", () => {
    expect(() =>
      parseWorkerEnv({
        OPENAI_API_KEY: "openai",
        SUPABASE_URL: "not-a-url",
        SUPABASE_SERVICE_ROLE_KEY: "service-role"
      })
    ).toThrow();
  });
});
