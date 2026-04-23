import { createApp } from "./app.js";
import { workerEnv } from "./env.js";
import { createFirebaseTokenVerifier } from "./firebase.js";
import { createOpenAISummaryClient, createOpenAITranscriptionClient } from "./openai.js";
import { createSimplePdfRenderer } from "./pdf-renderer.js";
import {
  createClinicRepository,
  createDoctorRepository,
  createRecordingProcessingRepository,
  createSupabaseAudioStorage,
  createSupabasePdfStorage
} from "./repositories.js";
import { supabase } from "./supabase.js";

const app = createApp({
  tokenVerifier: createFirebaseTokenVerifier(workerEnv.FIREBASE_ADMIN_SDK_JSON),
  doctors: createDoctorRepository(supabase),
  clinics: createClinicRepository(supabase),
  recordings: createRecordingProcessingRepository(supabase),
  transcriptionClient: createOpenAITranscriptionClient(workerEnv.OPENAI_API_KEY, workerEnv.OPENAI_TRANSCRIPTION_MODEL),
  summaryClient: createOpenAISummaryClient(workerEnv.OPENAI_API_KEY, workerEnv.OPENAI_SUMMARY_MODEL),
  audioStorage: createSupabaseAudioStorage(supabase),
  pdfRenderer: createSimplePdfRenderer(),
  pdfStorage: createSupabasePdfStorage(supabase)
});

app.listen(workerEnv.PORT, () => {
  console.log(`BharatDoc worker listening on :${workerEnv.PORT}`);
});
