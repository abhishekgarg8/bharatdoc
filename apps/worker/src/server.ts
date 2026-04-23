import { createApp } from "./app.js";
import { workerEnv } from "./env.js";
import { createFirebaseTokenVerifier } from "./firebase.js";
import { createDoctorRepository } from "./repositories.js";
import { supabase } from "./supabase.js";

const app = createApp({
  tokenVerifier: createFirebaseTokenVerifier(workerEnv.FIREBASE_ADMIN_SDK_JSON),
  doctors: createDoctorRepository(supabase)
});

app.listen(workerEnv.PORT, () => {
  console.log(`BharatDoc worker listening on :${workerEnv.PORT}`);
});
