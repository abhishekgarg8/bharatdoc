import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "lib/server/supabase-recordings-repository.ts"), "utf8");
const deletionSource = readFileSync(resolve(process.cwd(), "lib/server/phi-deletion.ts"), "utf8");

describe("supabase recordings repository source contract", () => {
  it("keeps patient search clinic-scoped while allowing partial patient IDs", () => {
    expect(source).toContain('.eq("clinic_id", clinicId)');
    expect(source).toContain('.ilike("patient_id", patientIdSearchPattern(patientId))');
    expect(source).not.toContain('.eq("patient_id", patientId)');
  });

  it("uses the durable deletion queue for owned recordings and every manifested object", () => {
    expect(source).toContain('async deleteRecordingForDoctor(recordingId: string, doctorId: string)');
    expect(source).toContain('supabase.rpc("request_recording_deletion"');
    expect(deletionSource).toContain('supabase.rpc("claim_deletion_objects"');
    expect(deletionSource).toContain('"release_deletion_object" : "complete_deletion_object"');
    expect(deletionSource).toContain('supabase.rpc("finalize_deletion_receipt"');
  });
});
