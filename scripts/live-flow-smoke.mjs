import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { createClient } = require("@supabase/supabase-js");

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function createSupabaseClients() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return {
    admin: createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false
      }
    }),
    password: createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false
      }
    })
  };
}

async function createPasswordToken(clients, emailPrefix) {
  const email = `${emailPrefix.trim().toLowerCase()}@bharatdoc.test`;
  const password = `Smoke-${emailPrefix}-${randomUUID()}`;
  const { error: createError } = await clients.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      email
    }
  });

  if (createError) {
    throw new Error(`Unable to create Supabase smoke user ${email}: ${createError.message}`);
  }

  const { data, error: signInError } = await clients.password.auth.signInWithPassword({ email, password });

  if (signInError || !data.session?.access_token) {
    throw new Error(`Unable to sign in Supabase smoke user ${email}: ${signInError?.message ?? "missing session"}`);
  }

  return data.session.access_token;
}

async function apiRequest(baseUrl, pathname, { method = "GET", token, json, formData } = {}) {
  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body;

  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (formData) {
    body = formData;
  }

  const response = await fetch(new URL(pathname, baseUrl), {
    method,
    headers,
    body
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function createSpeechAudio(runId) {
  if (process.env.LIVE_FLOW_AUDIO_FILE) {
    return process.env.LIVE_FLOW_AUDIO_FILE;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "bharatdoc-live-flow-"));
  const aiffPath = path.join(tempDir, `${runId}.aiff`);
  const wavPath = path.join(tempDir, `${runId}.wav`);

  try {
    execFileSync("say", ["-v", "Samantha", "-o", aiffPath, "Patient has fever for two days and mild cough."], {
      stdio: "ignore"
    });
    execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", aiffPath, wavPath], {
      stdio: "ignore"
    });
  } catch (error) {
    throw new Error(
      "Unable to generate smoke-test speech audio with macOS speech tools. Set LIVE_FLOW_AUDIO_FILE to a valid WAV/WebM file."
    );
  }

  process.on("exit", () => {
    void rm(tempDir, { recursive: true, force: true });
  });

  return wavPath;
}

async function main() {
  const baseUrl = process.env.LIVE_FLOW_WEB_URL ?? process.env.STAGING_WEB_URL ?? "http://127.0.0.1:3000";
  const runAiFlow = process.env.LIVE_FLOW_SKIP_AI !== "1";
  const clients = createSupabaseClients();
  const runId = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const ownerEmailPrefix = `smoke_owner_${runId}`.toLowerCase();
  const doctorEmailPrefix = `smoke_doctor_${runId}`.toLowerCase();

  console.log(`Live flow smoke against ${baseUrl}`);

  const [ownerToken, doctorToken] = await Promise.all([
    createPasswordToken(clients, ownerEmailPrefix),
    createPasswordToken(clients, doctorEmailPrefix)
  ]);

  const ownerProfile = {
    name: `Dr. Smoke Owner ${runId.slice(-4)}`,
    specialization: "General Physician"
  };
  const ownerRegistration = await apiRequest(baseUrl, "/api/auth/register", {
    method: "POST",
    token: ownerToken,
    json: {
      mode: "create_clinic",
      profile: ownerProfile,
      clinic: {
        name: `Smoke Clinic ${runId.slice(-6)}`,
        address: "24 Baner Road, Pune 411045"
      }
    }
  });
  const clinicCode = ownerRegistration?.clinic?.clinic_code;

  if (!clinicCode) {
    throw new Error("Owner registration did not return a clinic code.");
  }

  const doctorProfile = {
    name: `Dr. Smoke Join ${runId.slice(-4)}`,
    specialization: "Pediatrician"
  };
  await apiRequest(baseUrl, "/api/auth/register", {
    method: "POST",
    token: doctorToken,
    json: {
      mode: "join_clinic",
      profile: doctorProfile,
      clinic_code: clinicCode
    }
  });

  const pending = await apiRequest(baseUrl, "/api/clinic/join-requests", {
    token: ownerToken
  });
  const joinRequest = pending.pending.find((request) => request.doctor.name === doctorProfile.name);

  if (!joinRequest) {
    throw new Error("Doctor join request was not found in owner pending approvals.");
  }

  await apiRequest(baseUrl, `/api/clinic/join-requests/${joinRequest.id}/approve`, {
    method: "POST",
    token: ownerToken
  });

  const me = await apiRequest(baseUrl, "/api/me", {
    token: doctorToken
  });
  const preferences = await apiRequest(baseUrl, "/api/settings/preferences", {
    token: doctorToken
  });

  if (me.doctor.account_status !== "active") {
    throw new Error(`Expected approved doctor to be active, received ${me.doctor.account_status}.`);
  }

  console.log(`Auth smoke passed for clinic ${clinicCode}.`);
  console.log(`Doctor preferences language: ${preferences.preferences.transcription_lang}`);

  if (!runAiFlow) {
    return;
  }

  const audioPath = await createSpeechAudio(runId);
  const audioBuffer = await readFile(audioPath);
  const recordingId = randomUUID();
  const patientId = `P-SMOKE-${runId.slice(-6).toUpperCase()}`;

  await apiRequest(baseUrl, "/api/recordings", {
    method: "POST",
    token: doctorToken,
    json: {
      id: recordingId,
      patient_id: patientId,
      label: "Live smoke consultation",
      duration_seconds: 8,
      recorded_at: new Date().toISOString()
    }
  });

  const transcriptionForm = new FormData();
  transcriptionForm.set(
    "audio",
    new File([audioBuffer], path.basename(audioPath), {
      type: "audio/wav"
    })
  );

  const transcription = await apiRequest(baseUrl, `/api/recordings/${recordingId}/transcription`, {
    method: "POST",
    token: doctorToken,
    formData: transcriptionForm
  });
  const summary = await apiRequest(baseUrl, `/api/recordings/${recordingId}/summary`, {
    method: "POST",
    token: doctorToken
  });
  const pdf = await apiRequest(baseUrl, `/api/recordings/${recordingId}/pdf`, {
    method: "POST",
    token: doctorToken
  });

  console.log(`Transcription status: ${transcription.status}`);
  console.log(`Summary status: ${summary.status}`);
  console.log(`PDF status: ${pdf.status}`);
  console.log("Live AI flow smoke passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
