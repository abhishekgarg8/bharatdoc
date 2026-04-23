import { createApp } from "./app.js";
import { workerEnv } from "./env.js";
import { createFirebaseTokenVerifier } from "./firebase.js";
import { createOpenAITranscriptionClient } from "./openai.js";
import {
  createDoctorRepository,
  createRecordingProcessingRepository,
  createSupabaseAudioStorage
} from "./repositories.js";
import { supabase } from "./supabase.js";

const app = createApp({
  tokenVerifier: createFirebaseTokenVerifier(workerEnv.FIREBASE_ADMIN_SDK_JSON),
  doctors: createDoctorRepository(supabase),
  recordings: createRecordingProcessingRepository(supabase),
  audioStorage: createSupabaseAudioStorage(supabase),
  transcriptionClient: createOpenAITranscriptionClient(workerEnv.OPENAI_API_KEY, workerEnv.OPENAI_TRANSCRIPTION_MODEL)
});

app.listen(workerEnv.PORT, () => {
  console.log(`BharatDoc worker listening on :${workerEnv.PORT}`);
});
