import { describe, expect, it } from "vitest";
import { parseWebEnv, parseWorkerEnv } from "./env.js";

describe("environment validation", () => {
  it("parses required web app environment values", () => {
    expect(
      parseWebEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.com",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        NEXT_PUBLIC_SITE_URL: "https://bharatdoc-web.vercel.app/",
        RAILWAY_WORKER_URL: "https://worker.example.com",
        SUPABASE_URL: "https://supabase.example.com",
        SUPABASE_SERVICE_ROLE_KEY: "service-role"
      })
    ).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.com",
      NEXT_PUBLIC_SITE_URL: "https://bharatdoc-web.vercel.app/",
      NEXT_PUBLIC_ENABLE_DEMO_MODE: "false"
    });
  });

  it("accepts explicit local demo mode only as a boolean-like flag", () => {
    expect(
      parseWebEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example.com",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        NEXT_PUBLIC_ENABLE_DEMO_MODE: "true",
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
      OPENAI_SUMMARY_MODEL: "gpt-4o-mini"
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
