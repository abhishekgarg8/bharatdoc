import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyRequestUser: vi.fn(),
  findDoctorByAuthUid: vi.fn(),
  findClinicById: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  verifyRequestUser: mocks.verifyRequestUser,
}));
vi.mock("@/lib/server/supabase-auth", () => ({
  createSupabaseAuthVerifier: vi.fn(() => ({})),
}));
vi.mock("@/lib/server/supabase", () => ({
  createSupabaseServerClient: vi.fn(() => ({})),
}));
vi.mock("@/lib/server/supabase-onboarding-repository", () => ({
  createSupabaseOnboardingRepository: vi.fn(() => ({
    findDoctorByAuthUid: mocks.findDoctorByAuthUid,
    findClinicById: mocks.findClinicById,
  })),
}));

import { GET } from "@/app/api/me/route";

const doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "auth-user",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "doctor",
  account_status: "active",
  name: "Dr. Nisha",
  specialization: "General",
  phone: "+919999999999",
  custom_prompt: "private",
  profile_photo_path: null,
  transcription_lang: "auto",
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("GET /api/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyRequestUser.mockResolvedValue({ uid: "auth-user" });
    mocks.findDoctorByAuthUid.mockResolvedValue(doctor);
    mocks.findClinicById.mockResolvedValue({
      id: doctor.clinic_id,
      name: "Care Hospital",
      clinic_code: "CARE42",
      address: "private address",
      logo_storage_path: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns only canonical minimum doctor and clinic bootstrap fields with no-store", async () => {
    const response = await GET(
      new Request("https://bharatdoc.example/api/me", {
        headers: { Authorization: "Bearer token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(await response.json()).toEqual({
      doctor: {
        id: doctor.id,
        authUserId: doctor.firebase_uid,
        clinicId: doctor.clinic_id,
        role: doctor.role,
        accountStatus: doctor.account_status,
        name: doctor.name,
      },
      clinic: { id: doctor.clinic_id, name: "Care Hospital" },
    });
  });

  it("returns a null clinic without querying one for unassigned doctors", async () => {
    mocks.findDoctorByAuthUid.mockResolvedValue({ ...doctor, clinic_id: null });

    const response = await GET(new Request("https://bharatdoc.example/api/me"));

    expect((await response.json()).clinic).toBeNull();
    expect(mocks.findClinicById).not.toHaveBeenCalled();
  });

  it("marks auth errors no-store too", async () => {
    mocks.verifyRequestUser.mockRejectedValue(new Error("bad token"));

    const response = await GET(new Request("https://bharatdoc.example/api/me"));

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });
});
