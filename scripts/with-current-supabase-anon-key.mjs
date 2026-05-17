import { execFileSync, spawnSync } from "node:child_process";

function usage() {
  console.error(
    "Usage: node --env-file=.env scripts/with-current-supabase-anon-key.mjs -- <command> [args...]",
  );
}

function projectRefFromEnv() {
  if (process.env.SUPABASE_PROJECT_REF?.trim()) {
    return process.env.SUPABASE_PROJECT_REF.trim();
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error(
      "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required to infer the project ref.",
    );
  }

  const hostname = new URL(supabaseUrl).hostname;
  const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);

  if (!match) {
    throw new Error(
      `Unable to infer Supabase project ref from ${hostname}. Set SUPABASE_PROJECT_REF.`,
    );
  }

  return match[1];
}

function parseJsonArray(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Supabase CLI did not return JSON API key data.");
  }

  return JSON.parse(output.slice(start, end + 1));
}

function currentAnonKey(projectRef) {
  const output = execFileSync(
    "pnpm",
    [
      "dlx",
      "supabase@2.90.0",
      "projects",
      "api-keys",
      "--project-ref",
      projectRef,
      "-o",
      "json",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const keys = parseJsonArray(output);
  const anon = keys.find(
    (key) =>
      key.name === "anon" ||
      key.name === "anon key" ||
      key.api_key_type === "anon",
  );
  const value = anon?.api_key ?? anon?.key ?? anon?.value;

  if (!value) {
    throw new Error(
      `Unable to find anon key for Supabase project ${projectRef}.`,
    );
  }

  return value;
}

const separator = process.argv.indexOf("--");

if (separator === -1 || separator === process.argv.length - 1) {
  usage();
  process.exit(2);
}

const command = process.argv[separator + 1];
const args = process.argv.slice(separator + 2);
const projectRef = projectRefFromEnv();
const anonKey = currentAnonKey(projectRef);

console.error(
  `Using current Supabase anon key for project ${projectRef} in child process only.`,
);

const child = spawnSync(command, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  },
});

if (child.error) {
  throw child.error;
}

process.exit(child.status ?? 1);
