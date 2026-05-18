import { AccessError } from "@bharatdoc/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, errorResponse, toAppError } from "@/lib/server/errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server error mapping", () => {
  it("keeps explicit app errors unchanged", () => {
    const error = new AppError(404, "Missing profile.", "PROFILE_NOT_FOUND");

    expect(toAppError(error)).toBe(error);
  });

  it("maps shared access errors to API statuses", () => {
    const error = toAppError(new AccessError("Doctor account is not active.", "ACCOUNT_INACTIVE"));

    expect(error).toMatchObject({
      status: 403,
      code: "ACCOUNT_INACTIVE",
      message: "Doctor account is not active."
    });
  });

  it("sanitizes unexpected error messages in API responses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = errorResponse(new Error("Supabase service role secret leaked"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Internal server error."
    });
    expect(body.error.message).not.toContain("service role");
    expect(body.error.request_id).toEqual(expect.any(String));
    expect(console.error).toHaveBeenCalledWith(
      "api.request.failed",
      expect.objectContaining({
        request_id: body.error.request_id,
        error_message: "Internal server error.",
        internal_error_message: "Supabase service role secret leaked"
      })
    );
  });

  it("keeps expected app error responses user-readable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = errorResponse(new AppError(404, "Hospital was not found.", "CLINIC_NOT_FOUND"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({
      code: "CLINIC_NOT_FOUND",
      message: "Hospital was not found."
    });
    expect(body.error.request_id).toEqual(expect.any(String));
    expect(console.warn).toHaveBeenCalledWith(
      "api.request.rejected",
      expect.objectContaining({
        request_id: body.error.request_id,
        error_code: "CLINIC_NOT_FOUND"
      })
    );
    expect(body).toMatchObject({
      error: {
        code: "CLINIC_NOT_FOUND",
        message: "Hospital was not found."
      }
    });
  });
});
